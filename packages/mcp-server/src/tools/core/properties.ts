import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import {
  colorSchema,
  dimensionSchema,
  layoutModeSchema,
  layoutWrapSchema,
  primaryAxisAlignSchema,
  counterAxisAlignSchema,
  sizingModeSchema,
  blendModeSchema,
  gradientTypeSchema,
  gradientStopSchema,
  constraintTypeSchema,
} from "@figma-relai/shared";
import type { FigmaCommand } from "@figma-relai/shared";
import { jsonResult, errorResult, textResult } from "./helpers.js";

// One declarative properties object covering the write surface that used to
// be ~55 granular set_*/add_* tools. Each field group maps to one plugin
// command; multiple groups (or multiple nodes) fan out via batch_execute.

const effectSchema = z.object({
  type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]),
  color: colorSchema.optional().describe("Shadow color (shadows only)"),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  radius: z.number().min(0).optional().describe("Blur radius"),
  spread: z.number().optional(),
});

export const propertiesSchema = z
  .object({
    // Geometry
    x: z.number().optional(),
    y: z.number().optional(),
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    rotation: z.number().optional().describe("Degrees"),
    // Identity / visibility
    name: z.string().optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
    blendMode: blendModeSchema.optional(),
    // Paint
    fillColor: colorSchema.optional(),
    fills: z
      .array(z.record(z.unknown()))
      .optional()
      .describe("Raw Paint[] — replaces the whole fill list; [] clears all fills"),
    strokes: z
      .array(z.record(z.unknown()))
      .optional()
      .describe("Raw Paint[] — replaces the whole stroke list; [] clears all strokes"),
    strokeColor: colorSchema.optional(),
    strokeWeight: z.number().min(0).optional(),
    cornerRadius: z.number().min(0).optional(),
    corners: z
      .array(z.boolean())
      .length(4)
      .optional()
      .describe("With cornerRadius: apply per corner [TL, TR, BR, BL]"),
    gradient: z
      .object({ gradientType: gradientTypeSchema, stops: z.array(gradientStopSchema).min(2) })
      .optional(),
    // Effects (replaces existing effects list entry of same type)
    effects: z.array(effectSchema).optional(),
    removeEffects: z.boolean().optional(),
    // Text
    text: z.string().optional().describe("Text content (TEXT nodes)"),
    // Auto-layout (frame itself)
    layoutMode: layoutModeSchema.optional(),
    layoutWrap: layoutWrapSchema.optional().describe("WRAP requires layoutMode HORIZONTAL"),
    paddingTop: z.number().min(0).optional(),
    paddingRight: z.number().min(0).optional(),
    paddingBottom: z.number().min(0).optional(),
    paddingLeft: z.number().min(0).optional(),
    primaryAxisAlignItems: primaryAxisAlignSchema.optional(),
    counterAxisAlignItems: counterAxisAlignSchema.optional(),
    itemSpacing: z.number().optional(),
    counterAxisSpacing: z.number().optional(),
    // Auto-layout (as a child; FILL requires the PARENT to have auto-layout)
    layoutSizingHorizontal: sizingModeSchema.optional(),
    layoutSizingVertical: sizingModeSchema.optional(),
    // Constraints & sizing limits
    constraintsHorizontal: constraintTypeSchema.optional(),
    constraintsVertical: constraintTypeSchema.optional(),
    minWidth: z.number().min(0).optional(),
    maxWidth: z.number().min(0).optional(),
    minHeight: z.number().min(0).optional(),
    maxHeight: z.number().min(0).optional(),
    aspectRatioLocked: z.boolean().optional(),
    clipsContent: z.boolean().optional(),
    // Design-system bindings
    styleId: z.string().optional().describe("Apply a paint/text/effect/grid style by id"),
    styleType: z.enum(["PAINT", "TEXT", "EFFECT", "GRID"]).optional(),
    boundVariables: z
      .record(z.string())
      .optional()
      .describe('Bind variables: {"fills": "VariableID:...", "width": "..."}'),
  })
  .strict();

export type NodeProperties = z.infer<typeof propertiesSchema>;

interface PluginCall {
  command: string;
  params: Record<string, unknown>;
}

