# Component Specification Generator

## Purpose
Generate a structured specification document for a component, covering its properties, variants, token bindings, and states.

## Process

### Step 1: Identify the Component
- `get_selection_context` → read the selected component/instance
- Or `search_nodes` by name to find it

### Step 2: Extract Properties
- `manage_components` (get_props) → list all configurable properties (VARIANT, BOOLEAN, INSTANCE_SWAP, TEXT)
- `get_node_details` → full node structure with children summary

### Step 3: Token Bindings
- `get_node_data` (detail: variables) → list all token bindings on the component and its children
- `manage_variables` (list) → resolve variable names, descriptions, scopes, codeSyntax
- Map bindings to the 4-tier token structure

### Step 4: Visual Reference
- `screenshot` → capture the component in its default state
- If variants exist, capture key states (default, hover, disabled, etc.)

### Step 5: Generate Spec

Output format:

#### {Component Name}
**Description**: (from context or user input)

**Properties**
| Name | Type | Values | Default |
|------|------|--------|---------|

**Token Bindings**
| Property | Token | Tier | Value (default mode) |
|----------|-------|------|---------------------|

**States**
| State | Visual Changes |
|-------|---------------|

**Size Variants**
| Size | Height | Token |
|------|--------|-------|

## Tips
- For components from a library (remote: true), some properties may be read-only
- Use `manage_components` (get_overrides) to see what's been customized on instances
- Include codeSyntax values for developer handoff

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
