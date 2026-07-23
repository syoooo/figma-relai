import { describe, expect, test } from "bun:test";
import { computeHealthScore } from "./health.js";

describe("computeHealthScore", () => {
  test("perfect inputs score 100 / grade A", () => {
    const h = computeHealthScore({
      color: { tokenCoverage: 1, unboundCount: 0 },
      layout: { autoLayoutCoverage: 1, issueCount: 0 },
      components: { totalInstances: 10, detachedCount: 0 },
      accessibility: { issueCount: 0 },
    });
    expect(h.score).toBe(100);
    expect(h.grade).toBe("A");
    expect(h.categories.length).toBe(4);
  });

  test("weights blend category scores", () => {
    const h = computeHealthScore({
      color: { tokenCoverage: 0.5, unboundCount: 12 }, // 50 * 0.30
      layout: { autoLayoutCoverage: 1, issueCount: 0 }, // 100 * 0.25
      components: { totalInstances: 4, detachedCount: 1 }, // 75 * 0.20
      accessibility: { issueCount: 5 }, // 60 * 0.25
    });
    // 15 + 25 + 15 + 15 = 70
    expect(h.score).toBe(70);
    expect(h.grade).toBe("C");
  });

  test("missing aspects are excluded and weights renormalize", () => {
    const h = computeHealthScore({
      color: { tokenCoverage: 1, unboundCount: 0 },
      layout: null,
      components: null,
      accessibility: { issueCount: 0 },
    });
    expect(h.score).toBe(100);
    expect(h.categories.length).toBe(2);
  });

  test("zero instances scores components 100, scores clamp at 0", () => {
    const h = computeHealthScore({
      color: null,
      layout: { autoLayoutCoverage: 0, issueCount: 50 },
      components: { totalInstances: 0, detachedCount: 0 },
      accessibility: { issueCount: 99 },
    });
    const byCat = Object.fromEntries(h.categories.map((c) => [c.category, c.score]));
    expect(byCat.components).toBe(100);
    expect(byCat.layout).toBe(0);
    expect(byCat.accessibility).toBe(0);
    expect(h.grade).toBe("D");
  });
});
