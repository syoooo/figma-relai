import { registerHandler } from "../dispatcher.js";
import {
  resolveNode,
  assertAutoLayoutFrame,
  assertAutoLayoutChild,
  assertInAutoLayout,
  checkHorizontalOnly,
} from "../utils/preconditions.js";

const AUTO_LAYOUT_TYPES = ["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"];

registerHandler("set_layout_mode", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: AUTO_LAYOUT_TYPES });
  const frame = node as FrameNode;
  frame.layoutMode = params.layoutMode as "NONE" | "HORIZONTAL" | "VERTICAL";
  if (params.layoutWrap) {
    const wrap = params.layoutWrap as "NO_WRAP" | "WRAP";
    if (wrap === "WRAP") {
      const msg = checkHorizontalOnly(frame, "layoutWrap", "WRAP");
      if (msg) throw new Error(msg);
    }
    frame.layoutWrap = wrap;
  }
  return { id: frame.id, name: frame.name, layoutMode: frame.layoutMode };
});

registerHandler("set_padding", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: AUTO_LAYOUT_TYPES });
  const frame = node as FrameNode;
  assertAutoLayoutFrame(frame, "padding");
  if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop as number;
  if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight as number;
  if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom as number;
  if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft as number;
  return { id: frame.id, name: frame.name };
});

registerHandler("set_axis_align", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: AUTO_LAYOUT_TYPES });
  const frame = node as FrameNode;
  assertAutoLayoutFrame(frame, "axis alignment");
  if (params.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = params.primaryAxisAlignItems as "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  }
  if (params.counterAxisAlignItems) {
    const align = params.counterAxisAlignItems as "MIN" | "MAX" | "CENTER" | "BASELINE";
    if (align === "BASELINE") {
      const msg = checkHorizontalOnly(frame, "counterAxisAlignItems", "BASELINE");
      if (msg) throw new Error(msg);
    }
    frame.counterAxisAlignItems = align;
  }
  return { id: frame.id, name: frame.name };
});

registerHandler("set_layout_sizing", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const h = params.layoutSizingHorizontal as "FIXED" | "HUG" | "FILL" | undefined;
  const v = params.layoutSizingVertical as "FIXED" | "HUG" | "FILL" | undefined;

  assertInAutoLayout(node, "layoutSizing");
  if (h === "FILL" || v === "FILL") assertAutoLayoutChild(node, "layoutSizing FILL");
  const isHuggable =
    node.type === "TEXT" || ("layoutMode" in node && node.layoutMode !== "NONE");
  if ((h === "HUG" || v === "HUG") && !isHuggable) {
    throw new Error(
      `"${node.name}" (${node.id}): HUG only applies to auto-layout frames and text nodes (this is a ${node.type}).`
    );
  }

  const target = node as FrameNode;
  if (h) target.layoutSizingHorizontal = h;
  if (v) target.layoutSizingVertical = v;
  return {
    id: target.id,
    name: target.name,
    layoutSizingHorizontal: target.layoutSizingHorizontal,
    layoutSizingVertical: target.layoutSizingVertical,
  };
});

registerHandler("set_item_spacing", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: AUTO_LAYOUT_TYPES });
  const frame = node as FrameNode;
  assertAutoLayoutFrame(frame, "itemSpacing");
  if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing as number;
  if (params.counterAxisSpacing !== undefined) frame.counterAxisSpacing = params.counterAxisSpacing as number;
  return { id: frame.id, name: frame.name };
});
