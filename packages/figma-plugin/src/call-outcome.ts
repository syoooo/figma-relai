// How the plugin reports what a command did to the file. Pure, so every
// rule here runs in tests without Figma; main.ts and the multi-item handlers
// call it.
import {
  aggregateOutcome,
  ERROR_DEFAULTS,
  lawRestoredWarning,
  RelaiError,
  type ErrorCode,
  type LawNotice,
  type Outcome,
  type PluginErrorPayload,
  type ResultMeta,
  type RetryClass,
  type WsCallInfo,
} from "@figma-relai/shared";
import type { ApprovalCause } from "./approval-gate.js";
import { wroteNothing } from "./panel-failure.js";

/**
 * Where a command was when it failed.
 * - `preflight`: before its handler ran (unknown command, wrong file,
 *   approval). Nothing was written.
 * - `handler`: inside dispatch, which covers the scope lock and no-go zone
 *   checks as well as the handler itself. Those checks throw coded errors
 *   that say `not_applied`; an uncoded error may have come mid-write.
 * - `after`: the handler finished, then assembling the result failed. The
 *   command did run.
 */
export type Phase = "preflight" | "handler" | "after";

export interface ErrorOutcome {
  code: ErrorCode;
  outcome: Outcome;
  retry: RetryClass;
  partial?: true;
}

// Figma's own internal failure reads like a lost connection. It is not one:
// the plugin is alive and answering, and the command may have started.
const FIGMA_INTERNAL = /Unable to establish connection/i;

