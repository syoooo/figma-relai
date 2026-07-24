import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create and configure the MCP server instance
export function createServer(): McpServer {
  return new McpServer(
    {
      name: "Relai",
      version: "0.2.3",
    },
    {
      instructions: `
You control Figma through ~30 consolidated tools. Pairing with the Figma plugin is automatic — just call any tool; join_room is only needed if an error reports multiple plugins.

📖 UNDERSTAND (start here):
  get_document_overview — structure, page/component/style/variable counts
  get_selection_context — full context for what the designer selected
  get_node_details — deep single-node inspection (CSS, token bindings)
  search_nodes — find nodes by name/type · get_node_data — raw data/tree/css
  get_design_tokens — variable collections, modes, styles
  screenshot — see the canvas (use this to verify your work visually)

🔍 DIAGNOSE:
  analyze_design — aspect: color/layout/components/accessibility, or
    "overall" for a weighted 0-100 health score across all four
  diff_nodes — compare two nodes, or checkpoint save/compare to audit
    what changed on a node over an editing session

✏️ EDIT:
  create_node — any node type (rectangle/frame/text/svg/image/…)
  set_properties — one call for geometry, fills, strokes, effects, text,
    auto-layout, constraints, style/variable bindings, on one or many nodes
  set_text — single, bulk, or character-range text edits
  edit_structure — group/reparent/reorder/clone/flatten/boolean/delete
  navigate — focus/select/viewport/switch_page · manage_pages

🧱 DESIGN SYSTEM:
  manage_components — create/variants/instantiate/overrides/props/detach
  manage_variables — collections, modes, tokens, bind/unbind
  manage_styles — paint/text/effect/grid styles
  import_from_library — bring in library components/styles/variables

📦 ASSETS: export_asset (PNG/JPG/SVG/PDF) · add_image (URL or fill)
📝 ANNOTATIONS: annotate (Dev Mode annotations)
💬 COMMENTS: manage_comments — read/apply/reply to file comments
  (needs FIGMA_TOKEN env; the tool explains setup when missing)

✅ VERIFY: verify_changes · validate_design_rules

⚡ ADVANCED:
  batch_execute — run many plugin-level commands in one round-trip
  execute_figma — run JavaScript against the Figma Plugin API directly
    (the escape hatch when no tool fits; small incremental scripts,
     screenshot between steps; the designer can disable it)

OPERATING PRINCIPLES:
- Inspect context BEFORE changing things; don't assume selection state
- After visual edits, verify: screenshot or verify_changes
- Colors are RGBA in 0-1 range (Figma format), not 0-255
- layoutSizing FILL requires the node's PARENT to have auto-layout;
  set layoutMode on a frame before padding/alignment/spacing
- Responses include recommended_next tools — follow them
- Errors name the node, its type, and the fix — read them, don't retry blindly
`,
    }
  );
}
