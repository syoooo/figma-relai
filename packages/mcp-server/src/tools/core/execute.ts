import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "execute_figma",
    "Run JavaScript against the Figma Plugin API inside the plugin sandbox — the escape hatch for anything the other tools don't cover. The code runs in an async function with `figma` AND `relai` in scope. relai helpers avoid the classic pitfalls: relai.text(parent, chars, {font,size,color}) loads fonts first; relai.autoLayout(direction, props) makes a hugging auto-layout frame; relai.set(node, props) applies layoutMode first and routes width/height through resize; relai.hug(node); relai.focusRing(node); await relai.page(p => ...) finds pages by content, not name; relai.query('FRAME[name^=Card] > TEXT') is a CSS-like search (types, name matchers, descendant/child, comma); relai.placeholder(node) shows a construction veil — remove with (node, false) when done. Errors carry a Hint with the fix; scripts are NOT atomic — on error, partial changes persist, so keep scripts small and idempotent. Nodes created via relai plus any node ids you RETURN are linted for silent mistakes (e.g. spread shadows without clipsContent) and come back as `warnings`. Return ALL created/mutated node ids. Work incrementally; verify with screenshot. The designer can disable this tool via the plugin's 'Allow code execution' toggle.",
    {
      code: z.string().describe("JavaScript source. May use await. Return a JSON-serializable value."),
      description: z
        .string()
        .optional()
        .describe("One line shown in the plugin's activity feed describing what this does"),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .describe("Execution timeout in ms (default 60000) — raise for scripts creating hundreds of nodes"),
    },
    async ({ code, description, timeoutMs }) => {
      try {
        const result = await sendCommand("execute_code", { code, description }, timeoutMs ?? 60000);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
