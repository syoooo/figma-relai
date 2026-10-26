import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { CALL_META_KEY, type CallMeta, type TransportTruncation } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

// The plugin cuts large return values itself before sending them. An older
// plugin keeps the first 50,000 chars of the JSON and appends
// "… [truncated N chars — …]", where N is the number of chars it cut, so the
// full length is N + 50,000. A newer plugin may state { total, returned }.
// Either way the full text never reached this process, so there is no file.
const LEGACY_PLUGIN_LIMIT = 50000;

export function pluginTruncation(result: unknown): TransportTruncation | undefined {
  const r = result as { truncated?: unknown; result?: unknown } | null;
  if (!r || typeof r !== "object") return undefined;
  const t = r.truncated as { total?: unknown; returned?: unknown } | boolean | undefined;
  if (t && typeof t === "object" && typeof t.total === "number" && typeof t.returned === "number") {
    return { total: t.total, returned: t.returned, unit: "chars" };
  }
  if (t === true && typeof r.result === "string") {
    const cut = /… \[truncated (\d+) chars/.exec(r.result);
    if (cut) {
      return { total: Number(cut[1]) + LEGACY_PLUGIN_LIMIT, returned: LEGACY_PLUGIN_LIMIT, unit: "chars" };
    }
  }
  return undefined;
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "execute_figma",
    "Run JavaScript against the Figma Plugin API inside the plugin sandbox — the escape hatch for anything the other tools don't cover. The code runs in an async function with `figma` AND `relai` in scope. relai helpers avoid the classic pitfalls: relai.text(parent, chars, {font,size,color}) loads fonts first; relai.autoLayout(direction, props) makes a hugging auto-layout frame; relai.set(node, props) applies layoutMode first and routes width/height through resize; relai.hug(node); relai.focusRing(node); await relai.page(p => ...) finds pages by content, not name; relai.query('FRAME[name^=Card] > TEXT') is a CSS-like search (types, name matchers, descendant/child, comma); relai.placeholder(node) shows a construction veil — remove with (node, false) when done. Errors carry a Hint with the fix; scripts are NOT atomic — on error, partial changes persist, so keep scripts small and idempotent. Nodes created via relai plus any node ids you RETURN are linted for silent mistakes (e.g. spread shadows without clipsContent) and come back as `warnings`. Return ALL created/mutated node ids. Work incrementally; verify with screenshot. When BUILDING UI: call get_design_system first and instantiate the file's own components / bind its variables instead of drawing raw shapes — hand-drawn near-copies of existing components read as drift to the design team. The designer can disable this tool via the plugin's 'Allow code execution' toggle.",
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
        const truncated = pluginTruncation(result);
        if (!truncated) return jsonResult(result);
        const meta: CallMeta = { v: 1, calls: [], truncated };
        return { ...jsonResult(result), _meta: { [CALL_META_KEY]: meta } };
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
