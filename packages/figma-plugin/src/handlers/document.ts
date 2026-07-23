import { registerHandler } from "../dispatcher.js";
import {
  getNodeById,
  serializeNode,
  serializeOptsFromParams,
} from "../utils/node-helpers.js";

// Document info, selection, and design reading handlers

registerHandler("get_document_info", async () => {
  const page = figma.currentPage;
  return {
    name: figma.root.name,
    currentPage: {
      id: page.id,
      name: page.name,
      childCount: page.children.length,
    },
    pages: figma.root.children.map((p) => ({
      id: p.id,
      name: p.name,
    })),
  };
});

registerHandler("get_selection", async (params) => {
  const selection = figma.currentPage.selection;
  // Selection reads are for orientation — shallow by default
  const opts = serializeOptsFromParams(params ?? {}, { depth: 1 });
  return {
    count: selection.length,
    nodes: selection.map((node) => serializeNode(node, opts)),
  };
});

registerHandler("get_selection_colors", async () => {
  const colors = figma.getSelectionColors();
  return colors;
});

registerHandler("set_file_thumbnail", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  await figma.setFileThumbnailNodeAsync(node as FrameNode | ComponentNode | ComponentSetNode | SectionNode);
  return { success: true, nodeId: (node as SceneNode).id };
});

registerHandler("figma_notify", async (params) => {
  const message = params.message as string;
  const options: any = {};
  if (params.error) options.error = true;
  if (params.timeout) options.timeout = params.timeout as number;
  figma.notify(message, options);
  return { success: true, message };
});

registerHandler("read_my_design", async (params) => {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { error: "No nodes selected" };
  }
  const opts = serializeOptsFromParams(params ?? {});
  return {
    count: selection.length,
    nodes: selection.map((node) => serializeNode(node, opts)),
  };
});

registerHandler("get_file_info", async () => {
  // fileKey is undefined in some contexts (e.g. unsaved drafts); callers
  // fall back to asking for the file URL
  return { fileKey: figma.fileKey ?? null, fileName: figma.root.name };
});
