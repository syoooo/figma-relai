import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";
import { solidPaint } from "../utils/color.js";

registerHandler("get_styles", async () => {
  const paintStyles = await figma.getLocalPaintStylesAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const effectStyles = await figma.getLocalEffectStylesAsync();
  const gridStyles = await figma.getLocalGridStylesAsync();

  return {
    paintStyles: paintStyles.map((s) => ({ id: s.id, name: s.name, type: "PAINT" })),
    textStyles: textStyles.map((s) => ({ id: s.id, name: s.name, type: "TEXT" })),
    effectStyles: effectStyles.map((s) => ({ id: s.id, name: s.name, type: "EFFECT" })),
    gridStyles: gridStyles.map((s) => ({ id: s.id, name: s.name, type: "GRID" })),
  };
});

registerHandler("create_paint_style", async (params) => {
  const style = figma.createPaintStyle();
  style.name = params.name as string;
  if (params.color) {
    style.paints = [solidPaint(params.color as any)];
  }
  return { id: style.id, name: style.name };
});

registerHandler("create_text_style", async (params) => {
  const style = figma.createTextStyle();
  style.name = params.name as string;
  if (params.fontSize) style.fontSize = params.fontSize as number;
  return { id: style.id, name: style.name };
});

registerHandler("create_effect_style", async (params) => {
  const style = figma.createEffectStyle();
  style.name = params.name as string;

  const effectType = params.effectType as string;
  if (effectType === "DROP_SHADOW" || effectType === "INNER_SHADOW") {
    const c = (params.color as any) || { r: 0, g: 0, b: 0, a: 0.25 };
    style.effects = [{
      type: effectType as "DROP_SHADOW" | "INNER_SHADOW",
      visible: true,
      color: { r: c.r, g: c.g, b: c.b, a: c.a ?? 0.25 },
      offset: { x: (params.offsetX as number) ?? 0, y: (params.offsetY as number) ?? 4 },
      radius: (params.radius as number) ?? 4,
      spread: (params.spread as number) ?? 0,
      blendMode: "NORMAL",
    }];
  } else if (effectType === "LAYER_BLUR" || effectType === "BACKGROUND_BLUR") {
    style.effects = [{
      type: effectType as "LAYER_BLUR" | "BACKGROUND_BLUR",
      blurType: "NORMAL",
      visible: true,
      radius: (params.radius as number) ?? 4,
    }];
  }

  return { id: style.id, name: style.name };
});

registerHandler("create_grid_style", async (params) => {
  const style = figma.createGridStyle();
  style.name = params.name as string;
  if (params.grids) {
    style.layoutGrids = params.grids as LayoutGrid[];
  }
  return { id: style.id, name: style.name };
});

registerHandler("reorder_style", async (params) => {
  const styleType = params.styleType as string;
  const styleId = params.styleId as string;
  const afterStyleId = (params.afterStyleId as string) || "";

  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) throw new Error(`Style not found: ${styleId}`);

  const afterStyle = afterStyleId ? await figma.getStyleByIdAsync(afterStyleId) : null;

  if (styleType === "paint") {
    figma.moveLocalPaintStyleAfter(style as PaintStyle, afterStyle as PaintStyle | null);
  } else if (styleType === "text") {
    figma.moveLocalTextStyleAfter(style as TextStyle, afterStyle as TextStyle | null);
  } else if (styleType === "effect") {
    figma.moveLocalEffectStyleAfter(style as EffectStyle, afterStyle as EffectStyle | null);
  } else if (styleType === "grid") {
    figma.moveLocalGridStyleAfter(style as GridStyle, afterStyle as GridStyle | null);
  }

  return { success: true, styleId, afterStyleId };
});

registerHandler("delete_style", async (params) => {
  const styleId = params.styleId as string;
  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) throw new Error(`Style not found: ${styleId}`);
  const name = style.name;
  style.remove();
  return { success: true, name };
});

registerHandler("apply_style", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const styleId = params.styleId as string;
  const styleType = params.styleType as string;
  const sceneNode = node as SceneNode;

  if (styleType === "fill" && "setFillStyleIdAsync" in sceneNode) {
    await (sceneNode as any).setFillStyleIdAsync(styleId);
  } else if (styleType === "stroke" && "setStrokeStyleIdAsync" in sceneNode) {
    await (sceneNode as any).setStrokeStyleIdAsync(styleId);
  } else if (styleType === "text" && "setTextStyleIdAsync" in sceneNode) {
    await (sceneNode as any).setTextStyleIdAsync(styleId);
  } else if (styleType === "effect" && "setEffectStyleIdAsync" in sceneNode) {
    await (sceneNode as any).setEffectStyleIdAsync(styleId);
  }

  return { id: sceneNode.id, name: sceneNode.name, styleType };
});

registerHandler("update_style", async (params) => {
  const style = await figma.getStyleByIdAsync(params.styleId as string);
  if (!style) throw new Error(`Style not found: ${params.styleId}`);
  if (params.name) style.name = params.name as string;
  return { id: style.id, name: style.name };
});
