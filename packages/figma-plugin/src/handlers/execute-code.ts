import { pitfallHint } from "@figma-relai/shared";
import { registerHandler } from "../dispatcher.js";
import { serializeNode } from "../utils/node-helpers.js";
import {
  makeRelai,
  lintCreatedNodes,
  lintComponentSets,
  type LintTarget,
} from "../utils/sandbox-helpers.js";
import { ancestorComponentSet, collectComponentSet } from "../utils/component-set-scan.js";
import { isScopeLocked, isInLockedScope, scopeLockState, nodeIdsInText } from "../write-guard.js";
import { guardedNodesAmong } from "./guards.js";

// The execute_figma escape hatch: runs AI-authored JavaScript against the
// Plugin API. Gated by the designer's "Allow code execution" plugin setting.

const MAX_RESULT_CHARS = 50000;

// Calls that change the document. Used only to decide whether silence in the
// return value is worth a nudge, so over-matching costs a sentence and
// under-matching costs a missed check.
const MUTATING_CALL =
  /\.(?:clone|remove|appendChild|insertChild|createInstance|swapComponent|setProperties|resetOverrides|setBoundVariable|setExplicitVariableModeForCollection|editComponentProperty|addComponentProperty|deleteComponentProperty|resize)\s*\(|figma\.(?:create|combineAsVariants|group|union|flatten)/;

function looksLikeNode(value: unknown): value is SceneNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SceneNode).id === "string" &&
    typeof (value as SceneNode).type === "string" &&
    "parent" in (value as object)
  );
}

// Make an arbitrary return value JSON-safe: nodes become budgeted summaries,
// symbols (figma.mixed) become "mixed", functions are dropped
function serializeResult(value: unknown): unknown {
  if (looksLikeNode(value)) return serializeNode(value);
  if (Array.isArray(value)) return value.map(serializeResult);
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "symbol") return "mixed";
        if (typeof v === "function") return undefined;
        if (looksLikeNode(v)) return serializeNode(v);
        return v;
      }) ?? "null"
    );
  } catch {
    return String(value);
  }
}

