import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("group_nodes", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await getNodeById(id);
    if (node && "type" in node) nodes.push(node as SceneNode);
  }
  if (nodes.length < 2) throw new Error("Need at least 2 nodes to group");
  const group = figma.group(nodes, nodes[0].parent as FrameNode);
  return { id: group.id, name: group.name };
});

registerHandler("ungroup_nodes", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || node.type !== "GROUP") throw new Error(`Group not found: ${params.nodeId}`);
  const group = node as GroupNode;
  const parent = group.parent as FrameNode;
  const children = [...group.children];
  for (const child of children) {
    parent.appendChild(child);
  }
  group.remove();
  return { success: true, childCount: children.length };
});

registerHandler("flatten_node", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("type" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const flat = figma.flatten([node as SceneNode]);
  return { id: flat.id, name: flat.name };
});

registerHandler("create_component_from_node", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("type" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const component = figma.createComponentFromNode(node as SceneNode);
  return { id: component.id, name: component.name };
});

registerHandler("boolean_operation", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const operation = params.operation as string;
  const nodes: SceneNode[] = [];

  for (const id of nodeIds) {
    const node = await getNodeById(id);
    if (node && "type" in node) nodes.push(node as SceneNode);
  }

  if (nodes.length < 2) throw new Error("Need at least 2 nodes");

  let result: SceneNode;
  switch (operation) {
    case "UNION":
      result = figma.union(nodes, nodes[0].parent as FrameNode);
      break;
    case "SUBTRACT":
      result = figma.subtract(nodes, nodes[0].parent as FrameNode);
      break;
    case "INTERSECT":
      result = figma.intersect(nodes, nodes[0].parent as FrameNode);
      break;
    case "EXCLUDE":
      result = figma.exclude(nodes, nodes[0].parent as FrameNode);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  return { id: result.id, name: result.name, operation };
});
