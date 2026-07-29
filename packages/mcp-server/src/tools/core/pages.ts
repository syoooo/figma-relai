import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { colorSchema } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_pages",
    "Page operations: list all pages, create/rename/delete a page, or set a page's background color. To make a page current, use navigate with switch_page. Guards: list_guards shows the designer's AI no-go zones; guard/unguard change them — ONLY do that when the designer explicitly asks (guards are theirs; every change shows in their activity feed). Writes into a guarded page are rejected at dispatch.",
    {
      action: z.enum(["list", "create", "rename", "delete", "set_background", "list_guards", "guard", "unguard"]),
      pageId: z.string().optional().describe("Target page (rename/delete/set_background/guard/unguard)"),
      name: z.string().optional().describe("Page name (create/rename)"),
      color: colorSchema.optional().describe("Background color (set_background)"),
      afterPageId: z
        .string()
        .optional()
        .describe("create: put the new page right after this one — pages are ordered by meaning, and a new one lands at the bottom otherwise"),
      index: z.number().int().min(0).optional().describe("create: exact position instead of afterPageId"),
    },
    async ({ action, pageId, name, color, afterPageId, index }) => {
      try {
        let result: unknown;
        switch (action) {
          case "list":
            result = await sendCommand("get_pages", {});
            break;
          case "create":
            result = await sendCommand("create_page", { name, afterPageId, index });
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
          case "list_guards":
            result = await sendCommand("get_guards", {});
            break;
          case "guard":
          case "unguard": {
            if (!pageId) throw new Error(`${action} needs pageId`);
            const state = (await sendCommand("get_guards", {})) as {
              pages: Array<{ id: string; guarded: boolean }>;
            };
            const current = state.pages.filter((p) => p.guarded).map((p) => p.id);
            const next =
              action === "guard"
                ? [...new Set([...current, pageId])]
                : current.filter((id) => id !== pageId);
            result = await sendCommand("set_guards", { pages: next });
            break;
          }
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
