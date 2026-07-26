// Gauges: voice fingerprint, drift flags, readiness score, ghost census.
// Born from a production design-system practice: the ghost criterion is
// live-list membership (deleted variables still resolve by id with name and
// values — Variable has no `removed`), drift is advisory-only (approved
// deviations are how design evolves), and every activity check respects the
// dormant-vs-active lesson (strokeWeight only counts with strokes present).

import { registerHandler } from "../dispatcher.js";
import { readMemory } from "./memory.js";

// ─── Voice fingerprint ──────────────────────────────────────────────

interface Histogram {
  [value: string]: number;
}

interface VoiceFingerprint {
  pages: string[];
  nodesScanned: number;
  signatures: {
    cornerRadius: Array<{ value: number; count: number; share: number }>;
    spacing: Array<{ value: number; count: number; share: number }>;
    fontSize: Array<{ value: number; count: number; share: number }>;
    strokeWeight: Array<{ value: number; count: number; share: number }>;
  };
  tokenizedPaintRate: number;
  instanceRate: number;
}

const bump = (h: Histogram, v: number) => {
  const key = String(Math.round(v * 100) / 100);
  h[key] = (h[key] ?? 0) + 1;
};

const top = (h: Histogram, n = 5) => {
  const total = Object.values(h).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(h)
    .map(([value, count]) => ({ value: Number(value), count, share: Math.round((count / total) * 100) / 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
};

async function resolvePages(pageIds?: unknown): Promise<PageNode[]> {
  const ids = Array.isArray(pageIds) ? (pageIds as string[]) : null;
  if (!ids || ids.length === 0) return [figma.currentPage];
  const pages: PageNode[] = [];
  for (const id of ids.slice(0, 10)) {
    const page = figma.root.children.find((p) => p.id === id);
    if (page) {
      await page.loadAsync();
      pages.push(page);
    }
  }
  return pages.length ? pages : [figma.currentPage];
}

function computeFingerprint(pages: PageNode[]): VoiceFingerprint {
  const radius: Histogram = {};
  const spacing: Histogram = {};
  const fontSize: Histogram = {};
  const strokeW: Histogram = {};
  let paintBearing = 0;
  let paintBound = 0;
  let instances = 0;
  let leafish = 0;
  let scanned = 0;

  for (const page of pages) {
    for (const node of page.findAll(() => true)) {
      scanned++;
      const n = node as SceneNode & Record<string, unknown>;
      if (n.type === "INSTANCE") instances++;
      if (n.type === "FRAME" || n.type === "RECTANGLE" || n.type === "TEXT" || n.type === "COMPONENT") leafish++;

      const cr = n.cornerRadius;
      if (typeof cr === "number" && cr > 0) bump(radius, cr);

      if ("layoutMode" in n && n.layoutMode !== "NONE") {
        const frame = n as unknown as FrameNode;
        if (frame.children.length >= 2 && typeof frame.itemSpacing === "number") bump(spacing, frame.itemSpacing);
        for (const pad of [frame.paddingLeft, frame.paddingRight, frame.paddingTop, frame.paddingBottom]) {
          if (typeof pad === "number" && pad > 0) bump(spacing, pad);
        }
      }

      if (n.type === "TEXT") {
        const fs = (n as unknown as TextNode).fontSize;
        if (typeof fs === "number") bump(fontSize, fs);
      }

      const strokes = n.strokes;
      if (Array.isArray(strokes) && strokes.length > 0) {
        const sw = n.strokeWeight;
        if (typeof sw === "number" && sw > 0) bump(strokeW, sw);
      }

      const fills = n.fills;
      if (Array.isArray(fills) && fills.length > 0) {
        paintBearing++;
        const bv = (n.boundVariables ?? {}) as Record<string, unknown>;
        const fillsBound = Array.isArray(bv.fills) && (bv.fills as unknown[]).length > 0;
        const paintLevelBound = fills.some(
          (p) => (p as Paint & { boundVariables?: Record<string, unknown> }).boundVariables?.color
        );
        const styled = typeof (n as unknown as { fillStyleId?: unknown }).fillStyleId === "string" &&
          (n as unknown as { fillStyleId: string }).fillStyleId !== "";
        if (fillsBound || paintLevelBound || styled) paintBound++;
      }
    }
  }

  return {
    pages: pages.map((p) => p.name),
    nodesScanned: scanned,
    signatures: {
      cornerRadius: top(radius),
      spacing: top(spacing),
      fontSize: top(fontSize),
      strokeWeight: top(strokeW),
    },
    tokenizedPaintRate: paintBearing ? Math.round((paintBound / paintBearing) * 100) / 100 : 1,
    instanceRate: leafish + instances ? Math.round((instances / (leafish + instances)) * 100) / 100 : 0,
  };
}

// Fingerprints are cached briefly so voice_drift checks don't rescan the page
// per node.
const voiceCache = new Map<string, { fp: VoiceFingerprint; ts: number }>();
const VOICE_TTL = 5 * 60 * 1000;

async function fingerprintFor(pageIds?: unknown): Promise<VoiceFingerprint> {
  const pages = await resolvePages(pageIds);
  const key = pages.map((p) => p.id).join(",");
  const hit = voiceCache.get(key);
  if (hit && Date.now() - hit.ts < VOICE_TTL) return hit.fp;
  const fp = computeFingerprint(pages);
  voiceCache.set(key, { fp, ts: Date.now() });
  if (voiceCache.size > 20) voiceCache.clear();
  return fp;
}

registerHandler("audit_voice", async (params) => {
  return fingerprintFor(params.pageIds);
});

// ─── Drift flags (advisory only) ────────────────────────────────────

registerHandler("audit_voice_drift", async (params) => {
  const nodeId = params.nodeId as string;
  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null;
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const fp = await fingerprintFor(undefined);
  const inTop = (list: Array<{ value: number; share: number }>, v: number) =>
    list.length === 0 || list.some((e) => Math.abs(e.value - v) < 0.01);

  const flags: Array<{ nodeId: string; name: string; property: string; value: number; fileTop: number[] }> = [];
  const targets = "findAll" in node ? [node, ...(node as ChildrenMixin & SceneNode).findAll(() => true)] : [node];
  for (const t of targets.slice(0, 500)) {
    const n = t as SceneNode & Record<string, unknown>;
    const cr = n.cornerRadius;
    if (typeof cr === "number" && cr > 0 && !inTop(fp.signatures.cornerRadius, cr)) {
      flags.push({ nodeId: n.id, name: n.name, property: "cornerRadius", value: cr, fileTop: fp.signatures.cornerRadius.map((e) => e.value) });
    }
    if ("layoutMode" in n && n.layoutMode !== "NONE") {
      const frame = n as unknown as FrameNode;
      if (frame.children.length >= 2 && typeof frame.itemSpacing === "number" && frame.itemSpacing > 0 && !inTop(fp.signatures.spacing, frame.itemSpacing)) {
        flags.push({ nodeId: n.id, name: n.name, property: "itemSpacing", value: frame.itemSpacing, fileTop: fp.signatures.spacing.map((e) => e.value) });
      }
    }
    if (n.type === "TEXT") {
      const fs = (n as unknown as TextNode).fontSize;
      if (typeof fs === "number" && !inTop(fp.signatures.fontSize, fs)) {
        flags.push({ nodeId: n.id, name: n.name, property: "fontSize", value: fs, fileTop: fp.signatures.fontSize.map((e) => e.value) });
      }
    }
  }
  return { flags: flags.slice(0, 25), flagCount: flags.length, fingerprintPages: fp.pages };
});

// ─── Readiness score ────────────────────────────────────────────────

registerHandler("audit_readiness", async () => {
  const conventions = figma.root.getSharedPluginData("relai", "conventions");
  const precedents = readMemory().length;
  const variables = await figma.variables.getLocalVariablesAsync();
  const semantic = variables.length
    ? variables.filter((v) => v.name.includes("/")).length / variables.length
    : 0;
  const fp = await fingerprintFor(undefined);
  const components = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
  const styles = [
    ...(await figma.getLocalPaintStylesAsync()),
    ...(await figma.getLocalTextStylesAsync()),
    ...(await figma.getLocalEffectStylesAsync()),
  ];

  const parts = [
    { key: "conventions", score: conventions.length > 0 ? 20 : 0, max: 20, gap: "Write file conventions (manage_conventions action:set) — naming rules, token routing, no-go zones." },
    { key: "precedents", score: Math.min(precedents, 15), max: 15, gap: "Record rulings as precedents as you adjudicate — the file learns your judgment." },
    { key: "semanticTokens", score: Math.round(semantic * 25), max: 25, gap: "Structure variable names semantically (group/step, e.g. color/interactive/primary)." },
    { key: "tokenizedPaint", score: Math.round(fp.tokenizedPaintRate * 20), max: 20, gap: "Bind hardcoded paints to variables (manage_variables action:tokenize)." },
    { key: "components", score: components.length > 0 ? 10 : 0, max: 10, gap: "Componentize repeated UI so agents instantiate instead of redrawing." },
    { key: "styles", score: styles.length > 0 ? 10 : 0, max: 10, gap: "Publish shared text/effect styles." },
  ];
  const score = parts.reduce((a, p) => a + p.score, 0);
  const gaps = parts
    .map((p) => ({ ...p, missing: p.max - p.score }))
    .sort((a, b) => b.missing - a.missing)
    .filter((p) => p.missing > 0)
    .slice(0, 3)
    .map((p) => ({ dimension: p.key, lost: p.missing, fix: p.gap }));

  return {
    score,
    parts: parts.map(({ key, score: s, max }) => ({ key, score: s, max })),
    topGaps: gaps,
    inputs: { variableCount: variables.length, precedents, conventionsChars: conventions.length },
  };
});

// ─── Ghost census (live-list criterion) ─────────────────────────────

function collectBoundVariableIds(node: SceneNode & Record<string, unknown>): string[] {
  const ids: string[] = [];
  const push = (alias: unknown) => {
    const id = (alias as { id?: string } | null)?.id;
    if (typeof id === "string") ids.push(id);
  };
  const bv = node.boundVariables as Record<string, unknown> | undefined;
  if (bv) {
    for (const value of Object.values(bv)) {
      if (Array.isArray(value)) value.forEach(push);
      else push(value);
    }
  }
  for (const channel of ["fills", "strokes"] as const) {
    const paints = node[channel];
    if (Array.isArray(paints)) {
      for (const paint of paints as Array<Paint & { boundVariables?: Record<string, unknown>; gradientStops?: readonly ColorStop[] }>) {
        if (paint.boundVariables) Object.values(paint.boundVariables).forEach(push);
        const stops = (paint as { gradientStops?: readonly (ColorStop & { boundVariables?: Record<string, unknown> })[] }).gradientStops;
        if (stops) for (const stop of stops) if (stop.boundVariables) Object.values(stop.boundVariables).forEach(push);
      }
    }
  }
  return ids;
}

registerHandler("audit_ghosts", async (params) => {
  const pages = await resolvePages(params.pageIds);
  const live = new Set((await figma.variables.getLocalVariablesAsync()).map((v) => v.id));

  type Status = "live" | "remote" | "ghost" | "dangling";
  const statusCache = new Map<string, { status: Status; name?: string }>();
  const classify = async (id: string) => {
    const hit = statusCache.get(id);
    if (hit) return hit;
    let out: { status: Status; name?: string };
    if (live.has(id)) {
      out = { status: "live" };
    } else {
      try {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (!v) out = { status: "dangling" };
        else if (v.remote) out = { status: "remote", name: v.name };
        else out = { status: "ghost", name: v.name };
      } catch {
        out = { status: "dangling" };
      }
    }
    statusCache.set(id, out);
    return out;
  };

  let refsScanned = 0;
  let remoteRefs = 0;
  let danglingRefs = 0;
  const ghosts = new Map<string, { name?: string; refCount: number; sampleNodes: string[] }>();
  let nodesScanned = 0;

  for (const page of pages) {
    for (const node of page.findAll(() => true)) {
      nodesScanned++;
      const ids = collectBoundVariableIds(node as SceneNode & Record<string, unknown>);
      for (const id of ids) {
        refsScanned++;
        const { status, name } = await classify(id);
        if (status === "remote") remoteRefs++;
        else if (status === "dangling") danglingRefs++;
        else if (status === "ghost") {
          const entry = ghosts.get(id) ?? { name, refCount: 0, sampleNodes: [] };
          entry.refCount++;
          if (entry.sampleNodes.length < 3) entry.sampleNodes.push(node.id);
          ghosts.set(id, entry);
        }
      }
    }
  }

  const ghostList = [...ghosts.entries()]
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => b.refCount - a.refCount);
  const ghostRefs = ghostList.reduce((a, g) => a + g.refCount, 0);

  return {
    pages: pages.map((p) => p.name),
    nodesScanned,
    refsScanned,
    ghostRefs,
    ghosts: ghostList.slice(0, 30),
    ghostCount: ghostList.length,
    remoteRefs,
    danglingRefs,
    criterion: "ghost = resolves via getVariableByIdAsync, not remote, absent from getLocalVariablesAsync (soft-deleted)",
  };
});
