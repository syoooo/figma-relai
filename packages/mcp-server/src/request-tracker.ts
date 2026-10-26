import { RelaiError, type ResultMeta } from "@figma-relai/shared";
import { logger } from "./logger.js";
import { currentCommandSlot, noteSettled, type CommandSlot } from "./call-scope.js";

/**
 * What a request that runs out of time means.
 * - `timeout`: a command reached the plugin and no result came back; it may
 *   have run, so the caller must read the canvas before retrying.
 * - `relay_unresponsive`: the relay itself did not answer a room listing or
 *   a join; nothing was sent to the plugin, so nothing changed.
 */
export type TimeoutCode = "timeout" | "relay_unresponsive";

// Pending request entry with resolve/reject callbacks and timeout tracking
export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  lastActivity: number;
  timeoutCode: TimeoutCode;
  slot?: CommandSlot;
  cancelRequested?: boolean;
}

// The first words of the timeout message predate error codes; callers that
// match on them keep working.
const TIMEOUT_MESSAGE =
  "Request to Figma timed out — it may already have applied; read the canvas before retrying.";
const RELAY_TIMEOUT_MESSAGE =
  "The relay did not answer in time — nothing was sent to Figma, so nothing changed. Try again in a moment.";
const CANCEL_UNCONFIRMED_MESSAGE =
  "The designer pressed Stop and no result followed — the command may have run part-way. Read the canvas before retrying.";

export function timeoutError(code: TimeoutCode): RelaiError {
  return code === "relay_unresponsive"
    ? new RelaiError("relay_unresponsive", RELAY_TIMEOUT_MESSAGE)
    : new RelaiError("timeout", TIMEOUT_MESSAGE);
}

// Manages pending command requests with timeout and progress update support
export class RequestTracker {
  private pending = new Map<string, PendingRequest>();

  // Register a new pending request with timeout. Room listings and joins
  // pass "relay_unresponsive": their silence means the relay, not Figma.
  add(
    id: string,
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void,
    timeoutMs: number = 30000,
    timeoutCode: TimeoutCode = "timeout"
  ): void {
    this.pending.set(id, {
      resolve,
      reject,
      timeout: setTimeout(() => this.expire(id, `after ${timeoutMs / 1000}s`), timeoutMs),
      lastActivity: Date.now(),
      timeoutCode,
      slot: currentCommandSlot(),
    });
  }

  // Resolve a request with its result and the plugin's result metadata
  resolve(id: string, result: unknown, meta?: ResultMeta): boolean {
    const request = this.take(id);
    if (!request) return false;
    noteSettled(request.slot, { id, meta, cancelRequested: request.cancelRequested });
    request.resolve(result);
    return true;
  }

  // Reject a request with error
  reject(id: string, error: Error): boolean {
    const request = this.take(id);
    if (!request) return false;
    noteSettled(request.slot, { id, cancelRequested: request.cancelRequested });
    request.reject(error);
    return true;
  }

  // Reset timeout on progress update to prevent timeout during long operations
  resetTimeout(id: string, extendedTimeoutMs: number = 60000): void {
    const request = this.pending.get(id);
    // After Stop the grace period is final: progress must not stretch it
    if (!request || request.cancelRequested) return;

    request.lastActivity = Date.now();
    clearTimeout(request.timeout);
    request.timeout = setTimeout(
      () => this.expire(id, "after extended inactivity"),
      extendedTimeoutMs
    );
  }

  /**
   * The designer pressed Stop on this request. The plugin may still finish
   * it, so keep waiting, but only for the grace period: a real result inside
   * it resolves as usual; silence becomes `cancel_unconfirmed`.
   */
  markCancelRequested(id: string, graceMs: number = 10000): boolean {
    const request = this.pending.get(id);
    if (!request) return false;
    request.cancelRequested = true;
    clearTimeout(request.timeout);
    request.timeout = setTimeout(() => {
      if (!this.take(id)) return;
      logger.error(`Request ${id} got no result within ${graceMs / 1000}s of Stop`);
      noteSettled(request.slot, { id, cancelRequested: true });
      request.reject(new RelaiError("cancel_unconfirmed", CANCEL_UNCONFIRMED_MESSAGE));
    }, graceMs);
    return true;
  }

  // Check if a request is pending
  has(id: string): boolean {
    return this.pending.has(id);
  }

  // Reject every pending request because the link closed. A command already
  // on the wire may have run, so each one is `link_dropped` (outcome unknown).
  rejectAll(reason: string): void {
    for (const [id, request] of this.pending.entries()) {
      clearTimeout(request.timeout);
      noteSettled(request.slot, { id, cancelRequested: request.cancelRequested });
      request.reject(new RelaiError("link_dropped", reason));
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }

  private take(id: string): PendingRequest | undefined {
    const request = this.pending.get(id);
    if (!request) return undefined;
    clearTimeout(request.timeout);
    this.pending.delete(id);
    return request;
  }

  private expire(id: string, when: string): void {
    const request = this.take(id);
    if (!request) return;
    logger.error(`Request ${id} timed out ${when}`);
    noteSettled(request.slot, { id, cancelRequested: request.cancelRequested });
    request.reject(timeoutError(request.timeoutCode));
  }
}
