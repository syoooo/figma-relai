import type { RGBAColor } from "../types/commands.js";

// Convert RGBA (0-1 range) to hex string
export function rgbaToHex(color: RGBAColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  if (color.a !== undefined && color.a < 1) {
    const a = Math.round(color.a * 255);
    return hex + a.toString(16).padStart(2, "0");
  }
  return hex;
}

// Convert hex string to RGBA (0-1 range)
export function hexToRgba(hex: string): RGBAColor {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const a = clean.length === 8 ? parseInt(clean.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// ---- Perceptual color distance (OKLab, Björn Ottosson's matrices) ----
// Used by the token-drift scan to decide whether a hardcoded color "is" an
// existing variable. Distances are in OKLab units: identical ≈ 0, and
// ~0.02 is at the edge of what most people can tell apart side by side.

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab(color: { r: number; g: number; b: number }): Oklab {
  const lr = srgbToLinear(color.r);
  const lg = srgbToLinear(color.g);
  const lb = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function deltaEOk(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number }
): number {
  const a = rgbToOklab(c1);
  const b = rgbToOklab(c2);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

export interface ColorCandidate {
  /** Variable (or style) identifier the caller wants back on a match */
  id: string;
  name: string;
  color: { r: number; g: number; b: number };
}

/** Closest candidate within tolerance, or null. Ties break toward the first. */
export function nearestColorMatch(
  target: { r: number; g: number; b: number },
  candidates: ColorCandidate[],
  tolerance: number
): { candidate: ColorCandidate; deltaE: number } | null {
  let best: { candidate: ColorCandidate; deltaE: number } | null = null;
  for (const candidate of candidates) {
    const d = deltaEOk(target, candidate.color);
    if (d <= tolerance && (best === null || d < best.deltaE)) {
      best = { candidate, deltaE: d };
    }
  }
  return best;
}
