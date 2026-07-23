# Design Tokens Strategy — 4-Tier Token Architecture

## Token Hierarchy

### Tier 1 — Core (static)
Raw values. Never referenced directly by components.
- Naming: `color-static/{hue}/{shade}`, `spacing-static/{value}`
- Examples: `color-static/slate/50`, `color-static/rose/500`
- Single mode: Value
- hiddenFromPublishing: true

### Tier 1 — Core (dynamic)
References static tokens. Handles Light/Dark inversion.
- Naming: `color-dynamic/{hue}/{shade}`
- Light mode: shade 50 → static/50, shade 900 → static/900
- Dark mode: shade 50 → static/900, shade 900 → static/50 (inverted)
- 2 modes: Light / Dark
- hiddenFromPublishing: true

### Tier 2 — Themes
Semantic tokens. Define brand personality.
- Naming: `color/{role}/{variant}`, `typography/{style}/{property}`, `border/{type}/{size}`
- Color roles: background, content, border, icon
- Color variants: surface-page, surface-default, surface-subtle, surface-knockout, disabled, utility/{status}/{emphasis|subtle}
- Typography: headline-{lg|md|sm}, title-{lg|md}, body-{lg|md|sm}[-bold], label-{lg|md|sm}, code-{md|sm}[-bold]
- Each typography style has: font-family, font-weight, font-size, letter-spacing, line-height
- Modes: one per brand (e.g., Brand A, Brand B)
- description: required — explain purpose and usage constraints
- scopes: set appropriately (TEXT_FILL for content, STROKE_COLOR for border, FRAME_FILL for background, etc.)

### Tier 3 — Components
Component-specific tokens. Reference Tier 2 or dynamic Tier 1.
- Naming: `{component}/color/{role}/{state}`, `{component}/size/{variant}`
- States: default, hover, pressed, disabled, selected, selected-hover, selected-pressed, selected-disabled
- Sizes: sm, md, lg
- Examples: `button/color/background/default`, `button/size/md`, `navigation/color/content/selected`
- Modes: same as Tier 2 (one per brand)
- Not every component needs Tier 3 — only when reuse or shared decision-making justifies it

## Key Rules
- Components MUST reference tokens only — never raw hex/px values
- Tier 1 is internal plumbing — never expose to consumers
- Adding a new brand = adding a mode to Tier 2 and Tier 3 collections
- Light/Dark switching is handled entirely in Tier 1 dynamic — no brand-level light/dark logic needed

## Workflow
1. `get_design_tokens` → understand existing collections and modes
2. `manage_variables` (list) with collectionId → inspect current tokens
3. `manage_variables` (create_collection) → new collection with modes
4. `manage_variables` (create) → define tokens with values per mode
5. `manage_variables` (bind) → connect tokens to node properties
6. `manage_variables` (set_scopes) → restrict UI picker visibility
7. `manage_variables` (set_code_syntax) → set Dev Mode code references

## Verification
- `analyze_design` (aspect: color) → find unbound colors (token coverage)
- `validate_design_rules` → check token_coverage rule
- `get_node_data` (detail: variables) on key nodes → confirm bindings are correct
