import { registerHandler } from "../dispatcher.js";
import { resolveNode, assertSupports } from "../utils/preconditions.js";
import { solidPaint } from "../utils/color.js";

registerHandler("set_fill_color", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "fills");
  const color = params.color as { r: number; g: number; b: number; a?: number };
  (node as GeometryMixin).fills = [solidPaint(color)];
  return { id: node.id, name: node.name };
});

registerHandler("set_fills", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  if (params.fills !== undefined) {
    assertSupports(node, "fills");
    (node as GeometryMixin).fills = params.fills as Paint[];
  }
  if (params.strokes !== undefined) {
    assertSupports(node, "strokes");
    (node as GeometryMixin).strokes = params.strokes as Paint[];
  }
  const g = node as GeometryMixin;
  return {
    id: node.id,
    name: node.name,
    fillCount: g.fills === figma.mixed ? "mixed" : (g.fills as Paint[]).length,
    strokeCount: (g.strokes as Paint[]).length,
  };
});

registerHandler("set_stroke_color", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "strokes");
  const color = params.color as { r: number; g: number; b: number; a?: number };
  (node as GeometryMixin).strokes = [solidPaint(color)];
  if (params.weight !== undefined) {
    (node as GeometryMixin).strokeWeight = params.weight as number;
  }
  return { id: node.id, name: node.name };
});

registerHandler("set_corner_radius", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const radius = params.radius as number;
  const corners = params.corners as boolean[] | undefined;

  if (corners) {
    // Per-corner radii need RectangleCornerMixin (rectangles, frames, components…)
    assertSupports(node, "topLeftRadius");
    const rect = node as RectangleNode;
    if (corners[0]) rect.topLeftRadius = radius;
    if (corners[1]) rect.topRightRadius = radius;
    if (corners[2]) rect.bottomRightRadius = radius;
    if (corners[3]) rect.bottomLeftRadius = radius;
  } else {
    assertSupports(node, "cornerRadius");
    (node as RectangleNode).cornerRadius = radius;
  }
  return { id: node.id, name: node.name };
});

registerHandler("set_blend_mode", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "blendMode");
  (node as SceneNode & BlendMixin).blendMode = params.blendMode as BlendMode;
  return { id: node.id, name: node.name };
});

registerHandler("set_clips_content", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "clipsContent");
  (node as FrameNode).clipsContent = params.clipsContent as boolean;
  return { id: node.id, name: node.name, clipsContent: (node as FrameNode).clipsContent };
});

registerHandler("set_layout_grids", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "layoutGrids");
  (node as FrameNode).layoutGrids = params.layoutGrids as LayoutGrid[];
  return { id: node.id, name: node.name };
});

registerHandler("set_aspect_ratio", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "lockAspectRatio");
  if (params.lock) {
    (node as any).lockAspectRatio();
  } else {
    (node as any).unlockAspectRatio();
  }
  return { id: node.id, name: node.name };
});

registerHandler("set_gradient_fill", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  assertSupports(node, "fills");

  const rawStops = params.stops as Array<{
    position: number;
    color: { r: number; g: number; b: number; a?: number };
  }>;
  if (!rawStops || rawStops.length < 2) {
    throw new Error(`A gradient needs at least 2 stops (got ${rawStops?.length ?? 0}).`);
  }
  for (const s of rawStops) {
    if (s.position < 0 || s.position > 1) {
      throw new Error(`Gradient stop positions must be between 0 and 1 (got ${s.position}).`);
    }
  }

  const stops = rawStops.map((s) => ({
    position: s.position,
    color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a ?? 1 },
  }));

  const gradientPaint: GradientPaint = {
    type: params.gradientType as "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: stops,
  };

  (node as GeometryMixin).fills = [gradientPaint];
  return { id: node.id, name: node.name };
});
