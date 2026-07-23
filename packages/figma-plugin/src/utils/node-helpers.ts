// Common node helper functions

// Strip Symbol values (e.g. figma.mixed) from an object for safe serialization
function stripSymbols(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "symbol") return "mixed";
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripSymbols);
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    clean[key] = stripSymbols(obj[key]);
  }
  return clean;
}

// Get a node by ID, with async support
export async function getNodeById(nodeId: string): Promise<BaseNode | null> {
  return figma.getNodeByIdAsync(nodeId);
}

// Budget options for serialization — bounds the response size so a single
// read of a large frame cannot blow up the AI's context window
export interface SerializeOptions {
  depth?: number; // levels of children to include (0 = none)
  maxNodes?: number; // total node budget across the subtree
  maxTextChars?: number; // per-node characters cap
}

export const SERIALIZE_DEFAULTS = { depth: 2, maxNodes: 100, maxTextChars: 300 };

// Extract serialize options from handler params, with per-handler defaults
export function serializeOptsFromParams(
  params: Record<string, unknown>,
  defaults?: SerializeOptions
): SerializeOptions {
  return {
    depth: (params.depth as number | undefined) ?? defaults?.depth,
    maxNodes: (params.maxNodes as number | undefined) ?? defaults?.maxNodes,
    maxTextChars: defaults?.maxTextChars,
  };
}

// Safely serialize a node's properties (filter non-serializable values).
// Depth- and budget-limited: truncated levels are replaced with childCount +
// a childrenTruncated marker telling the AI how to read deeper.
export function serializeNode(
  node: SceneNode,
  opts: SerializeOptions = {}
): Record<string, unknown> {
  const budget = { remaining: opts.maxNodes ?? SERIALIZE_DEFAULTS.maxNodes };
  const result = serializeSubtree(
    node,
    opts.depth ?? SERIALIZE_DEFAULTS.depth,
    opts.maxTextChars ?? SERIALIZE_DEFAULTS.maxTextChars,
    budget
  );
  // Strip any Symbol values (figma.mixed) to avoid postMessage serialization errors
  return stripSymbols(result);
}

function serializeSubtree(
  node: SceneNode,
  depth: number,
  maxTextChars: number,
  budget: { remaining: number }
): Record<string, unknown> {
  budget.remaining--;
  const result: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ("x" in node) result.x = node.x;
  if ("y" in node) result.y = node.y;
  if ("width" in node) result.width = node.width;
  if ("height" in node) result.height = node.height;

  if ("fills" in node) {
    try {
      result.fills = JSON.parse(JSON.stringify(node.fills));
    } catch (_e) {
      result.fills = [];
    }
  }

  if ("strokes" in node) {
    try {
      result.strokes = JSON.parse(JSON.stringify(node.strokes));
    } catch (_e) {
      result.strokes = [];
    }
  }

  if ("cornerRadius" in node) result.cornerRadius = node.cornerRadius;
  if ("opacity" in node) result.opacity = node.opacity;
  if ("characters" in node) {
    const chars = (node as TextNode).characters;
    if (chars.length > maxTextChars) {
      result.characters = chars.slice(0, maxTextChars);
      result.charactersTruncated = true;
      result.characterCount = chars.length;
    } else {
      result.characters = chars;
    }
  }
  if ("layoutMode" in node) result.layoutMode = (node as FrameNode).layoutMode;

  if ("children" in node) {
    const children = (node as FrameNode).children;
    result.childCount = children.length;
    if (depth <= 0 || budget.remaining <= 0) {
      if (children.length > 0) {
        result.childrenTruncated = `${children.length} children omitted — pass a larger depth or use get_node_tree`;
      }
    } else {
      const out: Record<string, unknown>[] = [];
      for (const child of children) {
        if (budget.remaining <= 0) break;
        out.push(serializeSubtree(child, depth - 1, maxTextChars, budget));
      }
      result.children = out;
      if (out.length < children.length) {
        result.childrenTruncated = `${children.length - out.length} of ${children.length} children omitted (node budget reached)`;
      }
    }
  }

  return result;
}

// Append a node to a parent if parentId is provided
export async function appendToParent(
  node: SceneNode,
  parentId?: string
): Promise<void> {
  if (!parentId) return;
  const parent = await getNodeById(parentId);
  if (!parent) {
    node.remove();
    throw new Error(`Parent not found: ${parentId}. The node was not created.`);
  }
  if (!("appendChild" in parent)) {
    node.remove();
    throw new Error(
      `Parent "${parent.name}" (${parentId}) is a ${parent.type} and cannot contain children. The node was not created.`
    );
  }
  (parent as FrameNode).appendChild(node);
}
