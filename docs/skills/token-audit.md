# Token Audit — Token Hierarchy Compliance Check

## Purpose
Verify that a design correctly uses the 4-tier token hierarchy:
- No raw color/size values (everything should be token-bound)
- Correct tier references (components → Tier 2/3, never Tier 1 directly)
- Consistent scope usage

## Audit Process

### Step 1: Scope the Audit
- `get_selection_context` → identify the area to audit
- Or `get_document_overview` → audit the full document

### Step 2: Color Token Coverage
- `analyze_design` (aspect: color) → find all colors and whether they're token-bound
- Flag any raw hex values not backed by variables

### Step 3: Variable Binding Check
- `get_node_data` (detail: variables) on key nodes → check what's bound
- For each binding, verify the variable comes from the correct tier:
  - ✅ Component referencing Tier 2 (e.g., `color/content/default`)
  - ✅ Component referencing Tier 3 (e.g., `button/color/background/default`)
  - ❌ Component referencing Tier 1 (e.g., `color-static/slate/500`)
  - ❌ Component referencing Tier 1 dynamic (e.g., `color-dynamic/slate/500`)

### Step 4: Scope Validation
- `manage_variables` (list) → check that scopes are set correctly:
  - Color content tokens → TEXT_FILL
  - Color background tokens → FRAME_FILL, SHAPE_FILL
  - Color border tokens → STROKE_COLOR
  - Size tokens → WIDTH_HEIGHT
  - Border radius → CORNER_RADIUS
  - Border width → STROKE_FLOAT

### Step 5: Comprehensive Check
- `validate_design_rules` → run all design rules at once

## Output Format
Report findings as:
- **Coverage**: X% of nodes have token bindings
- **Tier violations**: list of nodes referencing wrong tier
- **Raw values**: list of unbound colors/sizes with suggested token mappings
- **Scope issues**: variables with missing or incorrect scopes
