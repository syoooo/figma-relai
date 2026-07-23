// Precondition checks for write handlers. The check* functions are pure and
// operate on a structural NodeLike so they can be unit-tested without the
// figma global; resolveNode and the assert* wrappers throw with actionable
// messages that tell the AI what to do next.

// Structural subset of a Figma node — keeps the pure checks testable
export interface NodeLike {
  id: string;
  name: string;
  type: string;
  removed?: boolean;
  locked?: boolean;
  layoutMode?: string;
  parent?: NodeLike | null;
}

// Returns an error message, or null if the node type is allowed
export function checkNodeType(node: NodeLike, types: string[]): string | null {
  if (types.includes(node.type)) return null;
  return `Node "${node.name}" (${node.id}) is a ${node.type}, but this operation requires ${types.join(" or ")}.`;
}

// Returns an error message unless the node exposes the given property.
// Use where the set of supporting node types is too broad to enumerate.
export function checkSupports(node: NodeLike, prop: string): string | null {
  if (prop in (node as object)) return null;
  return `Node "${node.name}" (${node.id}) is a ${node.type}, which does not support ${prop}.`;
}

export function assertSupports(node: NodeLike, prop: string): void {
  const msg = checkSupports(node, prop);
  if (msg) throw new Error(msg);
}

// The node itself must be an auto-layout frame (padding, itemSpacing, axis align, layoutWrap)
export function checkAutoLayoutFrame(node: NodeLike, prop: string): string | null {
  if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") return null;
  return (
    `"${node.name}" (${node.id}) does not have auto-layout enabled; ` +
    `${prop} requires layoutMode HORIZONTAL or VERTICAL. Call set_layout_mode first.`
  );
}

// The node's parent must be an auto-layout frame (FILL sizing, layoutGrow, layoutAlign)
export function checkAutoLayoutChild(node: NodeLike, prop: string): string | null {
  const parent = node.parent;
  if (parent && (parent.layoutMode === "HORIZONTAL" || parent.layoutMode === "VERTICAL")) {
    return null;
  }
  const parentDesc = parent
    ? `Parent "${parent.name}" has layoutMode ${parent.layoutMode ?? "none (not a frame)"}`
    : "The node has no parent";
  return `"${node.name}" (${node.id}): ${prop} requires the parent to be an auto-layout frame. ${parentDesc}.`;
}

// The node must be an auto-layout frame OR a child of one (layoutSizing in general)
export function checkInAutoLayout(node: NodeLike, prop: string): string | null {
  if (checkAutoLayoutFrame(node, prop) === null) return null;
  if (checkAutoLayoutChild(node, prop) === null) return null;
  return (
    `"${node.name}" (${node.id}): ${prop} requires auto-layout — either on the node itself ` +
    `or on its parent. Call set_layout_mode first.`
  );
}

// Some values are only valid for HORIZONTAL layout (layoutWrap=WRAP, counterAxisAlignItems=BASELINE)
export function checkHorizontalOnly(node: NodeLike, prop: string, value: string): string | null {
  if (node.layoutMode === "HORIZONTAL") return null;
  return (
    `"${node.name}" (${node.id}): ${prop}=${value} is only valid when layoutMode is HORIZONTAL ` +
    `(current: ${node.layoutMode ?? "none"}).`
  );
}

// Resolve a node by id, throwing actionable errors for not-found / removed /
// wrong-type / locked instead of letting the Figma API fail later
export async function resolveNode(
  nodeId: string,
  opts?: { types?: string[]; requireUnlocked?: boolean }
): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(
      `Node not found: ${nodeId}. It may be on another page or the ID is stale — re-read the document.`
    );
  }
  if (node.removed) {
    throw new Error(`Node ${nodeId} has been deleted. Re-read the parent to get current children.`);
  }
  if (opts?.types) {
    const msg = checkNodeType(node as unknown as NodeLike, opts.types);
    if (msg) throw new Error(msg);
  }
  if (opts?.requireUnlocked && "locked" in node && node.locked) {
    throw new Error(`"${node.name}" (${nodeId}) is locked. Unlock it before modifying.`);
  }
  return node as SceneNode;
}

export function assertAutoLayoutFrame(node: NodeLike, prop: string): void {
  const msg = checkAutoLayoutFrame(node, prop);
  if (msg) throw new Error(msg);
}

export function assertAutoLayoutChild(node: NodeLike, prop: string): void {
  const msg = checkAutoLayoutChild(node, prop);
  if (msg) throw new Error(msg);
}

export function assertInAutoLayout(node: NodeLike, prop: string): void {
  const msg = checkInAutoLayout(node, prop);
  if (msg) throw new Error(msg);
}

export function assertPositiveSize(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new Error(`Width and height must be > 0 (got ${width}×${height}).`);
  }
}
