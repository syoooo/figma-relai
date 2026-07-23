import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { exportFormatSchema } from "@figma-relai/shared";
import { jsonResult, errorResult, textResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "export_asset",
    "Export a node as PNG/JPG/SVG/PDF. Returns base64 data for saving to disk. For a quick visual check of your work, prefer the screenshot tool (returns a viewable image).",
    {
      nodeId: z.string().describe("Node to export"),
      format: exportFormatSchema.optional().describe("Default PNG"),
      scale: z.number().positive().optional().describe("Export scale (default 1)"),
    },
    { readOnlyHint: true },
    async ({ nodeId, format, scale }) => {
      try {
        const result = await sendCommand("export_node_as_image", { nodeId, format, scale }, 60000);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "add_image",
    "Place an image: from a URL (creates a new image node) or as a fill on an existing node (base64 imageData). scaleMode controls how the image fits.",
    {
      url: z.string().optional().describe("Image URL — creates a new node"),
      nodeId: z.string().optional().describe("Existing node — sets its fill from imageData"),
      imageData: z.string().optional().describe("Base64 image data (with nodeId)"),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      name: z.string().optional(),
      scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional(),
    },
    async ({ url, nodeId, imageData, x, y, width, height, name, scaleMode }) => {
      try {
        if (url) {
          const result = await sendCommand(
            "create_image_from_url",
            { url, x, y, width, height, name, scaleMode },
            60000
          );
          return jsonResult(result);
        }
        if (nodeId && imageData) {
          const result = await sendCommand("set_image_fill", { nodeId, imageData, scaleMode }, 60000);
          return jsonResult(result);
        }
        return textResult("Provide either url (new image node) or nodeId + imageData (image fill).");
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
