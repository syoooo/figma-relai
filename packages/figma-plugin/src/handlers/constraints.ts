import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("set_constraints", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("constraints" in node)) throw new Error(`Node not found: ${params.nodeId}`);

  const sceneNode = node as SceneNode & { constraints: Constraints };
  const current = { ...sceneNode.constraints };

  if (params.horizontal) current.horizontal = params.horizontal as ConstraintType;
  if (params.vertical) current.vertical = params.vertical as ConstraintType;

  sceneNode.constraints = current;
  return { id: sceneNode.id, name: sceneNode.name, constraints: current };
});

registerHandler("set_min_max_size", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const sceneNode = node as any;

  if (params.minWidth !== undefined) sceneNode.minWidth = params.minWidth;
  if (params.maxWidth !== undefined) sceneNode.maxWidth = params.maxWidth;
  if (params.minHeight !== undefined) sceneNode.minHeight = params.minHeight;
  if (params.maxHeight !== undefined) sceneNode.maxHeight = params.maxHeight;

  return { id: sceneNode.id, name: sceneNode.name };
});
