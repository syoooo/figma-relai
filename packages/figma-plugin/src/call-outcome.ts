// How the plugin reports what a command did to the file. Pure, so every
// rule here runs in tests without Figma; main.ts and the multi-item handlers
// call it.
import {
  aggregateOutcome,
  ERROR_DEFAULTS,
  RelaiError,
  type ErrorCode,
  type Outcome,
  type PluginErrorPayload,
  type ResultMeta,
  type RetryClass,
  type WsCallInfo,
} from "@figma-relai/shared";
import type { ApprovalCause } from "./approval-gate.js";

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
  // A read that failed changed nothing; a write that failed may have
  // changed part of the file before it threw.
  const outcome: Outcome = ctx.phase === "preflight" || !ctx.write ? "not_applied" : "unknown";
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

/** What rides on a successful command result. */
export function resultMeta(command: string, write: boolean, result: unknown, file: string): ResultMeta {
  return { protocol: 2, write, file, ...resultOutcome(command, result) };
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
