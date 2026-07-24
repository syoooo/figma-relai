# Design Audit Strategy

## Phase 1: Overview
1. `get_document_overview` → pages, component/style/variable counts
2. `get_design_tokens` → token system structure (collections, modes, coverage)

## Phase 2: Color & Token Audit
1. `analyze_design` (aspect: color) → find colors not backed by variables
2. `get_node_data` (detail: variables) on key nodes → verify correct tier references
3. Check: components should reference Tier 2/3 tokens, never Tier 1 or raw values

## Phase 3: Layout Quality
1. `analyze_design` (aspect: layout) → detect missing auto-layout, inconsistent spacing
2. Check: all containers should use auto-layout (not absolute positioning)
3. Check: spacing should use token values, not arbitrary px

## Phase 4: Component Health
1. `analyze_design` (aspect: components) → detached instances, unused components
2. `manage_components` (list) → review component inventory
3. Check: all instances should be connected to their main component

## Phase 5: Accessibility
1. `analyze_design` (aspect: accessibility) → contrast ratios, touch target sizes
2. Check: minimum contrast 4.5:1 for text, 3:1 for large text
3. Check: touch targets ≥ 44×44px

## Phase 6: Comprehensive Validation
1. `validate_design_rules` → runs all checks in one pass:
   - token_coverage: % of nodes with variable bindings
   - auto_layout: % of frames using auto-layout
   - naming_convention: layer naming quality
   - touch_target_size: minimum size compliance

## Reporting
- `screenshot` before and after fixes
- `annotate` (set) / `annotate` (set_multiple) to flag issues directly in the design
- Summarize findings by severity (critical → warning → info)

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
