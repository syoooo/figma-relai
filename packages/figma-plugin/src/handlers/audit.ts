import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

// Read-only audits that must walk a whole subtree in one round-trip.
// The MCP-side analyzers previously fetched node info level by level, which
// both missed deep layers and produced N+1 traffic.

const NODE_CAP = 800;
const ISSUE_CAP = 200;

function paintHex(color: { r: number; g: number; b: number }, opacity?: number): string {
  const h = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${h(color.r)}${h(color.g)}${h(color.b)}`;
  return opacity !== undefined && opacity < 1 ? `${base}${h(opacity)}` : base;
}

registerHandler("audit_colors", async (params) => {
  const root = await getNodeById(params.nodeId as string);
  if (!root) throw new Error(`Node not found: ${params.nodeId}`);
  if (root.type === "PAGE") await (root as PageNode).loadAsync();
  const nodes: SceneNode[] = root.type === "PAGE" ? [] : [root as SceneNode];
  if ("findAll" in root) nodes.push(...((root as ChildrenMixin).findAll(() => true) as SceneNode[]));

  const issues: Array<{
    nodeId: string;
    nodeName: string;
    property: "fill" | "stroke";
    color: string;
    hidden: boolean;
  }> = [];
  let totalProperties = 0;
  let boundCount = 0;
  let hiddenCount = 0;
  const scanned = Math.min(nodes.length, NODE_CAP);

  outer: for (let i = 0; i < scanned; i++) {
    const n = nodes[i] as SceneNode & { fills?: unknown; strokes?: unknown };
    for (const prop of ["fills", "strokes"] as const) {
      const paints = n[prop];
      if (!Array.isArray(paints) || paints.length === 0) continue; // also skips figma.mixed
      const solids = paints.filter((p: Paint) => p.type === "SOLID") as SolidPaint[];
      if (solids.length === 0) continue;
      totalProperties++;
      const unbound = solids.filter((p) => !(p.boundVariables && p.boundVariables.color));
      if (unbound.length === 0) {
        boundCount++;
        continue;
      }
      for (const p of unbound) {
        const hidden = p.visible === false;
        if (hidden) hiddenCount++;
        issues.push({
          nodeId: n.id,
          nodeName: n.name,
          property: prop === "fills" ? "fill" : "stroke",
          color: paintHex(p.color, p.opacity),
          hidden,
        });
        if (issues.length >= ISSUE_CAP) break outer;
      }
    }
  }

  return {
    totalProperties,
    boundCount,
    hiddenCount,
    issues,
    scanned,
    capped: nodes.length > NODE_CAP || issues.length >= ISSUE_CAP,
  };
});

registerHandler("find_orphan_instances", async (params) => {
  const root = params.nodeId ? await getNodeById(params.nodeId as string) : figma.currentPage;
  if (!root) throw new Error(`Node not found: ${params.nodeId}`);
  if (root.type === "PAGE") await (root as PageNode).loadAsync();
  const instances =
    "findAll" in root
      ? ((root as ChildrenMixin).findAll((n) => n.type === "INSTANCE") as InstanceNode[])
      : [];

  const orphans: Array<{ id: string; name: string; main?: string; reason: string }> = [];
  let scanned = 0;
  for (const inst of instances) {
    scanned++;
    let main: ComponentNode | null = null;
    try {
      main = await inst.getMainComponentAsync();
    } catch {
      // fall through — unresolvable main is itself the finding
    }
    if (!main) {
      orphans.push({ id: inst.id, name: inst.name, reason: "main component unresolvable" });
    } else if (!main.remote && !main.parent) {
      orphans.push({
        id: inst.id,
        name: inst.name,
        main: main.name,
        reason: "main component deleted (instance keeps a detached copy alive)",
      });
    }
    if (orphans.length >= 100) break;
  }

  return { scanned, total: instances.length, orphans, capped: orphans.length >= 100 };
});
