import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult, textResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "set_text",
    "Edit text nodes. Modes: single (nodeId + text), bulk (items — efficient for many nodes, e.g. translations), or character-range styling (nodeId + range with fontSize/fontWeight/letterSpacing/lineHeight). Fonts load automatically with fallbacks. To find text nodes first, use search_nodes or get_selection_context.",
    {
      nodeId: z.string().optional().describe("Target text node (single / range mode)"),
      text: z.string().optional().describe("New content (single mode)"),
      items: z
        .array(z.object({ nodeId: z.string(), text: z.string() }))
        .optional()
        .describe("Bulk replacements"),
      range: z
        .object({
          start: z.number().int().min(0),
          end: z.number().int().positive(),
          fontSize: z.number().positive().optional(),
          fontWeight: z.number().optional(),
          letterSpacing: z.number().optional(),
          lineHeight: z.number().optional(),
        })
        .refine((r) => r.end > r.start, { message: "end must be greater than start" })
        .optional()
        .describe("Style a character range [start, end)"),
    },
    async ({ nodeId, text, items, range }) => {
      try {
        if (items?.length) {
          const result = await sendCommand(
            "set_multiple_text_contents",
            { text: items },
            Math.max(30000, items.length * 2000)
          );
          return jsonResult(result);
        }
        if (nodeId && range) {
          const result = await sendCommand("set_text_style_range", { nodeId, ...range });
          return jsonResult(result);
        }
        if (nodeId && text !== undefined) {
          const result = await sendCommand("set_text_content", { nodeId, text });
          return jsonResult(result);
        }
        return textResult(
          "Provide either items (bulk), nodeId + text (single), or nodeId + range (styling)."
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