/** Classify an error thrown while running a command. */
export function classifyError(error: unknown, ctx: { phase: Phase; write: boolean }): ErrorOutcome {
  if (ctx.phase === "after") {
    const code = error instanceof RelaiError ? error.code : "handler_error";
    return { code, outcome: "applied", retry: "read_canvas_first" };
  }
  if (error instanceof RelaiError) {
    return {
      code: error.code,
      outcome: error.outcome,
      retry: error.retry,
      ...(error.partial ? { partial: true as const } : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const code: ErrorCode = FIGMA_INTERNAL.test(message) ? "figma_internal" : "handler_error";
  // A read that failed changed nothing, nor did a refusal thrown before any
  // write; any other write that failed may have changed part of the file.
  const outcome: Outcome = ctx.phase === "preflight" || !ctx.write || wroteNothing(error) ? "not_applied" : "unknown";
  return { code, outcome, retry: ERROR_DEFAULTS[code].retry };
}

/** The error object sent to the server; nodeId and nodeType are added by the caller. */
export function toErrorPayload(
  error: unknown,
  ctx: { phase: Phase; write: boolean; command: string }
): PluginErrorPayload {
  const message = error instanceof Error ? error.message : String(error);
  return { message, command: ctx.command, ...classifyError(error, ctx) };
}

/** The error for an approval card that ended without a yes. */
export function denialError(cause: ApprovalCause): RelaiError {
  switch (cause) {
    case "timeout":
      return new RelaiError(
        "approval_timeout",
        "Approval timed out: nobody answered the approval card, so the command did not run."
      );
    case "stop":
      return new RelaiError("cancelled", "Stopped by the designer before it ran. Nothing was changed.");
    default:
      return new RelaiError("denied_by_designer", "Denied by designer");
  }
}

/**
 * The plugin's own file check, run before the approval card: refuse unless
 * the live file name equals the one the call expects. The live name is used
 * because the name a peer reported when it joined goes stale on rename.
 */
export function checkExpectedFile(call: WsCallInfo | undefined, liveName: string): RelaiError | null {
  if (typeof call?.expectFile !== "string") return null;
  if (call.expectFile.normalize("NFC") === liveName.normalize("NFC")) return null;
  return new RelaiError(
    "wrong_file",
    `Wrong file: this plugin is open in "${liveName}", not "${call.expectFile}". The command was not run.`
  );
}

// Commands whose result is a list of per-item outcomes
const ITEMIZED = new Set(["batch_execute", "set_multiple_text_contents"]);

/**
 * The outcome of a command that returned normally. A finished command is
 * `applied`; one that reports per-item outcomes aggregates them, so a batch
 * stopped half-way is `applied` and `partial`.
 */
export function resultOutcome(command: string, result: unknown): { outcome: Outcome; partial?: true } {
  if (!ITEMIZED.has(command) || !Array.isArray(result)) return { outcome: "applied" };
  const outcomes = result
    .map((item) => (item as { outcome?: unknown } | null)?.outcome)
    .filter((o): o is Outcome => o === "applied" || o === "not_applied" || o === "unknown");
  if (outcomes.length === 0) return { outcome: "applied" };
  return aggregateOutcome(outcomes);
}

/** Whether a result is an object that can carry the wall notices as its own `law`. */
export function carriesLaw(result: unknown): result is Record<string, unknown> {
  return result !== null && typeof result === "object" && !Array.isArray(result);
}

/**
 * What rides on a successful command result. The wall notices ride here only
 * when the result cannot carry them itself (a batch's array).
 */
export function resultMeta(
  command: string,
  write: boolean,
  result: unknown,
  file: string,
  law: LawNotice[] = []
): ResultMeta {
  return {
    protocol: 2,
    write,
    file,
    ...resultOutcome(command, result),
    ...(law.length > 0 && !carriesLaw(result) ? { law } : {}),
  };
}

/**
 * An object result carries the wall notices as `law`, after any the handler
 * already put there (execute_code's own check), with a warning when this
 * command's checks put something back. Any other result (a batch's array)
 * leaves them to the result metadata.
 */
function withLaw(result: unknown, notices: LawNotice[]): unknown {
  if (notices.length === 0 || !carriesLaw(result)) return result;
  const own = result.law;
  const out: Record<string, unknown> = { ...result, law: [...(Array.isArray(own) ? own : []), ...notices] };
  const warning = lawRestoredWarning(notices);
  if (warning) out.warnings = [...(Array.isArray(out.warnings) ? out.warnings : []), warning];
  return out;
}

/**
 * The wall notices a batch's items carried in their own results (execute_code
 * puts back what its script changed before the batch ends), nested batches
 * included, in item order.
 */
function batchItemLaw(items: unknown[]): LawNotice[] {
  return items.flatMap((item) => {
    const { command, result } = (item ?? {}) as { command?: unknown; result?: unknown };
    if (command === "batch_execute" && Array.isArray(result)) return batchItemLaw(result);
    return carriesLaw(result) && Array.isArray(result.law) ? (result.law as LawNotice[]) : [];
  });
}

/**
 * The fields of a successful command's message to the panel: the result with
 * this command's wall notices, its metadata, and for the panel row the same
 * notices and violations as the result (a batch's array result has no room
 * for them; the row still gets this command's own).
 */
export function toResultPayload(
  result: unknown,
  notices: LawNotice[],
  ctx: { command: string; write: boolean; file: string }
): { result: unknown; meta: ResultMeta; law?: unknown[]; violations?: unknown[] } {
  const out = withLaw(result, notices);
  const field = (key: string) =>
    carriesLaw(out) && Array.isArray(out[key]) ? (out[key] as unknown[]) : undefined;
  const law = field("law") ?? (notices.length > 0 ? notices : undefined);
  const violations = field("violations");
  return {
    result: out,
    // A batch's metadata also carries what its items' own checks put back;
    // the panel row does not, since each item already posted its own
    meta: resultMeta(
      ctx.command,
      ctx.write,
      out,
      ctx.file,
      ctx.command === "batch_execute" && Array.isArray(out) ? [...batchItemLaw(out), ...notices] : notices
    ),
    ...(law ? { law } : {}),
    ...(violations ? { violations } : {}),
  };
}

/** The outcome fields of an item a multi-item command skipped after Stop. */
export const SKIPPED_ITEM: ErrorOutcome = { code: "cancelled", outcome: "not_applied", retry: "needs_human" };

/**
 * The error for a scan that stopped on the designer's Stop. A scan that was
 * also writing has already changed what it fixed so far.
 */
export function scanCancelled(written: number, attempted: number): RelaiError {
  if (written > 0) {
    return new RelaiError(
      "cancelled",
      `Cancelled by designer after ${written} fix(es) were written; those stay in the file.`,
      { outcome: "applied", retry: "read_canvas_first", partial: true }
    );
  }
  if (attempted > 0) {
    return new RelaiError("cancelled", "Cancelled by designer while fixing; a fix may have been written in part.", {
      outcome: "unknown",
      retry: "read_canvas_first",
    });
  }
  return new RelaiError("cancelled", "Cancelled by designer");
}
