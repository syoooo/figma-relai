// The call contract: what every tool call reports back, shared by the MCP
// server and the plugin so both ends read one definition.
//
// Compatibility rules for this file:
// - Adding a code, an optional field or a union member is not breaking.
// - Renaming or removing a code, a field or the metadata key is breaking.
// - Codes are lowercase snake_case and never change meaning once published.

import type { ErrorCategory } from "./tool-error.js";

// ── Outcome ─────────────────────────────────────────────────────────

/**
 * Whether the call may have changed the Figma file.
 * - `applied`: the plugin confirmed the command ran to the end. A read that
 *   succeeded is `applied` too: it did run.
 * - `not_applied`: certainly nothing changed (refused before dispatch, or a
 *   read that failed).
 * - `unknown`: something may have changed (timeout, dropped link, Stop that
 *   was not confirmed, a write or script that threw part-way). Read the
 *   canvas before deciding; do not resend blindly.
 */
export type Outcome = "applied" | "not_applied" | "unknown";

/**
 * What the caller should do after a failure.
 * - `retryable`: sending the same call again is safe.
 * - `read_canvas_first`: check the current state before deciding (every
 *   `unknown` outcome gets this).
 * - `fix_input`: change the arguments, then call again.
 * - `needs_human`: the designer has to act (open the plugin, lift a no-go
 *   zone, answer an approval card, update the plugin).
 */
export type RetryClass = "retryable" | "read_canvas_first" | "fix_input" | "needs_human";

// ── Error codes ─────────────────────────────────────────────────────

