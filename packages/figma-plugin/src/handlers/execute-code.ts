import { pitfallHint } from "@figma-relai/shared";
import { registerHandler } from "../dispatcher.js";
import { serializeNode } from "../utils/node-helpers.js";
import { makeRelai, lintCreatedNodes, type LintTarget } from "../utils/sandbox-helpers.js";
import { isScopeLocked, isInLockedScope, scopeLockState } from "../write-guard.js";

// The execute_figma escape hatch: runs AI-authored JavaScript against the
// Plugin API. Gated by the designer's "Allow code execution" plugin setting.

const MAX_RESULT_CHARS = 50000;

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
  const fn = new Function(
    "figma",
    "console",
    "relai",
    `"use strict"; return (async () => { ${code}\n })();`
  );

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
  const returnedIds = [...new Set((asText ?? "").match(/\b\d+:\d+\b/g) ?? [])].slice(0, 20);
  for (const nodeId of returnedIds) {
    if (lintTargets.has(nodeId)) continue;
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node) lintTargets.set(nodeId, node as unknown as LintTarget);
    } catch {
      // Not a real node id — the regex casts a wide net on purpose
    }
  }
  const warnings = lintCreatedNodes([...lintTargets.values()]);

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

  return {
    result,
    logs,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(truncated ? { truncated } : {}),
  };
});