function defined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Pure mapper: declarative properties → ordered plugin commands for one node.
// Order matters: layoutMode must precede padding/align/sizing on fresh frames.
export function mapPropertiesToCommands(nodeId: string, p: NodeProperties): PluginCall[] {
  const calls: PluginCall[] = [];
  const add = (command: string, params: Record<string, unknown>) =>
    calls.push({ command, params: { nodeId, ...defined(params) } });

  if (p.name !== undefined) add("rename_node", { name: p.name });
  if (p.visible !== undefined) add("set_visible", { visible: p.visible });
  if (p.locked !== undefined) add("set_locked", { locked: p.locked });

  if (p.x !== undefined || p.y !== undefined) add("move_node", { x: p.x, y: p.y });
  if (p.width !== undefined || p.height !== undefined)
    add("resize_node", { width: p.width, height: p.height });
  if (p.rotation !== undefined) add("set_rotation", { rotation: p.rotation });

  if (p.layoutMode !== undefined)
    add("set_layout_mode", { layoutMode: p.layoutMode, layoutWrap: p.layoutWrap });
  if (
    p.paddingTop !== undefined ||
    p.paddingRight !== undefined ||
    p.paddingBottom !== undefined ||
    p.paddingLeft !== undefined
  )
    add("set_padding", {
      paddingTop: p.paddingTop,
      paddingRight: p.paddingRight,
      paddingBottom: p.paddingBottom,
      paddingLeft: p.paddingLeft,
    });
  if (p.primaryAxisAlignItems !== undefined || p.counterAxisAlignItems !== undefined)
    add("set_axis_align", {
      primaryAxisAlignItems: p.primaryAxisAlignItems,
      counterAxisAlignItems: p.counterAxisAlignItems,
    });
  if (p.itemSpacing !== undefined || p.counterAxisSpacing !== undefined)
    add("set_item_spacing", {
      itemSpacing: p.itemSpacing,
      counterAxisSpacing: p.counterAxisSpacing,
    });
  if (p.layoutSizingHorizontal !== undefined || p.layoutSizingVertical !== undefined)
    add("set_layout_sizing", {
      layoutSizingHorizontal: p.layoutSizingHorizontal,
      layoutSizingVertical: p.layoutSizingVertical,
    });

  if (p.fills !== undefined || p.strokes !== undefined)
    add("set_fills", {
      ...(p.fills !== undefined ? { fills: p.fills } : {}),
      ...(p.strokes !== undefined ? { strokes: p.strokes } : {}),
    });
  if (p.fillColor !== undefined) add("set_fill_color", { color: p.fillColor });
  if (p.strokeColor !== undefined || p.strokeWeight !== undefined)
    add("set_stroke_color", {
      color: p.strokeColor ?? { r: 0, g: 0, b: 0, a: 1 },
      weight: p.strokeWeight,
    });
  if (p.gradient !== undefined)
    add("set_gradient_fill", { gradientType: p.gradient.gradientType, stops: p.gradient.stops });
  if (p.cornerRadius !== undefined)
    add("set_corner_radius", { radius: p.cornerRadius, corners: p.corners });
  if (p.opacity !== undefined) add("set_opacity", { opacity: p.opacity });
  if (p.blendMode !== undefined) add("set_blend_mode", { blendMode: p.blendMode });

  if (p.removeEffects) add("remove_effects", {});
  for (const effect of p.effects ?? []) {
    const common = {
      color: effect.color,
      offsetX: effect.offsetX,
      offsetY: effect.offsetY,
      radius: effect.radius,
      spread: effect.spread,
    };
    if (effect.type === "DROP_SHADOW") add("add_drop_shadow", common);
    else if (effect.type === "INNER_SHADOW") add("add_inner_shadow", common);
    else if (effect.type === "LAYER_BLUR") add("add_blur", { radius: effect.radius });
    else add("add_background_blur", { radius: effect.radius });
  }

  if (p.text !== undefined) add("set_text_content", { text: p.text });

  if (p.constraintsHorizontal !== undefined || p.constraintsVertical !== undefined)
    add("set_constraints", {
      horizontal: p.constraintsHorizontal,
      vertical: p.constraintsVertical,
    });
  if (
    p.minWidth !== undefined ||
    p.maxWidth !== undefined ||
    p.minHeight !== undefined ||
    p.maxHeight !== undefined
  )
    add("set_min_max_size", {
      minWidth: p.minWidth,
      maxWidth: p.maxWidth,
      minHeight: p.minHeight,
      maxHeight: p.maxHeight,
    });
  if (p.aspectRatioLocked !== undefined) add("set_aspect_ratio", { lock: p.aspectRatioLocked });
  if (p.clipsContent !== undefined) add("set_clips_content", { clipsContent: p.clipsContent });

  if (p.styleId !== undefined)
    add("apply_style", { styleId: p.styleId, styleType: p.styleType });
  for (const [property, variableId] of Object.entries(p.boundVariables ?? {})) {
    add("bind_variable", { property, variableId });
  }

  return calls;
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "set_properties",
    "Set any visual/layout/text properties on one or more nodes in a single call: geometry (x/y/width/height/rotation), fills/strokes/gradients/cornerRadius/opacity/effects, text content, auto-layout (layoutMode, padding, alignment, spacing, layoutSizing — FILL requires the parent to have auto-layout), constraints, style application, and variable bindings. Groups map to focused operations with per-operation success/error reporting. dryRun:true previews the mapped command list without touching the canvas.",
    {
      nodeIds: z.array(z.string()).min(1).describe("Node IDs to update"),
      properties: propertiesSchema.describe("Properties to apply to every listed node"),
      dryRun: z.boolean().optional().describe("Preview only — return the plan, execute nothing"),
    },
    { idempotentHint: true },
    async ({ nodeIds, properties, dryRun }) => {
      try {
        const commands = nodeIds.flatMap((nodeId) =>
          mapPropertiesToCommands(nodeId, properties)
        );
        if (commands.length === 0) return textResult("No properties given — nothing to do.");
        if (dryRun) {
          return jsonResult({
            dryRun: true,
            commandCount: commands.length,
            commands,
            note: "Nothing was executed. Re-run without dryRun to apply.",
          });
        }

        if (commands.length === 1) {
          const result = await sendCommand(commands[0].command as FigmaCommand, commands[0].params);
          return jsonResult(result);
        }
        const results = await sendCommand(
          "batch_execute",
          { commands },
          Math.max(30000, commands.length * 5000)
        );
        return jsonResult(results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
