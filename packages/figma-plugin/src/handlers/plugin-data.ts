import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("set_plugin_data", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  node.setPluginData(params.key as string, params.value as string);
  return { id: (node as SceneNode).id, key: params.key, success: true };
});

registerHandler("get_plugin_data", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const value = node.getPluginData(params.key as string);
  return { id: (node as SceneNode).id, key: params.key, value };
});
