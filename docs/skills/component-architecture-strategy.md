# Component Architecture — Component Conventions

## Token-First Principle
Every visual property must reference a token. No raw values in components.
- Colors → Tier 2 semantic tokens or Tier 3 component tokens
- Sizes (height, spacing) → Tier 2 or Tier 3 size tokens
- Typography → Tier 2 typography tokens
- Border radius/width → Tier 2 border tokens

## Tier 3 Token Pattern
When a component needs brand-differentiated values:

`{component}/color/{role}/{state}`
- Roles: background, border, content
- States: default, hover, pressed, disabled
- Selected states: selected, selected-hover, selected-pressed, selected-disabled
- Variants: primary, ai, critical, ghost (prefix before role)

Example — Button tokens:
- `button/color/background/default` → neutral button bg
- `button/primary/color/background/hover` → primary variant hover
- `button/size/sm` / `button/size/md` / `button/size/lg`

## State Management
Standard interactive states:
- default → hover → pressed → disabled (always present)
- selected → selected-hover → selected-pressed → selected-disabled (for toggleable elements)

## Size Variants
Use sm / md / lg consistently. Define as Tier 3 FLOAT tokens when brand-differentiated.
- `{component}/size/sm`, `{component}/size/md`, `{component}/size/lg`

## Component Structure
1. Use auto-layout (VERTICAL or HORIZONTAL) for all containers
2. Use HUG for content-driven sizes, FILL for responsive elements
3. Use component properties for configurable aspects:
   - BOOLEAN: toggle visibility (icons, labels)
   - INSTANCE_SWAP: swap nested components
   - VARIANT: select between variant sets
   - TEXT: configurable text content

## Workflow
1. `get_selection_context` → understand current component structure
2. `manage_components` (list) → check existing components
3. Design the component with auto-layout
4. Create variants for states using `manage_components` (create_set)
5. `manage_variables` (bind) → attach Tier 2/3 tokens to all visual properties
6. `manage_components` (set_props) → configure instance properties

## Verification
- `analyze_design` (aspect: components) → find detached instances, unused components
- `verify_changes` → confirm properties match expected values
- `get_node_data` (detail: variables) → ensure all fills/strokes are token-bound

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
