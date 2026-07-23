// Aggregates the four analyze_design aspects into one weighted health score.
// Pure so it can be unit-tested without a live plugin.

export interface HealthInputs {
  // null = that aspect's analysis was unavailable (excluded, weights renormalize)
  color: { tokenCoverage: number; unboundCount: number } | null;
  layout: { autoLayoutCoverage: number; issueCount: number } | null;
  components: { totalInstances: number; detachedCount: number } | null;
  accessibility: { issueCount: number } | null;
}

export interface CategoryScore {
  category: "color" | "layout" | "components" | "accessibility";
  score: number; // 0-100
  weight: number;
  note: string;
}

export interface HealthScore {
  score: number; // 0-100 weighted
  grade: "A" | "B" | "C" | "D";
  categories: CategoryScore[];
}

const WEIGHTS = { color: 0.3, layout: 0.25, components: 0.2, accessibility: 0.25 };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeHealthScore(inputs: HealthInputs): HealthScore {
  const categories: CategoryScore[] = [];

  if (inputs.color) {
    categories.push({
      category: "color",
      score: clamp(inputs.color.tokenCoverage * 100),
      weight: WEIGHTS.color,
      note: `${Math.round(inputs.color.tokenCoverage * 100)}% of color properties bound to tokens (${inputs.color.unboundCount} unbound)`,
    });
  }
  if (inputs.layout) {
    // Coverage sets the baseline; each concrete issue costs a little on top
    categories.push({
      category: "layout",
      score: clamp(inputs.layout.autoLayoutCoverage * 100 - inputs.layout.issueCount * 3),
      weight: WEIGHTS.layout,
      note: `${Math.round(inputs.layout.autoLayoutCoverage * 100)}% auto-layout coverage, ${inputs.layout.issueCount} issue(s)`,
    });
  }
  if (inputs.components) {
    const { totalInstances, detachedCount } = inputs.components;
    categories.push({
      category: "components",
      score: totalInstances > 0 ? clamp((1 - detachedCount / totalInstances) * 100) : 100,
      weight: WEIGHTS.components,
      note:
        totalInstances > 0
          ? `${detachedCount}/${totalInstances} instances look detached`
          : "no instances in scope",
    });
  }
  if (inputs.accessibility) {
    categories.push({
      category: "accessibility",
      score: clamp(100 - inputs.accessibility.issueCount * 8),
      weight: WEIGHTS.accessibility,
      note: `${inputs.accessibility.issueCount} issue(s) found`,
    });
  }

  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  const score =
    totalWeight > 0
      ? clamp(categories.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight)
      : 0;

  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade, categories };
}
