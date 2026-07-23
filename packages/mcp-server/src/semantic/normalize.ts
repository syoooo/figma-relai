import type { NodeSummary, LayoutSummary } from "@figma-relai/shared";
import { rgbaToHex } from "@figma-relai/shared";

// Convert raw Figma node data to a semantic NodeSummary
export function normalizeNode(raw: any): NodeSummary | null {
  if (!raw) return null;

  const summary: NodeSummary = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    size: {
      width: raw.width ?? raw.absoluteBoundingBox?.width ?? 0,
      height: raw.height ?? raw.absoluteBoundingBox?.height ?? 0,
    },
    position: {
      x: raw.x ?? raw.absoluteBoundingBox?.x ?? 0,
      y: raw.y ?? raw.absoluteBoundingBox?.y ?? 0,
    },
  };

  // Fill color → hex
  const fill = extractFillColor(raw);
  if (fill) summary.fill = fill;

  // Stroke → hex
  const stroke = extractStrokeColor(raw);
  if (stroke) summary.stroke = stroke;

  // Corner radius
  if (raw.cornerRadius !== undefined) {
    summary.cornerRadius = raw.cornerRadius === "mixed" ? "mixed" : raw.cornerRadius;
  }

  // Opacity
  if (raw.opacity !== undefined && raw.opacity < 1) {
    summary.opacity = raw.opacity;
  }

  // Layout
  summary.layout = extractLayout(raw);

  // Children summary
  if (raw.children?.length > 0) {
    summary.childSummary = summarizeChildren(raw.children);
  }

  // Component status
  summary.componentStatus = extractComponentStatus(raw);

  return summary;
}

// Normalize an array of raw nodes
export function normalizeNodes(rawNodes: any[]): NodeSummary[] {
  return rawNodes.map(normalizeNode).filter((n): n is NodeSummary => n !== null);
}

// Extract the first solid fill color as hex
function extractFillColor(node: any): string | undefined {
  if (!node.fills?.length) return undefined;
  const solidFill = node.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
  if (!solidFill?.color) return undefined;

  if (typeof solidFill.color === "string" && solidFill.color.startsWith("#")) {
    return solidFill.color;
  }
  return rgbaToHex({
    r: solidFill.color.r,
    g: solidFill.color.g,
    b: solidFill.color.b,
    a: solidFill.opacity ?? solidFill.color.a ?? 1,
  });
}

// Extract the first stroke color as hex
function extractStrokeColor(node: any): string | undefined {
  if (!node.strokes?.length) return undefined;
  const stroke = node.strokes.find((s: any) => s.type === "SOLID" && s.visible !== false);
  if (!stroke?.color) return undefined;

  if (typeof stroke.color === "string" && stroke.color.startsWith("#")) {
    return stroke.color;
  }
  return rgbaToHex({
    r: stroke.color.r,
    g: stroke.color.g,
    b: stroke.color.b,
    a: stroke.opacity ?? stroke.color.a ?? 1,
  });
}

// Extract layout info into a compact summary
function extractLayout(node: any): LayoutSummary | null {
  if (!node.layoutMode || node.layoutMode === "NONE") return null;

  const pt = node.paddingTop ?? 0;
  const pr = node.paddingRight ?? 0;
  const pb = node.paddingBottom ?? 0;
  const pl = node.paddingLeft ?? 0;

  let padding: string;
  if (pt === pr && pr === pb && pb === pl) {
    padding = `${pt}px all`;
  } else if (pt === pb && pl === pr) {
    padding = `${pt}/${pl}`;
  } else {
    padding = `${pt}/${pr}/${pb}/${pl}`;
  }

  return {
    mode: node.layoutMode,
    padding,
    gap: node.itemSpacing ?? 0,
    sizing: {
      horizontal: node.primaryAxisSizingMode ?? node.layoutSizingHorizontal ?? "FIXED",
      vertical: node.counterAxisSizingMode ?? node.layoutSizingVertical ?? "FIXED",
    },
  };
}

// Summarize children as a compact string like "3 children: 1 TEXT, 2 FRAME"
function summarizeChildren(children: any[]): string {
  const typeCounts = new Map<string, number>();
  for (const child of children) {
    const type = child.type || "UNKNOWN";
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  const parts = Array.from(typeCounts.entries())
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  return `${children.length} children: ${parts}`;
}

// Extract component status
function extractComponentStatus(node: any): string | null {
  if (node.type === "COMPONENT") return "component";
  if (node.type === "COMPONENT_SET") return "component_set";
  if (node.type === "INSTANCE") {
    const mainName = node.mainComponent?.name || node.componentName;
    return mainName ? `instance of '${mainName}'` : "instance";
  }
  return null;
}

// Count how many properties are bound to variables vs total color/spacing properties
export function calculateTokenCoverage(
  node: any,
  boundVariables: Record<string, unknown> | null
): number {
  let totalProps = 0;
  let boundProps = 0;

  // Count fill properties
  if (node.fills?.length > 0) {
    totalProps++;
    if (boundVariables && hasBinding(boundVariables, "fills")) boundProps++;
  }

  // Count stroke properties
  if (node.strokes?.length > 0) {
    totalProps++;
    if (boundVariables && hasBinding(boundVariables, "strokes")) boundProps++;
  }

  // Count spacing properties
  for (const prop of ["itemSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
    if (node[prop] !== undefined && node[prop] > 0) {
      totalProps++;
      if (boundVariables && hasBinding(boundVariables, prop)) boundProps++;
    }
  }

  // Corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    totalProps++;
    if (boundVariables && hasBinding(boundVariables, "cornerRadius")) boundProps++;
  }

  if (totalProps === 0) return 1; // No styleable properties = fully covered
  return Math.round((boundProps / totalProps) * 100) / 100;
}

function hasBinding(boundVars: Record<string, unknown>, prefix: string): boolean {
  return Object.keys(boundVars).some((key) => key.startsWith(prefix) || key === prefix);
}
