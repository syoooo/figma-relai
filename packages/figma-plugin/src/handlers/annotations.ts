import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("get_annotations", async (params) => {
  let node: BaseNode | null;
  if (params.nodeId) {
    node = await getNodeById(params.nodeId as string);
  } else {
    node = figma.currentPage;
  }
  if (!node) throw new Error("Node not found");

  // Annotations API access
  if ("annotations" in node) {
    return (node as any).annotations;
  }
  return [];
});

// Figma takes the label as a string (labelMarkdown). An annotation read back
// can carry both label and labelMarkdown; existing ones are written back with
// one of the two, the markdown when there is one.
function writable(a: any): any {
  const { label, labelMarkdown, ...rest } = a;
  if (labelMarkdown !== undefined) return { ...rest, labelMarkdown };
  return label !== undefined ? { ...rest, label } : rest;
}

function unsupported(node: BaseNode): string {
  return `${node.type} nodes don't take annotations`;
}

registerHandler("set_annotation", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  if (!("annotations" in node)) throw new Error(unsupported(node));

  const annotation: any = { labelMarkdown: params.labelMarkdown as string };

  if (params.categoryId) annotation.categoryId = params.categoryId;
  if (params.properties) annotation.properties = params.properties;

  const existing = ((node as any).annotations || []).map(writable);
  if (params.annotationId) {
    const idx = existing.findIndex((a: any) => a.id === params.annotationId);
    if (idx >= 0) existing[idx] = { ...existing[idx], ...annotation };
    else existing.push(annotation);
  } else {
    existing.push(annotation);
  }
  (node as any).annotations = existing;

  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("set_multiple_annotations", async (params) => {
  const annotations = params.annotations as Array<{
    nodeId: string;
    labelMarkdown: string;
    categoryId?: string;
    annotationId?: string;
    properties?: Array<{ type: string }>;
  }>;

  const results = [];
  for (const ann of annotations) {
    try {
      const node = await getNodeById(ann.nodeId);
      if (node && "annotations" in node) {
        const existing = ((node as any).annotations || []).map(writable);
        existing.push({
          labelMarkdown: ann.labelMarkdown,
          ...(ann.categoryId ? { categoryId: ann.categoryId } : {}),
          ...(ann.properties ? { properties: ann.properties } : {}),
        });
        (node as any).annotations = existing;
        results.push({ nodeId: ann.nodeId, success: true });
      } else {
        results.push({ nodeId: ann.nodeId, success: false, error: node ? unsupported(node) : "Not found" });
      }
    } catch (err) {
      results.push({ nodeId: ann.nodeId, success: false, error: String(err) });
    }
  }

  return results;
});
