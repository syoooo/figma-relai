import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";
import { resolveNode, assertSupports, assertPositiveSize } from "../utils/preconditions.js";

registerHandler("move_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "x");
  node.x = params.x as number;
  node.y = params.y as number;
  return { id: node.id, name: node.name, x: node.x, y: node.y };
});

registerHandler("resize_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "resize");
  // Partial resize keeps the other dimension (set_properties may send just one)
  const sized = node as SceneNode & { width: number; height: number; resize: (w: number, h: number) => void };
  const width = (params.width as number | undefined) ?? sized.width;
  const height = (params.height as number | undefined) ?? sized.height;
  assertPositiveSize(width, height);
  sized.resize(width, height);
  return { id: node.id, name: node.name, width, height };
});

registerHandler("clone_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "clone");
  const clone = node.clone();
  if (params.x !== undefined) clone.x = params.x as number;
  if (params.y !== undefined) clone.y = params.y as number;
  return { id: clone.id, name: clone.name };
});

registerHandler("delete_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const name = node.name;
  node.remove();
  return { success: true, name };
});

registerHandler("delete_multiple_nodes", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const results = [];
  for (const nodeId of nodeIds) {
    const node = await getNodeById(nodeId);
    if (node && !node.removed) {
      const name = (node as SceneNode).name;
      node.remove();
      results.push({ id: nodeId, name, deleted: true });
    } else {
      results.push({ id: nodeId, deleted: false, error: "Not found" });
    }
  }
  return results;
});

registerHandler("rename_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  node.name = params.name as string;
  return { id: node.id, name: node.name };
});

registerHandler("set_opacity", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "opacity");
  (node as SceneNode & MinimalBlendMixin).opacity = params.opacity as number;
  return { id: node.id, opacity: (node as SceneNode & MinimalBlendMixin).opacity };
});

registerHandler("set_visible", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  node.visible = params.visible as boolean;
  return { id: node.id, name: node.name, visible: node.visible };
});

registerHandler("set_locked", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  node.locked = params.locked as boolean;
  return { id: node.id, name: node.name, locked: node.locked };
});

registerHandler("reparent_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const newParent = await resolveNode(params.parentId as string);
  assertSupports(newParent, "appendChild");
  const parent = newParent as unknown as FrameNode;
  const index = params.index as number | undefined;
  if (index !== undefined) {
    parent.insertChild(index, node);
  } else {
    parent.appendChild(node);
  }
  return { id: node.id, name: node.name, newParentId: parent.id };
});

registerHandler("set_rotation", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "rotation");
  (node as SceneNode & LayoutMixin).rotation = params.rotation as number;
  return { id: node.id, name: node.name, rotation: (node as SceneNode & LayoutMixin).rotation };
});

registerHandler("set_relaunch_data", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  node.setRelaunchData(params.data as { [command: string]: string });
  return { id: node.id, name: node.name };
});

registerHandler("get_relaunch_data", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  return { id: node.id, data: node.getRelaunchData() };
});

registerHandler("reorder_node", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const parent = node.parent;
  if (!parent || !("children" in parent)) {
    throw new Error(`"${node.name}" (${node.id}) has no parent with children — cannot reorder.`);
  }

  const siblings = (parent as FrameNode).children;
  const idx = siblings.indexOf(node);
  const direction = params.direction as string;

  if (direction === "FRONT") {
    (parent as FrameNode).insertChild(siblings.length - 1, node);
  } else if (direction === "BACK") {
    (parent as FrameNode).insertChild(0, node);
  } else if (direction === "FORWARD" && idx < siblings.length - 1) {
    (parent as FrameNode).insertChild(idx + 1, node);
  } else if (direction === "BACKWARD" && idx > 0) {
    (parent as FrameNode).insertChild(idx - 1, node);
  }

  return { id: node.id, name: node.name, direction };
});
