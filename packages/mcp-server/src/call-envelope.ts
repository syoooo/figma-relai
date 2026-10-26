import { AsyncLocalStorage } from "node:async_hooks";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CALL_META_KEY,
  ERROR_DEFAULTS,
  RelaiError,
  aggregateOutcome,
  inferLegacyCode,
  isErrorCode,
  type CallMeta,
  type CallReceipt,
  type ErrorCode,
  type Outcome,
  type RetryClass,
  type TransportTruncation,
} from "@figma-relai/shared";
import type { SendCommandFn } from "./tool-registry.js";
import { runInCommandSlot, type CommandSlot } from "./call-scope.js";
import { errorResult } from "./tools/core/helpers.js";
import { writeResultFile } from "./result-files.js";

// The one place every tool result passes through on its way out. Wrapping
// registration (rather than editing each tool) is what makes "every tool"
// true: a tool cannot forget to report an outcome or to set isError.
//
// For each tool call the envelope:
// - adds the optional room and expect_file arguments and hands them to the
//   connection as the call's target,
// - collects a receipt for every plugin command the tool sent (request id,
//   outcome, write or read, error code),
// - turns errors thrown by a command into coded RelaiErrors, so the tool's
//   own error handling passes the code along,
// - sets isError on failures, including tools that still print "Error: …",
// - cuts text over MAX_TEXT_CHARS and saves the full text to a local file,
// - appends a one-line receipt the model can read (it cannot see _meta),
// - stores the machine-readable CallMeta under _meta[CALL_META_KEY].

/** Text longer than this is cut before it reaches the model. */
export const MAX_TEXT_CHARS = 50000;

/** The fixed label the receipt line starts with. */
export const RECEIPT_LABEL = "[relai]";

/** Where one tool call's plugin commands go (see FigmaConnection.CallTarget). */
export interface EnvelopeTarget {
  room?: string;
  expectFile?: string;
}

interface CallScope {
  receipts: CallReceipt[];
  partial: boolean;
  file?: string; // the plugin's live file name, from the latest result metadata
  room?: string;
  expectFile?: string;
  cancelRequested: boolean;
  lastError?: RelaiError;
}

const scopes = new AsyncLocalStorage<CallScope>();

type ToolContent = { type: string; text?: string; [key: string]: unknown };
export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}
type ToolHandler = (...args: unknown[]) => unknown;

const WRAPPED = Symbol("relai.callEnvelope");
const ENVELOPED_SERVER = Symbol("relai.envelopedServer");

// The two arguments every enveloped tool accepts on top of its own
const TARGET_SHAPE = {
  room: z.string().optional().describe("Target this plugin room for this call only (see join_room)."),
  expect_file: z.string().optional().describe("Refuse unless the target file's name is exactly this."),
};

/** The target named by the tool call this code runs inside, if any. */
export function currentCallTarget(): EnvelopeTarget {
  const scope = scopes.getStore();
  return {
    ...(scope?.room !== undefined ? { room: scope.room } : {}),
    ...(scope?.expectFile !== undefined ? { expectFile: scope.expectFile } : {}),
  };
}

/** Whether a tool handler went through the envelope (for tests). */
export function isEnveloped(handler: unknown): boolean {
  return typeof handler === "function" && (handler as { [WRAPPED]?: true })[WRAPPED] === true;
}

/**
 * Wrap a server and the plugin command function that its tools use. Register
 * tools on the returned server and hand them the returned sendCommand.
 * Only the two registration forms Relai uses are accepted —
 * (name, description, shape, handler) and
 * (name, description, shape, annotations, handler) — any other throws, so a
 * tool can never slip past the envelope unwrapped.
 */
export function withCallEnvelope(
  server: McpServer,
  sendCommand: SendCommandFn
): { server: McpServer; sendCommand: SendCommandFn } {
  // Wrapping twice would report every call twice
  if ((server as unknown as { [ENVELOPED_SERVER]?: true })[ENVELOPED_SERVER]) return { server, sendCommand };
  const wrappedServer = new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === ENVELOPED_SERVER) return true;
      if (prop !== "tool") return Reflect.get(target, prop, receiver);
      return (name: string, ...rest: unknown[]) => {
        if ((rest.length !== 3 && rest.length !== 4) || typeof rest[0] !== "string") {
          throw new Error(
            `Tool "${name}" must be registered as (name, description, shape, [annotations,] handler) to get a call envelope`
          );
        }
        const handler = rest[rest.length - 1] as ToolHandler;
        const annotations = rest.length === 4 ? (rest[2] as { readOnlyHint?: boolean }) : undefined;
        const wrapped = envelopeHandler(name, handler, annotations?.readOnlyHint === true);
        const shape = { ...TARGET_SHAPE, ...(rest[1] as Record<string, unknown>) };
        return (target.tool as (...a: unknown[]) => unknown).call(target, name, rest[0], shape, ...rest.slice(2, -1), wrapped);
      };
    },
  }) as McpServer;

  const wrappedSend: SendCommandFn = async (command, params, timeoutMs) => {
    const scope = scopes.getStore();
    const slot: CommandSlot = { closed: false };
    try {
      const result = await runInCommandSlot(slot, () => sendCommand(command, params, timeoutMs));
      slot.closed = true;
      if (scope) recordSuccess(scope, command, slot, result);
      return result;
    } catch (error) {
      slot.closed = true;
      const coded = toRelaiError(error);
      if (scope) {
        scope.receipts.push({ id: slot.settled?.id ?? "", command, outcome: coded.outcome, code: coded.code });
        if (coded.partial) scope.partial = true;
        if (slot.settled?.cancelRequested) scope.cancelRequested = true;
        scope.lastError = coded;
      }
      throw coded;
    }
  };

  return { server: wrappedServer, sendCommand: wrappedSend };
}

