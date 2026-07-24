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

// ─── File conventions: a CLAUDE.md for this Figma file ──────────────
// Stored as SHARED plugin data on the document root so it travels with the
// file, survives plugin restarts, and other tooling can read it too.

const CONVENTIONS_NS = "relai";
const CONVENTIONS_KEY = "conventions";
const CONVENTIONS_MAX_CHARS = 20000;

registerHandler("get_conventions", async () => {
  const content = figma.root.getSharedPluginData(CONVENTIONS_NS, CONVENTIONS_KEY);
  return { content: content || null };
});

registerHandler("set_conventions", async (params) => {
  const content = (params.content as string) ?? "";
  if (content.length > CONVENTIONS_MAX_CHARS) {
    throw new Error(
      `Conventions doc is ${content.length} chars — keep it under ${CONVENTIONS_MAX_CHARS} (it's loaded into every session's context).`
    );
  }
  figma.root.setSharedPluginData(CONVENTIONS_NS, CONVENTIONS_KEY, content);
  figma.ui.postMessage({ type: "conventions-state", present: content.length > 0, content });
  return { saved: content.length > 0, chars: content.length };
});
