import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "execute_figma",
    "Run JavaScript against the Figma Plugin API inside the plugin sandbox — the escape hatch for anything the other tools don't cover. The code runs in an async function with `figma` in scope; its return value is serialized back (node objects become summaries). console.log output is captured into `logs`. Work incrementally: small scripts, verify with screenshot between steps. Remember dynamic-page rules (use figma.getNodeByIdAsync, await figma.loadFontAsync before text edits). The designer can disable this tool via the plugin's 'Allow code execution' toggle.",
    {
      code: z.string().describe("JavaScript source. May use await. Return a JSON-serializable value."),
      description: z
        .string()
        .optional()
        .describe("One line shown in the plugin's activity feed describing what this does"),
    },
    async ({ code, description }) => {
      try {
        const result = await sendCommand("execute_code", { code, description }, 60000);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