function envelopeHandler(name: string, handler: ToolHandler, readOnly: boolean): ToolHandler {
  const wrapped = async (...args: unknown[]) => {
    const scope: CallScope = { receipts: [], partial: false, cancelRequested: false };
    // The target is the envelope's business; the tool sees its own arguments only
    const { room, expect_file: expectFile, ...own } = (args[0] ?? {}) as Record<string, unknown>;
    if (typeof room === "string") scope.room = room;
    if (typeof expectFile === "string") scope.expectFile = expectFile;
    const toolArgs = args[0] === undefined ? args : [own, ...args.slice(1)];
    let result: ToolResult;
    try {
      result = (await scopes.run(scope, () => Promise.resolve(handler(...toolArgs)))) as ToolResult;
    } catch (error) {
      result = errorResult(error) as ToolResult;
    }
    return finalizeResult(name, result, scope, readOnly);
  };
  (wrapped as unknown as { [WRAPPED]: true })[WRAPPED] = true;
  return wrapped;
}

/**
 * Classify an error thrown while sending a plugin command. Coded errors pass
 * through; anything else is read by its wording, which leans to "may have
 * changed the file" when the wording is not recognised.
 */
export function toRelaiError(error: unknown): RelaiError {
  if (error instanceof RelaiError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const { code, outcome, retry } = inferLegacyCode(message);
  return new RelaiError(code, message, { outcome, retry });
}

function recordSuccess(scope: CallScope, command: string, slot: CommandSlot, result: unknown): void {
  const meta = slot.settled?.meta;
  const receipt: CallReceipt = { id: slot.settled?.id ?? "", command, outcome: meta?.outcome ?? "applied" };
  if (typeof meta?.write === "boolean") receipt.write = meta.write;
  if (meta?.partial) scope.partial = true;
  if (meta?.file) scope.file = meta.file;
  if (slot.settled?.cancelRequested) scope.cancelRequested = true;

  if (command === "batch_execute" && Array.isArray(result)) {
    receipt.items = result.map(batchItem);
    if (!meta) {
      // An older plugin does not judge the batch; judge it from its items
      const judged = aggregateOutcome(receipt.items.map((item) => item.outcome));
      receipt.outcome = judged.outcome;
      if (judged.partial) scope.partial = true;
    }
  }
  scope.receipts.push(receipt);
}

// One sub-command of batch_execute, as the plugin reported it
function batchItem(raw: unknown): { command: string; outcome: Outcome; code?: ErrorCode } {
  const item = (raw ?? {}) as { command?: unknown; success?: unknown; outcome?: unknown; code?: unknown; error?: unknown };
  const command = typeof item.command === "string" ? item.command : "";
  const code = isErrorCode(item.code) ? item.code : undefined;
  const stated = item.outcome === "applied" || item.outcome === "not_applied" || item.outcome === "unknown"
    ? item.outcome
    : undefined;
  if (item.success === true) return { command, outcome: stated ?? "applied" };
  if (code) return { command, outcome: stated ?? ERROR_DEFAULTS[code].outcome, code };
  const legacy = inferLegacyCode(typeof item.error === "string" ? item.error : "");
  return { command, outcome: stated ?? legacy.outcome, code: legacy.code };
}

/**
 * Turn what a tool returned into the result the client gets. Pure apart from
 * writing the result file when the text is cut.
 */
export function finalizeResult(
  name: string,
  result: ToolResult,
  scope: Pick<CallScope, "receipts" | "partial" | "file" | "room" | "cancelRequested" | "lastError"> & {
    expectFile?: string;
  },
  readOnly: boolean
): ToolResult {
  const declared = (result._meta?.[CALL_META_KEY] ?? undefined) as Partial<CallMeta> | undefined;
  const content = [...(result.content ?? [])];
  const bodyIndex = content.findIndex((item) => item.type === "text" && typeof item.text === "string");
  const body = bodyIndex >= 0 ? (content[bodyIndex].text as string) : undefined;
  const receipts = scope.receipts;
  const last = receipts[receipts.length - 1];

  // Tools that print "Error: …" without isError still failed
  let isError = result.isError === true;
  if (!isError && last?.code && body?.startsWith("Error: ")) isError = true;

  // When the last command failed, its code is what went wrong: a tool's own
  // label (some v2 tools call every failure a connection error) is a guess
  let error = declared?.error;
  if (isError && last?.code && scope.lastError) {
    error = { code: scope.lastError.code, retry: scope.lastError.retry };
  } else if (isError && !error) {
    error = { code: "tool_error", retry: ERROR_DEFAULTS.tool_error.retry };
  }

  // A read cannot change the file: one that failed or went silent is
  // not_applied. Only writes decide whether the file may have changed, and a
  // tool that sent nothing but reads is applied only if it succeeded.
  const isRead = (r: CallReceipt) => r.write === false || (r.write === undefined && readOnly);
  const calls = receipts.map((r) =>
    isRead(r) && r.outcome !== "applied" ? { ...r, outcome: "not_applied" as Outcome } : r
  );
  let outcome: Outcome | undefined;
  let partial = scope.partial;
  if (calls.length > 0) {
    const writes = calls.filter((r) => !isRead(r));
    if (writes.length > 0) {
      const judged = aggregateOutcome(writes.map((r) => r.outcome));
      outcome = judged.outcome;
      partial = partial || judged.partial === true;
    } else {
      outcome = !isError && calls.some((r) => r.outcome === "applied") ? "applied" : "not_applied";
    }
  }
  if (declared?.outcome) {
    // A tool may know better than its commands, but never better than "unknown"
    outcome = outcome === "unknown" ? "unknown" : declared.outcome;
    partial = partial || declared.partial === true;
  }
  if (error && outcome === "unknown") error = { ...error, retry: "read_canvas_first" as RetryClass };

  // Cut long text and keep the full text in a local file
  let truncated = declared?.truncated;
  if (body !== undefined && body.length > MAX_TEXT_CHARS) {
    // The body holds the whole result unless the plugin already cut it (its
    // stated total says nothing about the body, whose JSON escaping can make
    // it longer than that total)
    const whole = !truncated;
    const file = truncated?.file ?? (whole ? writeResultFile(last?.id, body) : undefined);
    const cut: TransportTruncation = {
      total: whole ? body.length : truncated!.total,
      returned: MAX_TEXT_CHARS,
      unit: "chars",
      ...(file ? { file } : {}),
    };
    truncated = cut;
    content[bodyIndex] = {
      ...content[bodyIndex],
      text:
        `${body.slice(0, MAX_TEXT_CHARS)}\n… [truncated: returned ${cut.returned} of ${cut.total} chars; ` +
        (file ? `the full result is in ${file}]` : "the full result could not be saved]"),
    };
  }

  const meta: CallMeta = {
    v: 1,
    ...(outcome ? { outcome } : {}),
    ...(outcome && partial ? { partial: true } : {}),
    ...(error ? { error } : {}),
    calls,
    ...(scope.file || scope.room
      ? { target: { ...(scope.room ? { room: scope.room } : {}), ...(scope.file ? { file: scope.file } : {}) } }
      : {}),
    ...(truncated ? { truncated } : {}),
  };

  const wrote = calls.some((r) => !isRead(r));
  const showReceipt =
    isError ||
    outcome === "unknown" ||
    partial ||
    scope.room !== undefined ||
    scope.expectFile !== undefined ||
    (wrote && outcome !== undefined);
  if (showReceipt) {
    content.push({ type: "text", text: receiptLine(meta, last?.id, scope.cancelRequested) });
  }

  const { _meta: existingMeta, ...rest } = result;
  return {
    ...rest,
    content,
    ...(isError ? { isError: true } : {}),
    _meta: { ...(existingMeta ?? {}), [CALL_META_KEY]: meta },
  };
}

const OUTCOME_WORDS: Record<Outcome, string> = {
  applied: "applied — the command ran",
  not_applied: "not_applied — nothing was changed",
  unknown: "unknown — it may have changed the file; read the canvas before retrying",
};

/** The line the model reads: the outcome in words, then the code, call, file and room. */
export function receiptLine(meta: CallMeta, callId: string | undefined, cancelRequested: boolean): string {
  const parts = [
    meta.outcome
      ? `${RECEIPT_LABEL} ${OUTCOME_WORDS[meta.outcome]}${meta.partial ? " (partly: some of it was written)" : ""}`
      : `${RECEIPT_LABEL} failed`,
  ];
  if (meta.error) parts.push(meta.error.code);
  if (cancelRequested) parts.push("the designer pressed Stop");
  if (callId) parts.push(`call ${callId.slice(0, 8)}`);
  if (meta.target?.file) parts.push(`file "${meta.target.file}"`);
  if (meta.target?.room) parts.push(`room ${meta.target.room}`);
  return parts.join(" · ");
}
