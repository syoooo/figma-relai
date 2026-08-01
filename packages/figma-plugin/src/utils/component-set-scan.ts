import type { ComponentSetLint } from "./sandbox-helpers.js";

// Collecting what a component set declares versus what its variants wire up.
// Kept apart from the pure lint so the rules stay unit-testable.

const NODE_CAP = 4000;

/** The COMPONENT_SET this node belongs to (or is), if any. */
export function ancestorComponentSet(node: BaseNode | null): ComponentSetNode | null {
  let current: BaseNode | null = node;
  let hops = 0;
  while (current && hops++ < 32) {
    if (current.type === "COMPONENT_SET") return current;
    current = current.parent;
  }
  return null;
}

/**
 * Property keys referenced anywhere inside a variant.
 *
 * Instance roots carry references (a nested instance's visibility or swap is
 * driven from the parent), but their sublayers cannot — Figma rejects writes
 * there — so the walk reads an instance and stops.
 */
function referencedKeys(variant: SceneNode, budget: { left: number }): string[] {
  const keys = new Set<string>();
  const walk = (node: SceneNode) => {
    if (budget.left-- <= 0) return;
    const refs = (node as SceneNode & { componentPropertyReferences?: Record<string, string> })
      .componentPropertyReferences;
    if (refs) for (const value of Object.values(refs)) if (value) keys.add(value);
    if (node.type === "INSTANCE") return;
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(variant);
  return [...keys];
}

export function collectComponentSet(set: ComponentSetNode): ComponentSetLint {
  const definitions: Record<string, { type: string }> = {};
  try {
    for (const [key, def] of Object.entries(set.componentPropertyDefinitions)) {
      definitions[key] = { type: def.type };
    }
  } catch {
    // A set mid-edit can refuse to report its definitions; nothing to lint then
  }
  const budget = { left: NODE_CAP };
  return {
    id: set.id,
    name: set.name,
    definitions,
    variants: set.children.map((variant) => ({
      name: variant.name,
      referencedKeys: referencedKeys(variant, budget),
    })),
  };
}
