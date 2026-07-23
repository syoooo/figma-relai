import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { colorSchema } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_pages",
    "Page operations: list all pages, create/rename/delete a page, or set a page's background color. To make a page current, use navigate with switch_page.",
    {
      action: z.enum(["list", "create", "rename", "delete", "set_background"]),
      pageId: z.string().optional().describe("Target page (rename/delete/set_background)"),
      name: z.string().optional().describe("Page name (create/rename)"),
      color: colorSchema.optional().describe("Background color (set_background)"),
    },
    async ({ action, pageId, name, color }) => {
      try {
        let result: unknown;
        switch (action) {
          case "list":
            result = await sendCommand("get_pages", {});
            break;
          case "create":
            result = await sendCommand("create_page", { name });
            break;
          case "rename":
            result = await sendCommand("rename_page", { pageId, name });
            break;
          case "delete":
            result = await sendCommand("delete_page", { pageId });
            break;
          case "set_background":
            result = await sendCommand("set_page_background", { pageId, color });
            break;
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
