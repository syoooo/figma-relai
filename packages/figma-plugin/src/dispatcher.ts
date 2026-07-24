// Command dispatcher - routes commands to their handlers via a Map registry

import { enforceScopeLock } from "./write-guard.js";

type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;

const handlers = new Map<string, CommandHandler>();

// Register a command handler
export function registerHandler(
  command: string,
  handler: CommandHandler
): void {
  handlers.set(command, handler);
}

// Dispatch a command to its handler. The scope-lock check lives here (not in
// main.ts) so batch_execute's nested dispatches are covered too.
export async function dispatch(
  command: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = handlers.get(command);
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  await enforceScopeLock(command, params);
  return handler(params);
}

// Check if a command handler is registered
export function hasHandler(command: string): boolean {
  return handlers.has(command);
}

// Cooperative cancellation: the designer's Stop button marks a commandId as
// cancelled; iterative handlers (batch_execute, chunked scans) check between
// items. Single atomic commands run to completion — JS is single-threaded.
const cancelledIds = new Set<string>();

export function cancelCommand(commandId: string): void {
  cancelledIds.add(commandId);
}

export function isCancelled(commandId: string | undefined): boolean {
  return commandId !== undefined && cancelledIds.has(commandId);
}

export function clearCancelled(commandId: string | undefined): void {
  if (commandId !== undefined) cancelledIds.delete(commandId);
}
