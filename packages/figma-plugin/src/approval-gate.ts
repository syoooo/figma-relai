// ── Approval gate ───────────────────────────────────────────────────
// A command the confirm level holds back waits here until the designer
// answers its card, presses Stop, or nobody answers before the timeout.
// While it waits, a periodic keepalive holds the MCP side's timeout open.
// Everything that touches Figma is passed in, so the gate runs in tests.
import { describeScale } from "./write-guard.js";

export type ApprovalCause = "designer" | "timeout" | "stop";

export type ApprovalVerdict =
  | { verdict: "approved" }
  | { verdict: "denied"; cause: ApprovalCause; reason?: string };

export interface ApprovalRequestMessage {
  type: "approval-request";
  id: string;
  command: string;
  scale: string;
  intent: string;
}

export interface ApprovalSettled {
  id: string;
  command: string;
  params: Record<string, unknown>;
  approved: boolean;
  cause: ApprovalCause;
  // Trimmed; absent when the designer typed nothing
  reason?: string;
}

export interface ApprovalGateOptions {
  timeoutMs: number;
  keepaliveMs: number;
  // Shows the approval card in the panel
  post: (message: ApprovalRequestMessage) => void;
  // Tells the server the command is still alive, once per keepaliveMs
  keepalive: (id: string, command: string, params: Record<string, unknown>) => void;
  // Runs once per request, before the request's promise resolves
  onSettled?: (settled: ApprovalSettled) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setRepeat?: (fn: () => void, ms: number) => unknown;
  clearRepeat?: (handle: unknown) => void;
}

export interface ApprovalGate {
  request(id: string, command: string, params: Record<string, unknown>): Promise<ApprovalVerdict>;
  // Settles a waiting request; an id that is not waiting is ignored
  answer(id: string, approved: boolean, reason?: string, cause?: ApprovalCause): void;
  pendingCount(): number;
}

export function createApprovalGate(options: ApprovalGateOptions): ApprovalGate {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const setRepeat = options.setRepeat ?? ((fn, ms) => setInterval(fn, ms));
  const clearRepeat =
    options.clearRepeat ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  const pending = new Map<
    string,
    (approved: boolean, reason: string | undefined, cause: ApprovalCause) => void
  >();

  return {
    request(id, command, params) {
      return new Promise((resolve) => {
        const keepalive = setRepeat(() => options.keepalive(id, command, params), options.keepaliveMs);
        const timeout = setTimer(() => settle(false, undefined, "timeout"), options.timeoutMs);
        const settle = (approved: boolean, reason: string | undefined, cause: ApprovalCause) => {
          clearRepeat(keepalive);
          clearTimer(timeout);
          pending.delete(id);
          const typed = reason && reason.trim().length > 0 ? reason.trim() : undefined;
          options.onSettled?.({ id, command, params, approved, cause, reason: typed });
          resolve(
            approved
              ? { verdict: "approved" }
              : { verdict: "denied", cause, ...(typed ? { reason: typed } : {}) }
          );
        };
        pending.set(id, settle);
        options.post({
          type: "approval-request",
          id,
          command,
          scale: describeScale(command, params),
          intent: describeIntent(command, params),
        });
      });
    },
    answer(id, approved, reason, cause = "designer") {
      pending.get(id)?.(approved, reason, cause);
    },
    pendingCount() {
      return pending.size;
    },
  };
}

// The approval card leads with the agent's stated intent, not the command
// name — a designer can't judge "execute_code", they can judge "rebuild the
// pricing table from library components".
export function describeIntent(command: string, params: Record<string, unknown>): string {
  if (typeof params.description === "string" && params.description.trim()) {
    return params.description.trim();
  }
  if (command === "batch_execute" && Array.isArray(params.commands)) {
    const names = (params.commands as Array<{ command?: string }>)
      .map((c) => c.command)
      .filter(Boolean);
    const head = names.slice(0, 3).join(", ");
    return `${names.length} commands: ${head}${names.length > 3 ? ", …" : ""}`;
  }
  return "";
}