registerHandler("execute_code", async (params) => {
  const settings =
    ((await figma.clientStorage.getAsync("relai.settings")) as
      | { allowCodeExec?: boolean }
      | undefined) ?? {};
  if (settings.allowCodeExec === false) {
    throw new Error(
      'Code execution is disabled. The designer can enable it with the "Allow code execution" toggle in the Relai plugin.'
    );
  }

  const code = params.code as string;
  const logs: string[] = [];
  const capturedConsole = {
    log: (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
    warn: (...args: unknown[]) => capturedConsole.log("[warn]", ...args),
    error: (...args: unknown[]) => capturedConsole.log("[error]", ...args),
  };

  // Per-invocation created-node tracking through relai (deterministic and
  // concurrency-safe — each execute gets its own collector)
  const relaiCreated: LintTarget[] = [];
  const relai = makeRelai(figma, (node) => relaiCreated.push(node as unknown as LintTarget));

  // Wrap in an async function so the code can use await and return values.
  // (Never wrap `figma` in a Proxy — its methods are non-configurable, so a
  // get trap returning wrappers violates Proxy invariants and throws
  // "proxy: inconsistent get".)
  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    fn = new Function(
      "figma",
      "console",
      "relai",
      `"use strict"; return (async () => { ${code}\n })();`
    ) as typeof fn;
  } catch (error) {
    // Compile-time failures (syntax errors, sandbox-VM compiler bugs like
    // "stack underflow" on `for (… of await …)`) deserve hints too
    const message = error instanceof Error ? error.message : String(error);
    const hint = pitfallHint(message);
    throw new Error(hint ? `${message} — Hint: ${hint}` : message);
  }

  let value: unknown;
  try {
    value = await fn(figma, capturedConsole, relai);
  } catch (error) {
    // Known Plugin API pitfalls get their remedy appended so the AI can
    // self-correct in one round-trip (registry: shared/src/pitfalls.ts).
    // NOTE: scripts are NOT atomic — partial changes persist on error.
    const message = error instanceof Error ? error.message : String(error);
    const hint = pitfallHint(message);
    throw new Error(hint ? `${message} — Hint: ${hint}` : message);
  }

  let result = serializeResult(value);
  let truncated = false;
  const asText = JSON.stringify(result);
  if (asText && asText.length > MAX_RESULT_CHARS) {
    result = `${asText.slice(0, MAX_RESULT_CHARS)}… [truncated ${asText.length - MAX_RESULT_CHARS} chars — return a smaller value]`;
    truncated = true;
  }

  // Silent-mistake lint over deterministic sources: nodes relai created plus
  // any node ids the script returned (returning ids is the documented
  // convention, so direct figma.create* flows get covered too)
  const lintTargets = new Map<string, LintTarget>();
  for (const node of relaiCreated) {
    if (node?.id) lintTargets.set(node.id, node);
  }
  const returnedIds = nodeIdsInText(asText ?? "");
  for (const nodeId of returnedIds) {
    if (lintTargets.has(nodeId)) continue;
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      // Scene nodes only. A returned PAGE or DOCUMENT id is data the script
      // reported (a page list, the guards value), not something it edited —
      // and pageOfNode(pageId) answers "itself", so keeping them made every
      // script that merely NAMED a guarded page look like it had written to it.
      if (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
        lintTargets.set(nodeId, node as unknown as LintTarget);
      }
    } catch {
      // Not a real node id — the regex casts a wide net on purpose
    }
  }
  const warnings = lintCreatedNodes([...lintTargets.values()]);

  // Component-set faults are invisible on the canvas, so they are checked on
  // the set the touched nodes belong to rather than on the nodes themselves.
  const sets = new Map<string, ComponentSetNode>();
  for (const nodeId of lintTargets.keys()) {
    if (sets.size >= 3) break;
    try {
      const set = ancestorComponentSet(await figma.getNodeByIdAsync(nodeId));
      if (set && !sets.has(set.id)) sets.set(set.id, set);
    } catch {
      // Stale id from the returned-value regex — nothing to attribute
    }
  }
  if (sets.size > 0) {
    warnings.push(...lintComponentSets([...sets.values()].map(collectComponentSet)));
  }

  // The lint above only sees nodes relai made or the script returned. A script
  // that edits the file and reports prose gets checked by nothing at all —
  // which is exactly how a lost slot ships.
  if (lintTargets.size === 0 && MUTATING_CALL.test(code)) {
    warnings.push(
      "This script changed the file but returned no node ids, so the silent-mistake lint had nothing to check. Return the ids of everything you created or mutated."
    );
  }

  // Scope lock can't intercept arbitrary code up front, so it lints after the
  // fact: touched nodes outside the locked selection get a loud warning.
  if (isScopeLocked()) {
    const outside: string[] = [];
    for (const [nodeId] of lintTargets) {
      if (!(await isInLockedScope(nodeId))) outside.push(nodeId);
    }
    if (outside.length > 0) {
      const { names } = scopeLockState();
      warnings.push(
        `SCOPE VIOLATION: ${outside.length} node(s) (${outside.slice(0, 5).join(", ")}) are outside "${names.join('", "')}", which the designer restricted edits to. Undo those changes and stay within the locked selection.`
      );
    }
  }

  // Same blind spot, same remedy: enforcePageGuards catches execute_code only
  // when the current page is guarded, so code that reaches across to another
  // no-go zone is reported here rather than passing silently.
  const guardHits = await guardedNodesAmong([...lintTargets.keys()]);
  if (guardHits.length > 0) {
    const pages = [...new Set(guardHits.map((h) => h.pageName))];
    warnings.push(
      `GUARD VIOLATION: ${guardHits.length} node(s) (${guardHits
        .slice(0, 5)
        .map((h) => h.nodeId)
        .join(", ")}) live on AI no-go zone(s) "${pages.join(
        '", "'
      )}" the designer declared off-limits. Undo those changes and ask before touching that page.`
    );
  }

  return {
    result,
    logs,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(truncated ? { truncated } : {}),
  };
});
