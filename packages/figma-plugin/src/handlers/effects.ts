import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

function makeColor(c?: { r: number; g: number; b: number; a?: number }) {
  return c ? { r: c.r, g: c.g, b: c.b, a: c.a ?? 0.25 } : { r: 0, g: 0, b: 0, a: 0.25 };
}

registerHandler("add_drop_shadow", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("effects" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const existing = [...((node as SceneNode & { effects: readonly Effect[] }).effects)];
  existing.push({
    type: "DROP_SHADOW",
    visible: true,
    color: makeColor(params.color as any),
    offset: { x: (params.offsetX as number) ?? 0, y: (params.offsetY as number) ?? 4 },
    radius: (params.radius as number) ?? 4,
    spread: (params.spread as number) ?? 0,
    blendMode: "NORMAL",
  });
  (node as any).effects = existing;
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("add_inner_shadow", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("effects" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const existing = [...((node as any).effects)];
  existing.push({
    type: "INNER_SHADOW",
    visible: true,
    color: makeColor(params.color as any),
    offset: { x: (params.offsetX as number) ?? 0, y: (params.offsetY as number) ?? 4 },
    radius: (params.radius as number) ?? 4,
    spread: (params.spread as number) ?? 0,
    blendMode: "NORMAL",
  });
  (node as any).effects = existing;
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("add_blur", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("effects" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const existing = [...((node as any).effects)];
  existing.push({
    type: "LAYER_BLUR",
    visible: true,
    radius: params.radius as number,
  });
  (node as any).effects = existing;
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("add_background_blur", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("effects" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  const existing = [...((node as any).effects)];
  existing.push({
    type: "BACKGROUND_BLUR",
    visible: true,
    radius: params.radius as number,
  });
  (node as any).effects = existing;
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});

registerHandler("remove_effects", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("effects" in node)) throw new Error(`Node not found: ${params.nodeId}`);
  (node as any).effects = [];
  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});
