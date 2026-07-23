import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("set_focus", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("type" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  figma.currentPage.selection = [node as SceneNode];
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("set_selections", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await getNodeById(id);
    if (node && "type" in node) nodes.push(node as SceneNode);
  }
  figma.currentPage.selection = nodes;
  if (nodes.length > 0) figma.viewport.scrollAndZoomIntoView(nodes);
  return { selectedCount: nodes.length };
});

registerHandler("get_viewport", async () => {
  const { x, y } = figma.viewport.center;
  return { x, y, zoom: figma.viewport.zoom };
});

registerHandler("set_viewport", async (params) => {
  figma.viewport.center = { x: params.x as number, y: params.y as number };
  figma.viewport.zoom = params.zoom as number;
  return { x: params.x, y: params.y, zoom: params.zoom };
});
