// Style types for paint, text, effect, and grid styles

export type StyleType = "PAINT" | "TEXT" | "EFFECT" | "GRID";

export interface StyleInfo {
  id: string;
  name: string;
  type: StyleType;
  description: string;
}
