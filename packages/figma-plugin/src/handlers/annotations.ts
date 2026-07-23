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

registerHandler("set_annotation", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  const annotation: any = {
    label: { type: "markdown", value: params.labelMarkdown as string },
  };

  if (params.categoryId) annotation.categoryId = params.categoryId;
  if (params.properties) annotation.properties = params.properties;

  if ("annotations" in node) {
    const existing = [...((node as any).annotations || [])];
    if (params.annotationId) {
      const idx = existing.findIndex((a: any) => a.id === params.annotationId);
      if (idx >= 0) existing[idx] = { ...existing[idx], ...annotation };
      else existing.push(annotation);
    } else {
      existing.push(annotation);
    }
    (node as any).annotations = existing;
  }

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
        const existing = [...((node as any).annotations || [])];
        existing.push({
          label: { type: "markdown", value: ann.labelMarkdown },
          categoryId: ann.categoryId,
          properties: ann.properties,
        });
        (node as any).annotations = existing;
        results.push({ nodeId: ann.nodeId, success: true });
      } else {
        results.push({ nodeId: ann.nodeId, success: false, error: "Not found" });
      }
    } catch (err) {
      results.push({ nodeId: ann.nodeId, success: false, error: String(err) });
    }
  }

  return results;
});