export const ERROR_CODES = [
  // Server: reaching the relay and the plugin
  "not_connected", // no live link to the relay when the call was made; nothing was sent
  "relay_unresponsive", // the relay did not answer a room listing or join in time; nothing changed
  "plugin_absent", // no Figma plugin is in the target room
  "room_ambiguous", // several plugins are open and the call did not say which room
  "room_changed", // the session was re-paired to a room on a different file; resend to confirm
  "wrong_file", // the target file's name is not the expected one (server precheck or plugin recheck)
  "cannot_verify_file", // an expected file was given but the plugin did not report its file name
  // Plugin: refused before the command ran
  "unknown_command", // the plugin has no handler for the command (plugin older than the server)
  "denied_by_designer", // the designer declined the approval card
  "approval_timeout", // nobody answered the approval card before it timed out
  "cancelled", // Stop pressed before the command started or while its card waited; also skipped batch items
  "guard_blocked", // the write touches a page the designer marked as a no-go zone
  "scope_locked", // the write falls outside the designer's scope lock
  "designer_only", // the command is reserved for the designer's panel
  "code_exec_disabled", // code execution is switched off in the panel
  "node_not_found", // a referenced node does not exist (checked before any change)
  "precondition_failed", // a referenced node has the wrong type or is locked (checked before any change)
  "capacity_exceeded", // file memory (precedents or rulesets) is full
  "invalid_params", // the arguments are malformed (from the plugin or the server's own checks)
  "script_compile_error", // the script did not compile, so none of it ran
  // Plugin: failed while running
  "script_error", // the script threw while running; scripts are not atomic, earlier changes stay
  "handler_error", // any other error thrown by a command handler
  "figma_internal", // Figma itself reported an internal error (it reads like a connection error but is not one)
  // Server: lost track of a request in flight
  "timeout", // no result arrived in time; the command may have run
  "link_dropped", // the link to the plugin closed while the request was in flight
  "cancel_unconfirmed", // Stop was pressed but no real result followed in time
  // Server: tools that do not go through the plugin
  "tool_error", // a tool that talks to Figma's REST API or local state failed
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The outcome and retry class each code implies when the reporter does not
 * say otherwise. An explicit `outcome` on the error always wins: a Stop that
 * landed after some items of a multi-item write were already written is
 * `cancelled` with `outcome: "applied"` and `partial: true`.
 *
 * `handler_error` and `figma_internal` default to `unknown` because a write
 * may have started; the plugin reports `not_applied` for read commands.
 */
export const ERROR_DEFAULTS: Record<ErrorCode, { outcome: Outcome; retry: RetryClass }> = {
  not_connected: { outcome: "not_applied", retry: "retryable" },
  relay_unresponsive: { outcome: "not_applied", retry: "retryable" },
  plugin_absent: { outcome: "not_applied", retry: "needs_human" },
  room_ambiguous: { outcome: "not_applied", retry: "fix_input" },
  room_changed: { outcome: "not_applied", retry: "retryable" },
  wrong_file: { outcome: "not_applied", retry: "fix_input" },
  cannot_verify_file: { outcome: "not_applied", retry: "fix_input" },
  unknown_command: { outcome: "not_applied", retry: "needs_human" },
  denied_by_designer: { outcome: "not_applied", retry: "needs_human" },
  approval_timeout: { outcome: "not_applied", retry: "needs_human" },
  cancelled: { outcome: "not_applied", retry: "needs_human" },
  guard_blocked: { outcome: "not_applied", retry: "needs_human" },
  scope_locked: { outcome: "not_applied", retry: "needs_human" },
  designer_only: { outcome: "not_applied", retry: "needs_human" },
  code_exec_disabled: { outcome: "not_applied", retry: "needs_human" },
  node_not_found: { outcome: "not_applied", retry: "read_canvas_first" },
  precondition_failed: { outcome: "not_applied", retry: "fix_input" },
  capacity_exceeded: { outcome: "not_applied", retry: "fix_input" },
  invalid_params: { outcome: "not_applied", retry: "fix_input" },
  script_compile_error: { outcome: "not_applied", retry: "fix_input" },
  script_error: { outcome: "unknown", retry: "read_canvas_first" },
  handler_error: { outcome: "unknown", retry: "read_canvas_first" },
  figma_internal: { outcome: "unknown", retry: "read_canvas_first" },
  timeout: { outcome: "unknown", retry: "read_canvas_first" },
  link_dropped: { outcome: "unknown", retry: "read_canvas_first" },
  cancel_unconfirmed: { outcome: "unknown", retry: "read_canvas_first" },
  tool_error: { outcome: "not_applied", retry: "fix_input" },
};

/**
 * The code each of the v2 tools' structured error categories reports, with
 * the fields that differ from that code's defaults. Pass the whole entry to
 * RelaiError (or copy it into the metadata) so a category never reports
 * the bare code's defaults when they would be wrong.
 * - `partial_failure`: some items were written before the rest failed, so
 *   the file did change; resending blindly would repeat the written items.
 * - `state_changed`: the file changed under a multi-step read (for example
 *   a fingerprint moved between pages), so nothing was written but what was
 *   read so far is stale; read again from the start.
 */
export const CATEGORY_CODES: Record<
  ErrorCategory,
  { code: ErrorCode; outcome?: Outcome; retry?: RetryClass; partial?: true }
> = {
  precondition_failed: { code: "precondition_failed" },
  invalid_input: { code: "invalid_params" },
  type_mismatch: { code: "precondition_failed" },
  partial_failure: { code: "tool_error", outcome: "applied", retry: "read_canvas_first", partial: true },
  state_changed: { code: "tool_error", outcome: "not_applied", retry: "read_canvas_first" },
  capability_limit: { code: "capacity_exceeded" },
  connection_error: { code: "not_connected" },
};

/**
 * An error that carries its code. Thrown by the plugin and the server alike;
 * the message is kept byte-for-byte so existing text stays stable.
 */
export class RelaiError extends Error {
  readonly code: ErrorCode;
  readonly outcome: Outcome;
  readonly retry: RetryClass;
  readonly partial?: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { outcome?: Outcome; retry?: RetryClass; partial?: boolean } = {}
  ) {
    super(message);
    this.name = "RelaiError";
    this.code = code;
    this.outcome = options.outcome ?? ERROR_DEFAULTS[code].outcome;
    this.retry = options.retry ?? ERROR_DEFAULTS[code].retry;
    if (options.partial) this.partial = true;
  }
}

// ── Wire protocol (server ↔ relay ↔ plugin) ─────────────────────────

/**
 * Protocol version. 1 is every plugin and server before the call contract;
 * a peer that does not state a version is 1. New behaviour (plugin-side file
 * recheck, large results handed to the server) runs only when both ends are 2.
 */
export const PROTOCOL_VERSION = 2;

/** Metadata a peer sends when it joins a room; presence relays it unchanged. */
export interface PeerMeta {
  fileName?: string; // the plugin's figma.root.name at join time (a branch reports the branch name)
  protocol?: number; // the peer's protocol version; absent means 1
  version?: string; // the peer's release version, e.g. "0.8.0"
  [key: string]: unknown;
}

