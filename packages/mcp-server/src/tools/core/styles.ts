import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { colorSchema, gradientTypeSchema, gradientStopSchema } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_styles",
    "Shared styles: list all local styles; create_paint / create_text / create_effect / create_grid; update (name/properties); delete; apply (style to a node); reorder. To bind variables instead of styles, use manage_variables.",
    {
      action: z.enum([
        "list",
        "create_paint",
        "create_text",
        "create_effect",
        "create_grid",
        "update",
        "delete",
        "apply",
        "reorder",
      ]),
      name: z.string().optional().describe("Style name (create_*/update)"),
      styleId: z.string().optional().describe("Target style (update/delete/apply/reorder)"),
      styleType: z.enum(["PAINT", "TEXT", "EFFECT", "GRID"]).optional().describe("apply/reorder"),
      nodeId: z.string().optional().describe("apply: target node"),
      color: colorSchema.optional().describe("create_paint/create_effect"),
      gradientType: gradientTypeSchema.optional(),
      gradientStops: z.array(gradientStopSchema).optional(),
      fontFamily: z.string().optional().describe("create_text"),
      fontSize: z.number().positive().optional(),
      fontWeight: z.number().optional(),
      lineHeight: z.number().optional(),
      letterSpacing: z.number().optional(),
      effectType: z
        .enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"])
        .optional()
        .describe("create_effect"),
      offsetX: z.number().optional(),
      offsetY: z.number().optional(),
      radius: z.number().min(0).optional(),
      spread: z.number().optional(),
      grids: z.array(z.record(z.unknown())).optional().describe("create_grid: layout grid objects"),
      properties: z.record(z.unknown()).optional().describe("update: properties to change"),
      afterStyleId: z.string().optional().describe("reorder: place after this style"),
    },
    async (args) => {
      try {
        let result: unknown;
        switch (args.action) {
          case "list":
            result = await sendCommand("get_styles", {});
            break;
          case "create_paint":
            result = await sendCommand("create_paint_style", {
              name: args.name,
              color: args.color,
              gradientType: args.gradientType,
              gradientStops: args.gradientStops,
            });
            break;
          case "create_text":
            result = await sendCommand("create_text_style", {
              name: args.name,
              fontFamily: args.fontFamily,
              fontSize: args.fontSize,
              fontWeight: args.fontWeight,
              lineHeight: args.lineHeight,
              letterSpacing: args.letterSpacing,
            });
            break;
          case "create_effect":
            result = await sendCommand("create_effect_style", {
              name: args.name,
              effectType: args.effectType,
              color: args.color,
              offsetX: args.offsetX,
              offsetY: args.offsetY,
              radius: args.radius,
              spread: args.spread,
            });
            break;
          case "create_grid":
            result = await sendCommand("create_grid_style", { name: args.name, grids: args.grids });
            break;
          case "update":
            result = await sendCommand("update_style", {
              styleId: args.styleId,
              name: args.name,
              properties: args.properties,
            });
            break;
          case "delete":
            result = await sendCommand("delete_style", { styleId: args.styleId });
            break;
          case "apply":
            result = await sendCommand("apply_style", {
              nodeId: args.nodeId,
              styleId: args.styleId,
              styleType: args.styleType,
            });
            break;
          case "reorder":
            result = await sendCommand("reorder_style", {
              styleId: args.styleId,
              afterStyleId: args.afterStyleId,
              styleType: args.styleType,
            });
            break;
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
