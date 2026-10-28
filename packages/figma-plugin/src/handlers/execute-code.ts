import {
  pitfallHint,
  RelaiError,
  type LawNotice,
  type LawNoticeMessage,
  type PageRef,
  type Violation,
} from "@figma-relai/shared";
import { registerHandler } from "../dispatcher.js";
import { fitResult, serializeResult } from "../utils/serialize-result.js";
import {
  makeRelai,
  lintCreatedNodes,
  lintComponentSets,
  type LintTarget,
} from "../utils/sandbox-helpers.js";
import { ancestorComponentSet, collectComponentSet } from "../utils/component-set-scan.js";
import { isScopeLocked, isInLockedScope, scopeLockState, nodeIdsInText } from "../write-guard.js";
import { guardedNodesAmong } from "./guards.js";
import { lawRestoredWarning, type VoiceSnap, type Walls } from "../wall-core.js";

// The execute_figma escape hatch: runs AI-authored JavaScript against the
// Plugin API. Gated by the designer's "Allow code execution" toggle, read from
// the plugin's own copy of the walls. After each script the walls are checked
// against storage, and nodes it reached across a wall come back in the result.

// Calls that change the document. Used only to decide whether silence in the
// return value is worth a nudge, so over-matching costs a sentence and
// under-matching costs a missed check.
const MUTATING_CALL =
  /\.(?:clone|remove|appendChild|insertChild|createInstance|swapComponent|setProperties|resetOverrides|setBoundVariable|setExplicitVariableModeForCollection|editComponentProperty|addComponentProperty|deleteComponentProperty|resize)\s*\(|figma\.(?:create|combineAsVariants|group|union|flatten)/;

// Most node ids one violation lists
const MAX_VIOLATION_IDS = 20;

/**
 * What execute_code needs from the plugin's walls. The plugin registers it
 * once at load with setCodeRunWalls; execute_code never reads storage itself.
 */
export interface CodeRunWalls {
  // The plugin's own copy of this file's walls (never storage)
  currentWalls(): Walls;
  // Fingerprints of the voice data, taken synchronously before a script runs
  snapshotVoice(): VoiceSnap;
  // A script starts and ends: designer-only panel messages are refused while
  // one runs and for a few seconds after
  scriptStarted(): void;
  scriptEnded(): void;
  // The after_code check: puts back walls the script loosened and reports
  // voice data it changed. Returns the notices; execute_code tells the agent
  // and the panel, so this does not post them.
  checkpoint(where: "after_code", voicePre: VoiceSnap): Promise<LawNotice[]>;
}

let codeRunWalls: CodeRunWalls | null = null;

export function setCodeRunWalls(walls: CodeRunWalls): void {
  codeRunWalls = walls;
}

function wallsForCode(): CodeRunWalls {
  if (!codeRunWalls) throw new Error("execute_code ran before the plugin registered its walls (setCodeRunWalls)");
  return codeRunWalls;
}

// The panel shows these in its feed until the designer dismisses them
function postLawNotice(commandId: unknown, notices: LawNotice[]): void {
  if (notices.length === 0) return;
  const message: LawNoticeMessage = {
    type: "law-notice",
    ...(typeof commandId === "string" ? { commandId } : {}),
    command: "execute_code",
    notices,
  };
  figma.ui.postMessage(message);
}

async function pageRefOf(nodeId: string): Promise<PageRef | null> {
  let node = (await figma.getNodeByIdAsync(nodeId)) as BaseNode | null;
  while (node && node.type !== "PAGE") node = node.parent;
  return node ? { id: node.id, name: node.name } : null;
}

/**
 * Nodes a script touched that sit outside the scope lock or on a no-go page,
 * as warnings for the agent and violations for the result and the panel.
 */
async function wallBreaches(nodeIds: Iterable<string>): Promise<{ warnings: string[]; violations: Violation[] }> {
  const ids = [...nodeIds];
  const warnings: string[] = [];
  const violations: Violation[] = [];
  // Scope lock can't intercept arbitrary code up front, so it lints after the
  // fact: touched nodes outside the locked selection get a loud warning.
  if (isScopeLocked()) {
    const outside: string[] = [];
    for (const nodeId of ids) {
      if (!(await isInLockedScope(nodeId))) outside.push(nodeId);
    }
    if (outside.length > 0) {
      const { names } = scopeLockState();
      warnings.push(
        `SCOPE VIOLATION: ${outside.length} node(s) (${outside.slice(0, 5).join(", ")}) are outside "${names.join('", "')}", which the designer restricted edits to. Undo those changes and stay within the locked selection.`
      );
      violations.push({ kind: "scope", count: outside.length, nodeIds: outside.slice(0, MAX_VIOLATION_IDS) });
    }
  }

  // Same blind spot, same remedy: enforcePageGuards catches execute_code only
  // when the current page is guarded, so code that reaches across to another
  // no-go zone is reported here rather than passing silently.
  const guardHits = await guardedNodesAmong(ids);
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
    const pageRefs = new Map<string, PageRef>();
    for (const hit of guardHits) {
      const ref = await pageRefOf(hit.nodeId);
      if (ref) pageRefs.set(ref.id, ref);
    }
    violations.push({
      kind: "guard",
      count: guardHits.length,
      nodeIds: guardHits.slice(0, MAX_VIOLATION_IDS).map((h) => h.nodeId),
      pages: [...pageRefs.values()],
    });
  }
  return { warnings, violations };
}

