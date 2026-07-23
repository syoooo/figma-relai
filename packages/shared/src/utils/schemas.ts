import { z } from "zod";

// Shared Zod schemas used by MCP server tools

export const colorSchema = z.object({
  r: z.number().min(0).max(1).describe("Red channel (0-1)"),
  g: z.number().min(0).max(1).describe("Green channel (0-1)"),
  b: z.number().min(0).max(1).describe("Blue channel (0-1)"),
  a: z.number().min(0).max(1).optional().describe("Alpha channel (0-1)"),
});

// Node dimensions — Figma's resize() throws on zero or negative values
export const dimensionSchema = z.number().positive();

export const layoutModeSchema = z.enum(["NONE", "HORIZONTAL", "VERTICAL"]);

export const layoutWrapSchema = z.enum(["NO_WRAP", "WRAP"]);

export const primaryAxisAlignSchema = z.enum([
  "MIN",
  "MAX",
  "CENTER",
  "SPACE_BETWEEN",
]);

export const counterAxisAlignSchema = z.enum([
  "MIN",
  "MAX",
  "CENTER",
  "BASELINE",
]);

export const sizingModeSchema = z.enum(["FIXED", "HUG", "FILL"]);

export const exportFormatSchema = z.enum(["PNG", "JPG", "SVG", "PDF"]);

export const blendModeSchema = z.enum([
  "PASS_THROUGH",
  "NORMAL",
  "DARKEN",
  "MULTIPLY",
  "LINEAR_BURN",
  "COLOR_BURN",
  "LIGHTEN",
  "SCREEN",
  "LINEAR_DODGE",
  "COLOR_DODGE",
  "OVERLAY",
  "SOFT_LIGHT",
  "HARD_LIGHT",
  "DIFFERENCE",
  "EXCLUSION",
  "HUE",
  "SATURATION",
  "COLOR",
  "LUMINOSITY",
]);

export const gradientTypeSchema = z.enum([
  "GRADIENT_LINEAR",
  "GRADIENT_RADIAL",
  "GRADIENT_ANGULAR",
  "GRADIENT_DIAMOND",
]);

export const gradientStopSchema = z.object({
  position: z.number().min(0).max(1).describe("Stop position (0-1)"),
  color: colorSchema,
});

export const booleanOperationSchema = z.enum([
  "UNION",
  "SUBTRACT",
  "INTERSECT",
  "EXCLUDE",
]);

export const constraintTypeSchema = z.enum([
  "MIN",
  "CENTER",
  "MAX",
  "STRETCH",
  "SCALE",
]);

export const reorderDirectionSchema = z.enum([
  "FRONT",
  "BACK",
  "FORWARD",
  "BACKWARD",
]);
