// Color conversion utilities for the plugin

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

// Convert plugin color params to Figma RGB
export function toFigmaRGB(color: RGBAColor): RGB {
  return { r: color.r, g: color.g, b: color.b };
}

// Convert plugin color params to Figma RGBA
export function toFigmaRGBA(color: RGBAColor): RGBA {
  return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
}

// Create a solid paint from color
export function solidPaint(color: RGBAColor): SolidPaint {
  return {
    type: "SOLID",
    color: toFigmaRGB(color),
    opacity: color.a ?? 1,
  };
}