registerHandler("execute_code", async (params) => {
  const walls = wallsForCode();
  if (!walls.currentWalls().allowCodeExec) {
    throw new RelaiError(
      "code_exec_disabled",
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
    // None of the script ran, so nothing changed
    const message = error instanceof Error ? error.message : String(error);
    const hint = pitfallHint(message);
    throw new RelaiError("script_compile_error", hint ? `${message} — Hint: ${hint}` : message);
  }

  // figma.skipInvisibleInstanceChildren is plugin-wide and outlives the
  // script: one that sets it (a common speed-up) would hide instance
  // sublayers from every later command. Put it back however the script ends.
  const skipInvisible = figma.skipInvisibleInstanceChildren;
  // The script gets the same figma global as the plugin, so it can write the
  // walls' storage directly. Check right after it ends, thrown or not.
  const voicePre = walls.snapshotVoice();
  walls.scriptStarted();
  let value: unknown;
  let failure: { error: unknown } | null = null;
  try {
    value = await fn(figma, capturedConsole, relai);
  } catch (error) {
    failure = { error };
  } finally {
    figma.skipInvisibleInstanceChildren = skipInvisible;
    walls.scriptEnded();
  }
  const law = await walls.checkpoint("after_code", voicePre);
  const restored = lawRestoredWarning(law);

  if (failure) {
    // A script that threw returned nothing, but the nodes it made through the
    // relai helpers before the throw are still checked against the walls
    const breach = await wallBreaches(relaiCreated.map((node) => node?.id).filter((id): id is string => !!id));
    if (breach.violations.length > 0) law.push({ kind: "script_breach", violations: breach.violations });
    postLawNotice(params.commandId, law);
    // Known Plugin API pitfalls get their remedy appended so the AI can
    // self-correct in one round-trip (registry: shared/src/pitfalls.ts).
    // Scripts are not atomic: whatever ran before the throw stays, so the
    // outcome is unknown and the message says so.
    const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
    const hint = pitfallHint(message);
    throw new RelaiError(
      "script_error",
      `${hint ? `${message} — Hint: ${hint}` : message} (Scripts are not atomic: changes made before the error stay in the file.)${restored ? ` ${restored}` : ""}${breach.warnings.map((w) => ` ${w}`).join("")}`
    );
  }

  const serialized = serializeResult(value);
  const asText = JSON.stringify(serialized);
  // A server on protocol 2 keeps the full text itself; main.ts passes the
  // protocol in as callProtocol, absent for older servers
  const protocol = typeof params.callProtocol === "number" ? params.callProtocol : 1;
  const { result, truncated } = fitResult(serialized, asText, protocol);

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

  const { warnings: breachWarnings, violations } = await wallBreaches(lintTargets.keys());
  warnings.push(...breachWarnings);

  if (violations.length > 0) law.push({ kind: "script_breach", violations });
  if (restored) warnings.unshift(restored);
  postLawNotice(params.commandId, law);

  return {
    result,
    logs,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(truncated ? { truncated } : {}),
    ...(law.length > 0 ? { law } : {}),
    ...(violations.length > 0 ? { violations } : {}),
  };
});
