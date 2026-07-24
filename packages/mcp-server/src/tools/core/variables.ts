import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import type { FigmaCommand } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

// action → [plugin command, params to forward]
const ACTIONS: Record<string, [string, string[]]> = {
  list_collections: ["get_variable_collections", []],
  list: ["get_variables", ["collectionId"]],
  create_collection: ["create_variable_collection", ["name", "modes"]],
  update_collection: ["update_variable_collection", ["collectionId", "name", "hiddenFromPublishing"]],
  delete_collection: ["delete_variable_collection", ["collectionId"]],
  create: ["create_variable", ["collectionId", "name", "resolvedType", "value"]],
  update: ["update_variable", ["variableId", "modeId", "value", "name", "description", "hiddenFromPublishing"]],
  delete: ["delete_variable", ["variableId"]],
  add_mode: ["add_mode", ["collectionId", "name"]],
  remove_mode: ["remove_mode", ["collectionId", "modeId"]],
  rename_mode: ["rename_mode", ["collectionId", "modeId", "name"]],
  set_scopes: ["set_variable_scopes", ["variableId", "scopes"]],
  set_code_syntax: ["set_variable_code_syntax", ["variableId", "platform", "value"]],
  remove_code_syntax: ["remove_variable_code_syntax", ["variableId", "platform"]],
  create_alias: ["create_variable_alias", ["variableId", "targetVariableId", "modeId"]],
  bind: ["bind_variable", ["nodeId", "variableId", "property"]],
  unbind: ["unbind_variable", ["nodeId", "property"]],
  set_node_mode: ["set_node_variable_mode", ["nodeId", "collectionId", "modeId"]],
  get_node_modes: ["get_resolved_variable_modes", ["nodeId"]],
  tokenize: ["scan_token_drift", ["nodeId", "fix", "tolerance"]],
};

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_variables",
    "Design-token variables: list_collections / list (variables in a collection) / create_collection / update_collection / delete_collection / create / update / delete / add_mode / remove_mode / rename_mode / set_scopes / set_code_syntax / remove_code_syntax / create_alias / bind (variable→node property) / unbind / set_node_mode / get_node_modes / tokenize (find hardcoded colors & numbers that match existing variables and bind them — fix:false to preview, fix:true to apply; scope with nodeId, default current page). Pass only the fields the action needs.",
    {
      action: z.enum(Object.keys(ACTIONS) as [string, ...string[]]),
      collectionId: z.string().optional(),
      variableId: z.string().optional(),
      targetVariableId: z.string().optional().describe("create_alias: variable to alias to"),
      nodeId: z.string().optional().describe("bind/unbind/set_node_mode/get_node_modes"),
      name: z.string().optional(),
      description: z.string().optional(),
      modes: z.array(z.string()).optional().describe("create_collection: mode names"),
      modeId: z.string().optional(),
      resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).optional(),
      value: z.unknown().optional().describe("Variable value (color object, number, string, bool)"),
      property: z.string().optional().describe('bind/unbind: node property (e.g. "fills", "width")'),
      scopes: z.array(z.string()).optional(),
      platform: z.enum(["WEB", "ANDROID", "iOS"]).optional(),
      hiddenFromPublishing: z.boolean().optional(),
      fix: z.boolean().optional().describe("tokenize: apply the bindings (false = report only)"),
      tolerance: z
        .number()
        .optional()
        .describe("tokenize: OKLab ΔE for color matches (default 0.02 ≈ visually identical)"),
    },
    async (args) => {
      try {
        const [command, fields] = ACTIONS[args.action as string];
        const params = Object.fromEntries(
          fields
            .map((f) => [f, (args as Record<string, unknown>)[f]])
            .filter(([, v]) => v !== undefined)
        );
        // Drift scans walk whole subtrees; give them scan-scale time
        const result = await sendCommand(
          command as FigmaCommand,
          params,
          args.action === "tokenize" ? 120000 : undefined
        );
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
