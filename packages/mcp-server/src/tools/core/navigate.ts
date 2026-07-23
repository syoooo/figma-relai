import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "navigate",
    "Control the designer's view: focus (scroll+zoom to a node), select (set the selection), get_viewport / set_viewport (x/y/zoom), or switch_page.",
    {
      action: z.enum(["focus", "select", "get_viewport", "set_viewport", "switch_page"]),
      nodeId: z.string().optional().describe("focus target"),
      nodeIds: z.array(z.string()).optional().describe("select targets"),
      x: z.number().optional().describe("set_viewport center x"),
      y: z.number().optional(),
      zoom: z.number().positive().optional(),
      pageId: z.string().optional().describe("switch_page target"),
    },
    async ({ action, nodeId, nodeIds, x, y, zoom, pageId }) => {
      try {
        let result: unknown;
        switch (action) {
          case "focus":
            result = await sendCommand("set_focus", { nodeId });
            break;
          case "select":
            result = await sendCommand("set_selections", { nodeIds });
            break;
          case "get_viewport":
            result = await sendCommand("get_viewport", {});
            break;
          case "set_viewport":
            result = await sendCommand("set_viewport", { x, y, zoom });
            break;
          case "switch_page":
            result = await sendCommand("switch_page", { pageId });
            break;
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
