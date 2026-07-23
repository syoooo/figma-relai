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