/** Per-call information the server attaches to a command message. */
export interface WsCallInfo {
  protocol: 2;
  // Refuse unless the plugin's live figma.root.name equals this exactly
  // (after NFC normalization). Sent only to plugins on protocol 2 or later.
  expectFile?: string;
}

/** What the plugin attaches to a successful command result. */
export interface ResultMeta {
  protocol: 2;
  write: boolean; // whether the command counts as a write
  file: string; // the plugin's live figma.root.name when the result was sent
  outcome: Outcome; // applied for a finished command; a batch aggregates its items
  partial?: boolean; // true when some items applied and others did not
}

/** The error object the plugin sends when a command fails. */
export interface PluginErrorPayload {
  message: string;
  command?: string;
  nodeId?: string;
  nodeType?: string;
  code?: ErrorCode; // absent from plugins before protocol 2
  outcome?: Outcome; // overrides the code's default
  retry?: RetryClass; // overrides the code's default
  partial?: boolean; // some items were written before the failure
  cancelled?: boolean; // set by older plugins and panels on denial or Stop; not trusted on its own
}

// ── MCP result metadata ─────────────────────────────────────────────

/**
 * The key under a tool result's `_meta` that holds a CallMeta. The prefix is
 * reverse DNS, as MCP asks of implementation-defined metadata keys. Once
 * released, renaming this key is a breaking change: callers look it up by
 * this exact string.
 */
export const CALL_META_KEY = "io.github.syoooo.figma-relai/call";

/** One plugin command sent while serving a tool call. */
export interface CallReceipt {
  id: string; // the request id the plugin saw as message.id and params.commandId
  command: string;
  outcome: Outcome;
  write?: boolean; // known only when the plugin reported it
  code?: ErrorCode;
  items?: Array<{ command: string; outcome: Outcome; code?: ErrorCode }>; // batch_execute, one per sub-command
}

/** The text handed back to the model was cut; the full text may sit in a local file. */
export interface TransportTruncation {
  total: number; // full length
  returned: number; // length that was returned
  unit: "chars";
  file?: string; // local path to the full result
}

/** The value stored at `_meta[CALL_META_KEY]` on a tool result. */
export interface CallMeta {
  v: 1;
  // Absent on tools that never reach the plugin
  outcome?: Outcome;
  partial?: boolean;
  error?: { code: ErrorCode; retry: RetryClass };
  calls: CallReceipt[];
  target?: {
    room?: string;
    file?: string;
    // The main file's name when the target is a branch; known only after the
    // server resolved the file's identity, so its absence proves nothing
    branchOf?: string;
  };
  truncated?: TransportTruncation;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Combine the outcomes of several commands into the tool's outcome: any
 * `unknown` makes it `unknown`; otherwise any `applied` makes it `applied`
 * (with `partial` when some were `not_applied`); otherwise `not_applied`.
 */
export function aggregateOutcome(outcomes: Outcome[]): { outcome: Outcome; partial?: true } {
  if (outcomes.includes("unknown")) return { outcome: "unknown" };
  if (outcomes.includes("applied")) {
    return outcomes.includes("not_applied") ? { outcome: "applied", partial: true } : { outcome: "applied" };
  }
  return { outcome: "not_applied" };
}

/**
 * Classify an error from a plugin that predates error codes by its wording.
 * The answer is conservative: anything unrecognised may have written.
 */
export function inferLegacyCode(error: string | PluginErrorPayload): {
  code: ErrorCode;
  outcome: Outcome;
  retry: RetryClass;
} {
  const message = typeof error === "string" ? error : (error?.message ?? "");
  const pick = (code: ErrorCode) => ({ code, ...ERROR_DEFAULTS[code] });
  if (message.includes("no-go zone")) return pick("guard_blocked");
  if (message.includes("Scope lock:")) return pick("scope_locked");
  if (message.includes("Code execution is disabled")) return pick("code_exec_disabled");
  if (message.includes("Node not found") || / has been deleted\. /.test(message)) {
    return pick("node_not_found");
  }
  if (message.includes("Denied by designer")) return pick("denied_by_designer");
  // Older panels answered Stop themselves with this text and `cancelled: true`
  // while the command kept running, so it proves nothing about the canvas.
  // Without the flag (or from a plain string) it falls through to
  // handler_error, which has the same outcome and retry.
  if (typeof error !== "string" && error?.cancelled === true && message.includes("Cancelled by designer")) {
    return pick("cancel_unconfirmed");
  }
  if (message.includes("Unknown command")) return pick("unknown_command");
  return pick("handler_error");
}
