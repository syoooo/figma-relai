import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import type { FigmaCommand } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

// action → [plugin command, params to forward]
const ACTIONS: Record<string, [string, string[]]> = {
  list: ["list_rulesets", []],
  save: ["save_ruleset", ["name", "conventions", "fromFile", "autoRestore", "provenance"]],
  delete: ["delete_ruleset", ["name"]],
  link: ["link_ruleset", ["name", "restore"]],
  unlink: ["unlink_ruleset", []],
  status: ["ruleset_status", []],
  restore: ["restore_from_ruleset", []],
  push: ["push_to_ruleset", []],
  promote: ["promote_precedent", ["id"]],
  export: ["export_ruleset", ["name"]],
  import: ["import_ruleset", ["markdown", "name"]],
};

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_rulesets",
    "Kits (rulesets) — named common-ancestor law the plugin keeps on the designer's machine, spanning every file it opens (one designer usually runs one product; its files share the same law). The panel shows this as the KIT row in the connection cluster — when speaking to the designer, call it a kit, not a ruleset. A file LINKS to one ruleset; the file's own carried conventions stay the working copy. Figma DISCARDS file-carried law on branch→main merges — a linked ruleset is the recovery: status shows 'file-empty' after a merge, restore (or the set's autoRestore switch) re-seeds it. Actions: list / status (this file's state: in-sync, file-empty, drifted…) / save (name + conventions, or fromFile:true to capture this file's law) / link (optionally restore:true) / unlink / restore (ruleset→file, also seeds promoted precedents) / push (file→ruleset — the file's law becomes the ancestor) / promote (id — copy one precedent into the linked ruleset so every linked file inherits it) / delete / export (markdown package with provenance frontmatter) / import (markdown). Pass only the fields the action needs.",
    {
      action: z.enum(Object.keys(ACTIONS) as [string, ...string[]]),
      name: z.string().optional().describe("Ruleset name (save/link/delete/export; import fallback)"),
      conventions: z.string().optional().describe("save: full conventions markdown (or use fromFile)"),
      fromFile: z.boolean().optional().describe("save: capture this file's current conventions"),
      autoRestore: z
        .boolean()
        .optional()
        .describe("save: restore without asking when a linked file's law is found wiped"),
      provenance: z.string().optional().describe("save: where this law comes from (author/repo)"),
      restore: z.boolean().optional().describe("link: immediately restore the ruleset into the file"),
      id: z.string().optional().describe("promote: precedent id (list_precedents shows them)"),
      markdown: z.string().optional().describe("import: a ruleset package exported earlier"),
    },
    async (args) => {
      try {
        const [command, fields] = ACTIONS[args.action as string];
        const params = Object.fromEntries(
          fields
            .map((f) => [f, (args as Record<string, unknown>)[f]])
            .filter(([, v]) => v !== undefined)
        );
        const result = await sendCommand(command as FigmaCommand, params);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
