import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult, textResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "annotate",
    "Read or write Dev Mode annotations. get: read annotations on a node. set: add/update one annotation (labelMarkdown). set_multiple: batch annotations.",
    {
      action: z.enum(["get", "set", "set_multiple"]),
      nodeId: z.string().optional().describe("Target node (get/set)"),
      labelMarkdown: z.string().optional().describe("Annotation text (set)"),
      categoryId: z.string().optional(),
      annotations: z
        .array(
          z.object({
            nodeId: z.string(),
            labelMarkdown: z.string(),
            categoryId: z.string().optional(),
          })
        )
        .optional()
        .describe("Batch annotations (set_multiple)"),
    },
    async ({ action, nodeId, labelMarkdown, categoryId, annotations }) => {
      try {
        if (action === "get") {
          const result = await sendCommand("get_annotations", { nodeId });
          return jsonResult(result);
        }
        if (action === "set") {
          if (!nodeId || labelMarkdown === undefined)
            return textResult("set requires nodeId and labelMarkdown.");
          const result = await sendCommand("set_annotation", { nodeId, labelMarkdown, categoryId });
          return jsonResult(result);
        }
        if (!annotations?.length) return textResult("set_multiple requires annotations.");
        const result = await sendCommand("set_multiple_annotations", { annotations });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
