import type { TransportTruncation } from "@figma-relai/shared";
import { serializeNode } from "./node-helpers.js";

// Turning whatever an execute_figma script returns into JSON, and sizing it
// for the server on the other end. Pure apart from serializeNode, so it runs
// in tests without Figma.

// What a server on protocol 1 accepts: it hands the text to the model as it
// is, so the plugin keeps it short.
export const LEGACY_MAX_RESULT_CHARS = 50000;

// What a server on protocol 2 accepts. It cuts the text for the model itself
// and keeps the whole result in a local file, so the plugin only guards the
// message channel against runaway sizes.
export const MAX_RESULT_CHARS = 4000000;

// Figma's nodes are host objects that carry methods; a row a script builds
// with id/type/parent keys does not. Styles carry methods too but no parent.
export function looksLikeNode(value: unknown): value is SceneNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SceneNode).id === "string" &&
    typeof (value as SceneNode).type === "string" &&
    "parent" in (value as object) &&
    typeof (value as SceneNode).getPluginData === "function"
  );
}

// Styles are host objects as well: their fields live on the prototype, so
// JSON.stringify would see only the id. Copy the fields a reader needs.
const STYLE_FIELDS: Record<string, string[]> = {
  PAINT: ["paints"],
  TEXT: [
    "fontName",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "textCase",
    "textDecoration",
    "paragraphSpacing",
    "paragraphIndent",
    "leadingTrim",
  ],
  EFFECT: ["effects"],
  GRID: ["layoutGrids"],
};

export function looksLikeStyle(value: unknown): value is BaseStyle {
  return (
    typeof value === "object" &&
    value !== null &&
    !("parent" in (value as object)) &&
    typeof (value as BaseStyle).getPluginData === "function" &&
    (value as BaseStyle).type in STYLE_FIELDS
  );
}

function serializeStyle(style: BaseStyle): Record<string, unknown> {
  const fields = ["id", "type", "name", "key", "description", "remote", "boundVariables"];
  const source = style as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [...fields, ...STYLE_FIELDS[style.type]]) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// Make an arbitrary return value JSON-safe: nodes become budgeted summaries,
// styles become their fields, symbols (figma.mixed) become "mixed", functions
// are dropped
export function serializeResult(value: unknown): unknown {
  if (looksLikeNode(value)) return serializeNode(value);
  if (looksLikeStyle(value)) return serializeResult(serializeStyle(value));
  if (Array.isArray(value)) return value.map(serializeResult);
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "symbol") return "mixed";
        if (typeof v === "function") return undefined;
        if (looksLikeNode(v)) return serializeNode(v);
        if (looksLikeStyle(v)) return serializeStyle(v);
        return v;
      }) ?? "null"
    );
  } catch {
    return String(value);
  }
}

export interface FittedResult {
  result: unknown;
  // Protocol 1: `true`, and the count of cut characters is in the text's
  // tail. Protocol 2: how long the full text was and how much was kept;
  // present only when even the protocol 2 limit was exceeded.
  truncated?: true | Omit<TransportTruncation, "file">;
}

/**
 * Size a serialized result for the server that asked for it. `text` is
 * JSON.stringify(result), passed in because the caller already has it.
 */
export function fitResult(result: unknown, text: string | undefined, protocol: number): FittedResult {
  const limit = protocol >= 2 ? MAX_RESULT_CHARS : LEGACY_MAX_RESULT_CHARS;
  if (!text || text.length <= limit) return { result };
  const cut = `${text.slice(0, limit)}… [truncated ${text.length - limit} chars — return a smaller value]`;
  if (protocol >= 2) {
    return { result: cut, truncated: { total: text.length, returned: limit, unit: "chars" } };
  }
  return { result: cut, truncated: true };
}
