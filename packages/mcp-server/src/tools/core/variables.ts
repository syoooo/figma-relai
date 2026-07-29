import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import type { FigmaCommand } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

// A token created without scopes is offered everywhere: a stroke weight in the
// padding field, a text colour among the border options. The mistake is free to
// fix in the same breath and tedious to fix a hundred tokens later, so the answer
// arrives with the token itself rather than waiting for an audit to find it.
// Scope names come from the token's own name — the part a design system already
// says out loud.
const SCOPE_BY_NAME: Array<[RegExp, string[]]> = [
  [/radius|corner/i, ["CORNER_RADIUS"]],
  [/border-width|stroke-width|stroke\b/i, ["STROKE_FLOAT"]],
  [/gap|spacing|padding|inset/i, ["GAP"]],
  [/font-size|text-size/i, ["FONT_SIZE"]],
  [/line-height|leading/i, ["LINE_HEIGHT"]],
  [/letter-spacing|tracking/i, ["LETTER_SPACING"]],
  [/opacity|alpha/i, ["OPACITY"]],
  [/width|height|\bsize\b/i, ["WIDTH_HEIGHT"]],
  [/text-color|text-fill|\bfg\b|foreground/i, ["TEXT_FILL"]],
  [/border-color|outline-color|stroke-color/i, ["STROKE_COLOR"]],
  [/background|surface|\bfill\b|\bbg\b/i, ["FRAME_FILL", "SHAPE_FILL"]],
  [/shadow|elevation/i, ["EFFECT_COLOR"]],
];

const SCOPE_MENU: Record<string, string[]> = {
  COLOR: ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR", "EFFECT_COLOR"],
  FLOAT: ["CORNER_RADIUS", "GAP", "WIDTH_HEIGHT", "STROKE_FLOAT", "FONT_SIZE", "OPACITY"],
  STRING: ["TEXT_CONTENT", "FONT_FAMILY", "FONT_STYLE"],
};

export function suggestScopes(name: string, resolvedType: string): string[] | null {
  const menu = SCOPE_MENU[resolvedType];
  if (!menu) return null; // BOOLEAN and anything new: scopes don't apply
  for (const [pattern, scopes] of SCOPE_BY_NAME) {
    if (!pattern.test(name)) continue;
    const usable = scopes.filter((s) => menu.indexOf(s) >= 0);
    if (usable.length) return usable;
  }
  return null;
}

export function scopeWarning(name: string, resolvedType: string): string | null {
  const menu = SCOPE_MENU[resolvedType];
  if (!menu) return null;
  const guess = suggestScopes(name, resolvedType);
  return (
    `"${name}" was created with ALL_SCOPES, so it will be offered for every property in the file. ` +
    (guess
      ? `Its name reads like ${guess.join(" + ")} — set that with manage_variables action:set_scopes.`
      : `Narrow it with manage_variables action:set_scopes (${resolvedType} takes ${menu.join(", ")}).`)
  );
}

// action → [plugin command, params to forward]
const ACTIONS: Record<string, [string, string[]]> = {
  list_collections: ["get_variable_collections", []],
  list: ["get_variables", ["collectionId"]],
  snapshot: ["snapshot_variables", []],
  create_collection: ["create_variable_collection", ["name", "modes"]],
  update_collection: ["update_variable_collection", ["collectionId", "name", "hiddenFromPublishing"]],
  delete_collection: ["delete_variable_collection", ["collectionId"]],
  create: [
    "create_variable",
    ["collectionId", "name", "resolvedType", "value", "valuesByMode", "scopes", "description"],
  ],
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
    "Design-token variables: list_collections / list (variables in a collection) / snapshot (compact whole-file inventory — every collection and variable name/type in one call; take one before branch merges or bulk edits, diff after) / create_collection / update_collection / delete_collection / create (pass valuesByMode to set every mode — and alias by variable NAME — in the same call) / update / delete / add_mode / remove_mode / rename_mode / set_scopes / set_code_syntax / remove_code_syntax / create_alias / bind (variable→node property) / unbind / set_node_mode / get_node_modes / tokenize (find hardcoded colors & numbers that match existing variables and bind them — fix:false to preview, fix:true to apply; scope with nodeId, default current page). Pass only the fields the action needs.",
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
      valuesByMode: z
        .record(z.unknown())
        .optional()
        .describe(
          'create: every mode in one call, keyed by mode NAME or id — {"Light": {"r":1,"g":1,"b":1}, "Dark": {"aliasOf": "Color/gray/900"}}. `aliasOf` takes a variable id or its exact name, so a brand-mode token lands in one round-trip instead of create + one alias per mode.'
        ),
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
        const wideOpen =
          args.action === "create" &&
          (!Array.isArray(args.scopes) || args.scopes.length === 0 || args.scopes.indexOf("ALL_SCOPES") >= 0);
        if (wideOpen) {
          const warning = scopeWarning(String(args.name ?? ""), String(args.resolvedType ?? ""));
          if (warning) return jsonResult({ ...(result as object), warning });
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
