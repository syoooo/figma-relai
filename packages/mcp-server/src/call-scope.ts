import { AsyncLocalStorage } from "node:async_hooks";
import type { ResultMeta } from "@figma-relai/shared";

// One plugin command in flight on behalf of a tool call. The request tracker
// is the only place that sees request ids and result metadata, but it sits
// below the connection and never learns which tool asked. So the call
// envelope opens a slot around each command it sends, and the tracker writes
// what it settled into whichever slot was active when the request was added.

/** The last request the tracker settled inside a slot. */
export interface SettledRequest {
  id: string;
  meta?: ResultMeta;
  cancelRequested?: boolean; // the designer pressed Stop before this settled
}

export interface CommandSlot {
  settled?: SettledRequest;
  // Set as soon as the command returns. Requests started from inside the
  // command but settled later (a background identity probe, a rejoin after
  // reconnect) must not overwrite what the command itself reported.
  closed: boolean;
}

const slots = new AsyncLocalStorage<CommandSlot>();

export function runInCommandSlot<T>(slot: CommandSlot, fn: () => Promise<T>): Promise<T> {
  return slots.run(slot, fn);
}

export function currentCommandSlot(): CommandSlot | undefined {
  return slots.getStore();
}

/**
 * Record a settled request in its slot. The relay requests that pair a
 * session (room listing, join) settle in the same slot before the command
 * itself, so the last one settled before the command returns is the command.
 */
export function noteSettled(slot: CommandSlot | undefined, settled: SettledRequest): void {
  if (slot && !slot.closed) slot.settled = settled;
}
