import { describe, expect, test } from "bun:test";
import { deltaEOk, hexToRgba, nearestColorMatch, rgbToOklab } from "./color.js";

describe("rgbToOklab", () => {
  test("white is L=1, neutral a/b", () => {
    const lab = rgbToOklab({ r: 1, g: 1, b: 1 });
    expect(lab.L).toBeCloseTo(1, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  test("black is L=0", () => {
    const lab = rgbToOklab({ r: 0, g: 0, b: 0 });
    expect(lab.L).toBeCloseTo(0, 3);
  });

  test("matches the reference value for pure red", () => {
    // From Ottosson's published table: sRGB red → L≈0.628, a≈0.225, b≈0.126
    const lab = rgbToOklab({ r: 1, g: 0, b: 0 });
    expect(lab.L).toBeCloseTo(0.628, 2);
    expect(lab.a).toBeCloseTo(0.225, 2);
    expect(lab.b).toBeCloseTo(0.126, 2);
  });
});

describe("deltaEOk", () => {
  test("identical colors are 0", () => {
    const c = hexToRgba("#4cbb6c");
    expect(deltaEOk(c, c)).toBe(0);
  });

  test("near-identical colors are tiny; opposite colors are large", () => {
    expect(deltaEOk(hexToRgba("#4cbb6c"), hexToRgba("#4dbb6d"))).toBeLessThan(0.01);
    expect(deltaEOk(hexToRgba("#000000"), hexToRgba("#ffffff"))).toBeCloseTo(1, 1);
  });
});

describe("nearestColorMatch", () => {
  const candidates = [
    { id: "v1", name: "green/500", color: hexToRgba("#22c55e") },
    { id: "v2", name: "green/600", color: hexToRgba("#16a34a") },
    { id: "v3", name: "red/500", color: hexToRgba("#ef4444") },
  ];

  test("finds the closest variable within tolerance", () => {
    // A hair off green/600
    const hit = nearestColorMatch(hexToRgba("#17a34b"), candidates, 0.02);
    expect(hit?.candidate.id).toBe("v2");
    expect(hit!.deltaE).toBeLessThan(0.005);
  });

  test("returns null when nothing is close enough", () => {
    expect(nearestColorMatch(hexToRgba("#0000ff"), candidates, 0.02)).toBeNull();
  });

  test("prefers the nearer of two in-tolerance candidates", () => {
    // Between the two greens but nearer 500
    const hit = nearestColorMatch(hexToRgba("#21c05b"), candidates, 0.2);
    expect(hit?.candidate.id).toBe("v1");
  });
});
