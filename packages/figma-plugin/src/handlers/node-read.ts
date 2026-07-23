import { registerHandler } from "../dispatcher.js";
import {
  getNodeById,
  serializeNode,
  serializeOptsFromParams,
} from "../utils/node-helpers.js";
import { sendProgressUpdate, delay } from "../progress.js";

registerHandler("get_node_info", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("type" in node)) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }
  return serializeNode(node as SceneNode, serializeOptsFromParams(params));
});

registerHandler("get_nodes_info", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const opts = serializeOptsFromParams(params);
  const results = [];
  for (const nodeId of nodeIds) {
    const node = await getNodeById(nodeId);
    if (node && "type" in node) {
      results.push(serializeNode(node as SceneNode, opts));
    }
  }
  return results;
});

registerHandler("get_css", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("getCSSAsync" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const css = await (node as SceneNode).getCSSAsync();
  return { id: (node as SceneNode).id, css };
});

registerHandler("find_nodes", async (params) => {
  const parentId = params.nodeId as string | undefined;
  let parent: BaseNode & ChildrenMixin;
  if (parentId) {
    const node = await getNodeById(parentId);
    if (!node || !("children" in node)) throw new Error(`Parent not found: ${parentId}`);
    if (node.type === "PAGE") await (node as PageNode).loadAsync();
    parent = node as BaseNode & ChildrenMixin;
  } else {
    parent = figma.currentPage;
  }

  const namePattern = params.name as string | undefined;
  const types = params.types as string[] | undefined;
  const typeSet = types ? new Set(types) : null;

  const matches = parent.findAll((node) => {
    if (typeSet && !typeSet.has(node.type)) return false;
    if (namePattern && !node.name.includes(namePattern)) return false;
    return true;
  });

  // Matches are returned flat — default to no children to avoid subtree duplication
  const opts = serializeOptsFromParams(params, { depth: 0 });
  return matches.map((n) => serializeNode(n as SceneNode, opts));
});

// Sparse tree for orientation in large files: tiny rows, generous depth.
// Mirrors the official Figma MCP get_metadata workflow — read this first,
// then fetch details for specific nodes with get_node_info.
registerHandler("get_node_tree", async (params) => {
  let root: BaseNode;
  if (params.nodeId) {
    const node = await getNodeById(params.nodeId as string);
    if (!node) throw new Error(`Node not found: ${params.nodeId}`);
    root = node;
  } else {
    root = figma.currentPage;
  }
  if (root.type === "PAGE") await (root as PageNode).loadAsync();

  const maxDepth = (params.depth as number | undefined) ?? 5;
  const budget = { remaining: (params.maxNodes as number | undefined) ?? 500 };

  function sparse(node: BaseNode, depth: number): Record<string, unknown> {
    budget.remaining--;
    const row: Record<string, unknown> = {
      id: node.id,
      name: node.name,
      type: node.type,
    };
    if ("x" in node) row.x = node.x;
    if ("y" in node) row.y = node.y;
    if ("width" in node) row.width = node.width;
    if ("height" in node) row.height = node.height;
    if ("children" in node) {
      const children = (node as FrameNode).children;
      row.childCount = children.length;
      if (depth > 0 && budget.remaining > 0) {
        const out: Record<string, unknown>[] = [];
        for (const child of children) {
          if (budget.remaining <= 0) break;
          out.push(sparse(child, depth - 1));
        }
        row.children = out;
        if (out.length < children.length) {
          row.childrenTruncated = children.length - out.length;
        }
      }
    }
    return row;
  }

  return sparse(root, maxDepth);
});

registerHandler("get_bound_variables", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const sceneNode = node as SceneNode;
  return {
    id: sceneNode.id,
    name: sceneNode.name,
    boundVariables: (sceneNode as any).boundVariables || {},
  };
});

registerHandler("scan_nodes_by_types", async (params) => {
  const parentNode = await getNodeById(params.nodeId as string);
  if (!parentNode || !("children" in parentNode)) {
    throw new Error(`Parent node not found or has no children: ${params.nodeId}`);
  }

  // PageNode requires loadAsync() before accessing children
  if (parentNode.type === "PAGE") {
    await (parentNode as PageNode).loadAsync();
  }

  const types = new Set(params.types as string[]);
  const results: ReturnType<typeof serializeNode>[] = [];
  const commandId = params.commandId as string;
  // Matches are returned flat — default to no children to avoid subtree duplication
  const opts = serializeOptsFromParams(params, { depth: 0 });

  function scan(node: BaseNode) {
    if ("type" in node && types.has(node.type)) {
      results.push(serializeNode(node as SceneNode, opts));
    }
    if ("children" in node) {
      for (const child of (node as FrameNode).children) {
        scan(child);
      }
    }
  }

  scan(parentNode);

  sendProgressUpdate({
    commandId,
    commandType: "scan_nodes_by_types",
    status: "completed",
    progress: 100,
    totalItems: results.length,
    processedItems: results.length,
    message: `Found ${results.length} nodes`,
  });

  return results;
});
