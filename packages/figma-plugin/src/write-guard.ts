// Designer-side write governance: command classification, the approval gate,
// and the scope lock. Approval is enforced once per top-level command (in
// main.ts); the scope lock is enforced inside dispatch() so batch_execute's
// nested commands are checked too.

// Non-mutating (or harmless-navigation) commands. Everything else is a write.
const READ_PREFIXES = ["get_", "read_", "find_", "export_", "scan_nodes", "scan_text"];
const READ_EXACT = new Set(["figma_notify", "set_focus", "set_selections", "set_viewport", "join", "audit_colors"]);

export function isWriteCommand(command: string, params: Record<string, unknown>): boolean {
  if (READ_EXACT.has(command)) return false;
  if (READ_PREFIXES.some((p) => command.startsWith(p))) return false;
  if (command === "scan_token_drift") return params.fix === true;
  return true;
}

// Param keys that reference canvas nodes (checked against the scope lock)
const NODE_REF_KEYS = [
  "nodeId",
  "nodeIds",
  "targetNodeIds",
  "parentId",
  "sourceInstanceId",
  "instanceNodeId",
  "componentIds",
] as const;

export function collectNodeRefs(params: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const key of NODE_REF_KEYS) {
    const value = params[key];
    if (typeof value === "string") refs.push(value);
    else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === "string") refs.push(v);
    }
  }
  return refs;
}

// ─── Approval gate ──────────────────────────────────────────────────

export type ApprovalMode = "off" | "bulk" | "all";

const ALWAYS_BULK = new Set(["execute_code"]);
const BULK_THRESHOLD = 10;

/** Human-readable scale of a command, for the approval card */
export function describeScale(command: string, params: Record<string, unknown>): string {
  if (command === "batch_execute" && Array.isArray(params.commands)) {
    return `${params.commands.length} commands`;
  }
  const refs = collectNodeRefs(params);
  return refs.length > 1 ? `${refs.length} nodes` : refs.length === 1 ? "1 node" : "";
}

export function needsApproval(
  mode: ApprovalMode,
  command: string,
  params: Record<string, unknown>
): boolean {
  if (mode === "off" || !isWriteCommand(command, params)) return false;
  if (mode === "all") return true;
  // bulk: code execution, big batches, wide fan-outs, and whole-tree fixes
  if (ALWAYS_BULK.has(command)) return true;
  if (command === "scan_token_drift" && params.fix === true) return true;
  if (command === "batch_execute" && Array.isArray(params.commands)) {
    return params.commands.length >= BULK_THRESHOLD;
  }
  return collectNodeRefs(params).length >= BULK_THRESHOLD;
}

// ─── Scope lock ─────────────────────────────────────────────────────

let lockedIds: Set<string> | null = null;
let lockedNames: string[] = [];

export function setScopeLock(ids: string[], names: string[]): void {
  lockedIds = ids.length > 0 ? new Set(ids) : null;
  lockedNames = names;
}

export function clearScopeLock(): void {
  lockedIds = null;
  lockedNames = [];
}

export function scopeLockState(): { on: boolean; names: string[] } {
  return { on: lockedIds !== null, names: lockedNames };
}

export function isScopeLocked(): boolean {
  return lockedIds !== null;
}

/** A node is in scope if it or any ancestor is one of the locked roots. */
export async function isInLockedScope(nodeId: string): Promise<boolean> {
  if (!lockedIds) return true;
  try {
    let node: BaseNode | null = await figma.getNodeByIdAsync(nodeId);
    while (node) {
      if (lockedIds.has(node.id)) return true;
      node = node.parent;
    }
  } catch {
    // Unresolvable id: let the handler produce its own (clearer) error
    return true;
  }
  return false;
}

/**
 * Throws when a write command targets nodes outside the locked scope.
 * Creation commands must name a parent inside the scope — a parentless
 * create lands on the page, which is outside by definition.
 */
export async function enforceScopeLock(
  command: string,
  params: Record<string, unknown>
): Promise<void> {
  if (!lockedIds || !isWriteCommand(command, params)) return;
  if (command === "batch_execute") return; // nested dispatch checks each sub-command

  if (command.startsWith("create_") && params.parentId === undefined) {
    throw new Error(
      `Scope lock: the designer restricted edits to "${lockedNames.join('", "')}" — create inside it by passing parentId.`
    );
  }
  for (const ref of collectNodeRefs(params)) {
    if (!(await isInLockedScope(ref))) {
      throw new Error(
        `Scope lock: node ${ref} is outside "${lockedNames.join('", "')}", which the designer restricted edits to. Work within that selection or ask them to unlock.`
      );
    }
  }
}
