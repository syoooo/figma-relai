// Designer-side write governance: command classification, the approval gate,
// and the scope lock. Approval is enforced once per top-level command (in
// main.ts); the scope lock is enforced inside dispatch() so batch_execute's
// nested commands are checked too.

// Non-mutating (or harmless-navigation) commands. Everything else is a write.
const READ_PREFIXES = ["get_", "read_", "find_", "export_", "scan_nodes", "scan_text"];
// set_file_identity writes to clientStorage, never to the canvas — gating it
// behind approval or the scope lock would block a cache write for no reason.
const READ_EXACT = new Set(["figma_notify", "set_focus", "set_selections", "set_viewport", "join", "audit_colors", "set_file_identity"]);

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

/**
 * Node ids as they appear inside arbitrary text (an execute_code return value).
 *
 * Instance sublayers are `I<instance>;<mainComponent>` — sometimes several
 * segments — and must be matched WHOLE. A bare /\d+:\d+/ slices the main
 * component's id out of the middle, and the main component lives on a
 * different page than the instance: that is how editing an override came to be
 * reported against the component's page, and how a guarded page that was only
 * ever NAMED in a result looked like it had been written to.
 */
const NODE_ID_IN_TEXT = /\bI?\d+:\d+(?:;\d+:\d+)*\b/g;

export function nodeIdsInText(text: string, limit = 20): string[] {
  return [...new Set(text.match(NODE_ID_IN_TEXT) ?? [])].slice(0, limit);
}

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
// One dial, four stops, each including the previous:
//   open — nothing asks (branch workflows)
//   risk — ghost-making & irreversible ops ask (the default)
//   bulk — + code execution, big batches, wide fan-outs
//   all  — every write asks

export type ConfirmLevel = "open" | "risk" | "bulk" | "all";
/** Legacy persisted setting (pre-0.4); migrated to ConfirmLevel on load. */
export type ApprovalMode = "off" | "bulk" | "all";

export function migrateConfirmLevel(
  requireApproval?: ApprovalMode,
  confirmHighRisk?: boolean
): ConfirmLevel {
  if (requireApproval === "all") return "all";
  if (requireApproval === "bulk") return "bulk";
  return confirmHighRisk === false ? "open" : "risk";
}

const ALWAYS_BULK = new Set(["execute_code"]);
const BULK_THRESHOLD = 10;

// ── Reversibility tax ───────────────────────────────────────────────
// Some operations are expensive to undo no matter who runs them: deleting
// variables/styles soft-deletes them into ghosts (bindings keep resolving,
// invisible in pickers), detach/flatten destroy structure. These prompt even
// when approvals are OFF — unless the designer flips the high-risk switch
// (the branch-workflow escape hatch).
const GHOST_TAX = new Set(["delete_variable", "delete_variable_collection", "delete_style"]);
const DESTRUCTIVE_TAX = new Set(["detach_instance", "flatten_node"]);
const DELETE_TAX_THRESHOLD = 10;

export function taxTier(command: string, params: Record<string, unknown>): "ghost" | "irreversible" | null {
  if (GHOST_TAX.has(command)) return "ghost";
  if (DESTRUCTIVE_TAX.has(command)) return "irreversible";
  if (
    (command === "delete_node" || command === "delete_multiple_nodes") &&
    collectNodeRefs(params).length >= DELETE_TAX_THRESHOLD
  ) {
    return "irreversible";
  }
  return null;
}

/** Human-readable scale of a command, for the approval card */
export function describeScale(command: string, params: Record<string, unknown>): string {
  const parts: string[] = [];
  const tier = taxTier(command, params);
  if (tier === "ghost") parts.push("ghost-risk");
  if (tier === "irreversible") parts.push("irreversible");
  if (command === "batch_execute" && Array.isArray(params.commands)) {
    parts.push(`${params.commands.length} commands`);
  } else {
    const refs = collectNodeRefs(params);
    if (refs.length > 0) parts.push(refs.length > 1 ? `${refs.length} nodes` : "1 node");
  }
  return parts.join(" · ");
}

export function needsApproval(
  level: ConfirmLevel,
  command: string,
  params: Record<string, unknown>
): boolean {
  if (!isWriteCommand(command, params)) return false;
  if (level === "open") return false;
  if (taxTier(command, params) !== null) return true; // risk and above
  if (level === "risk") return false;
  if (level === "all") return true;
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
