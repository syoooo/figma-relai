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

      // Sections carry a default hairline border that says nothing about the
      // design's voice — exclude them from the stroke signature
      const strokes = n.strokes;
      if (Array.isArray(strokes) && strokes.length > 0 && n.type !== "SECTION") {
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
    for (const [key, value] of Object.entries(bv)) {
      // An instance's property bindings sit one level deeper — {propKey: alias}.
      // Missing them made every icon-name token look unused, and under-counted
      // the ghost census by however many bindings ride on properties.
      if (key === "componentProperties" && value && typeof value === "object") {
        for (const inner of Object.values(value as Record<string, unknown>)) {
          if (Array.isArray(inner)) inner.forEach(push);
          else push(inner);
        }
        continue;
      }
      if (Array.isArray(value)) value.forEach(push);
      else push(value);
    }
  }
  // Effects and grids carry their own bindings (shadow colour, offset, radius…)
  for (const channel of ["effects", "layoutGrids"] as const) {
    const items = node[channel];
    if (Array.isArray(items)) {
      for (const item of items as Array<{ boundVariables?: Record<string, unknown> }>) {
        if (item.boundVariables) Object.values(item.boundVariables).forEach(push);
      }
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

// ─── Token debt: tokens nobody uses, and tokens that borrow ──────────
//
// Two failures that never look wrong on the canvas. A component token nobody
// binds is the ghost census's raw material, waiting. And a component token that
// aliases ANOTHER component's token inherits changes nobody meant to send it —
// the fix is for both to point at the shared upstream instead.
//
// The taxonomy comes from the alias graph rather than a hardcoded list of group
// names: a group that many different groups alias INTO is a foundation (General,
// the colour ramps, Typography). Everything else is component-authored, and an
// alias into one of those is a borrow.
// A property's default value can be bound to a variable, and that binding lives
// on the DEFINITION, not on any node's boundVariables — instances only carry it
// when they override. Reading it per instance (`instance.componentProperties`)
// deep-wraps every property object and aborts the sandbox out of memory on a file
// this size; the definitions are a few hundred nodes, and they are where the
// binding is authored. Variants are skipped: only the set owns the definitions.
function collectPropertyBindingIds(page: PageNode): string[] {
  const ids: string[] = [];
  const definitions = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
  for (const def of definitions) {
    if (def.type === "COMPONENT" && def.parent?.type === "COMPONENT_SET") continue;
    const defs = (def as ComponentNode).componentPropertyDefinitions as
      | Record<string, { boundVariables?: Record<string, { id?: string }> }>
      | undefined;
    if (!defs) continue;
    for (const entry of Object.values(defs)) {
      const bound = entry?.boundVariables;
      if (!bound) continue;
      for (const ref of Object.values(bound)) {
        if (ref && typeof ref.id === "string") ids.push(ref.id);
      }
    }
  }
  return ids;
}

// A variable bound to a TEXT or INSTANCE_SWAP property value lives ONLY in
// `instance.componentProperties[key].boundVariables` — `boundVariables
// .componentProperties` carries the VARIANT ones and nothing else (measured:
// an icon instance shows iconFamily there and hides its Icon Name binding).
// Reading that map deep-wraps every property object; 1,000 instances costs 4
// seconds, 5,700 aborts the sandbox out of memory. So the walk is handed out in
// fixed slices and the server keeps asking until `done` — the memory a slice
// costs is reclaimed when the command returns.
registerHandler("audit_property_bindings", async (params) => {
  const pages = await resolvePages(params.pageIds);
  const offset = typeof params.offset === "number" ? params.offset : 0;
  const limit = typeof params.limit === "number" ? params.limit : 1000;
  const ids: string[] = [];
  let index = 0;
  let scanned = 0;
  let done = true;
  for (const page of pages) {
    const instances = page.findAllWithCriteria({ types: ["INSTANCE"] });
    if (index + instances.length <= offset) {
      index += instances.length;
      continue;
    }
    for (const inst of instances) {
      if (index++ < offset) continue;
      if (scanned >= limit) {
        done = false;
        break;
      }
      scanned++;
      const props = inst.componentProperties as Record<
        string,
        { boundVariables?: Record<string, { id?: string }> }
      >;
      for (const key in props) {
        const bound = props[key]?.boundVariables;
        if (!bound) continue;
        for (const field in bound) {
          const id = bound[field]?.id;
          if (typeof id === "string") ids.push(id);
        }
      }
    }
    if (!done) break;
  }
  return { ids: [...new Set(ids)], scanned, next: offset + scanned, done };
});

const tokenGroup = (name: string) => name.split("/")[0];

// The alias graph, and what it says about which groups are foundations. The
// file-wide report and the single-node rule have to agree on this: two copies of
// the criterion would drift, and then the same token would be a borrow in one
// place and fine in the other.
async function buildTokenGraph() {
  const group = tokenGroup;
  const vars = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collName = new Map(collections.map((c) => [c.id, c.name]));
  const byId = new Map(vars.map((v) => [v.id, v]));

  // Who aliases whom
  const aliasEdges: Array<{ from: Variable; toId: string }> = [];
  for (const v of vars) {
    for (const value of Object.values(v.valuesByMode)) {
      const alias = value as { type?: string; id?: string };
      if (alias && alias.type === "VARIABLE_ALIAS" && alias.id) {
        aliasEdges.push({ from: v, toId: alias.id });
      }
    }
  }
  const sourceGroupsPerTarget = new Map<string, Set<string>>();
  for (const edge of aliasEdges) {
    const target = byId.get(edge.toId);
    if (!target) continue;
    const set = sourceGroupsPerTarget.get(group(target.name)) ?? new Set<string>();
    set.add(group(edge.from.name));
    sourceGroupsPerTarget.set(group(target.name), set);
  }
  const HUB_THRESHOLD = 3; // aliased into by three or more different groups
  const hubs = new Set(
    [...sourceGroupsPerTarget.entries()]
      .filter(([, sources]) => sources.size >= HUB_THRESHOLD)
      .map(([g]) => g)
  );
  // Styles are a shared layer too, and a group consumed by them is a foundation
  // even when few variables alias it — type tokens live behind text styles, so
  // counting only variable→variable edges called the font group a borrower.
  const styleBound: Array<Record<string, unknown>> = [
    ...(await figma.getLocalTextStylesAsync()),
    ...(await figma.getLocalPaintStylesAsync()),
    ...(await figma.getLocalEffectStylesAsync()),
    ...(await figma.getLocalGridStylesAsync()),
  ] as unknown as Array<Record<string, unknown>>;
  for (const style of styleBound) {
    const bound = (style.boundVariables ?? {}) as Record<string, unknown>;
    for (const value of Object.values(bound)) {
      const refs = Array.isArray(value) ? value : [value];
      for (const ref of refs) {
        const id = (ref as { id?: string })?.id;
        const target = id ? byId.get(id) : undefined;
        if (target) hubs.add(group(target.name));
      }
    }
  }

  // Borrows: component group → component group
  const borrows: Array<{ token: string; aliases: string; collection: string }> = [];
  const seenBorrow = new Set<string>();
  for (const edge of aliasEdges) {
    const target = byId.get(edge.toId);
    if (!target) continue;
    const fromGroup = group(edge.from.name);
    const toGroup = group(target.name);
    if (fromGroup === toGroup || hubs.has(toGroup)) continue;
    const key = edge.from.name + "→" + target.name;
    if (seenBorrow.has(key)) continue;
    seenBorrow.add(key);
    borrows.push({
      token: edge.from.name,
      aliases: target.name,
      collection: collName.get(edge.from.variableCollectionId) ?? "?",
    });
  }

  return { vars, byId, collName, aliasEdges, hubs, styleBound, borrows, group };
}

// The same two questions the file-wide report answers, asked about one node —
// so a component can be checked the moment it is finished, instead of showing up
// in an audit weeks later. Scope and borrowing are both invisible on the canvas:
// a wide-open token pollutes every property picker in the file, and a token that
// aliases another component's token changes whenever that component does.
registerHandler("audit_node_tokens", async (params) => {
  const node = (await figma.getNodeByIdAsync(params.nodeId as string)) as SceneNode | null;
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const { byId, hubs, group } = await buildTokenGraph();

  const ids = new Set<string>();
  const subtree: SceneNode[] = [node];
  if ("findAll" in node) subtree.push(...(node as FrameNode).findAll(() => true));
  for (const n of subtree) {
    for (const id of collectBoundVariableIds(n as SceneNode & Record<string, unknown>)) ids.add(id);
  }
  // Property-value bindings again — bounded, because reading them is what costs
  // memory. A component subtree is small; a whole page handed in is not.
  const PROPERTY_READ_LIMIT = 1000;
  let propertyReads = 0;
  for (const n of subtree) {
    if (n.type !== "INSTANCE") continue;
    if (propertyReads++ >= PROPERTY_READ_LIMIT) break;
    const props = n.componentProperties as Record<string, { boundVariables?: Record<string, { id?: string }> }>;
    for (const key in props) {
      const bound = props[key]?.boundVariables;
      if (!bound) continue;
      for (const field in bound) {
        const id = bound[field]?.id;
        if (typeof id === "string") ids.add(id);
      }
    }
  }

  const wideScopes: Array<{ name: string; resolvedType: string }> = [];
  const borrowed: Array<{ token: string; aliases: string }> = [];
  for (const id of ids) {
    const v = byId.get(id);
    if (!v) continue;
    if (v.scopes.length === 0 || v.scopes.indexOf("ALL_SCOPES") >= 0) {
      wideScopes.push({ name: v.name, resolvedType: v.resolvedType });
    }
    for (const value of Object.values(v.valuesByMode)) {
      const alias = value as { type?: string; id?: string };
      if (!alias || alias.type !== "VARIABLE_ALIAS" || !alias.id) continue;
      const target = byId.get(alias.id);
      if (!target) continue;
      if (group(target.name) === group(v.name) || hubs.has(group(target.name))) continue;
      if (borrowed.some((b) => b.token === v.name && b.aliases === target.name)) continue;
      borrowed.push({ token: v.name, aliases: target.name });
    }
  }

  return {
    node: node.name,
    nodesScanned: subtree.length,
    tokensBound: ids.size,
    wideScopes,
    borrowed,
    truncated: propertyReads > PROPERTY_READ_LIMIT,
    foundationGroups: [...hubs].sort(),
  };
});

registerHandler("audit_token_debt", async (params) => {
  const pages = await resolvePages(params.pageIds);
  const scopedToPages = Array.isArray(params.pageIds) && params.pageIds.length > 0;
  const { vars, collName, aliasEdges, hubs, styleBound, borrows, group } = await buildTokenGraph();

  // Usage: nodes plus other variables
  const usedByNode = new Set<string>();
  let nodesScanned = 0;
  for (const page of pages) {
    for (const node of page.findAll(() => true)) {
      nodesScanned++;
      for (const id of collectBoundVariableIds(node as SceneNode & Record<string, unknown>)) {
        usedByNode.add(id);
      }
    }
    for (const id of collectPropertyBindingIds(page)) usedByNode.add(id);
  }
  const usedByVariable = new Set(aliasEdges.map((e) => e.toId));
  // A token consumed only by a text or effect style is in use, even though no
  // node names it directly
  for (const style of styleBound) {
    const bound = (style.boundVariables ?? {}) as Record<string, unknown>;
    for (const value of Object.values(bound)) {
      const refs = Array.isArray(value) ? value : [value];
      for (const ref of refs) {
        const id = (ref as { id?: string })?.id;
        if (id) usedByNode.add(id);
      }
    }
  }

  // The plugin can only see the pages it was handed, so it reports the candidates
  // and which of them it saw used; the server unions that across chunks before
  // calling anything unused. A half-scanned file must never accuse a live token.
  const candidates = vars
    .filter((v) => !hubs.has(group(v.name)) && !usedByVariable.has(v.id))
    .map((v) => ({
      id: v.id,
      name: v.name,
      collection: collName.get(v.variableCollectionId) ?? "?",
      scopes: v.scopes.join(","),
    }));
  const seenUsed = candidates.filter((c) => usedByNode.has(c.id)).map((c) => c.id);

  // Scope hygiene, counted not listed — the existing backlog would drown the report
  const wideOpen = vars.filter(
    (v) => !hubs.has(group(v.name)) && v.scopes.length === 1 && v.scopes[0] === "ALL_SCOPES"
  );
  const wideOpenByGroup: Record<string, number> = {};
  for (const v of wideOpen) wideOpenByGroup[group(v.name)] = (wideOpenByGroup[group(v.name)] ?? 0) + 1;

  // A file with no alias layer has no foundation to detect, so every group looks
  // component-authored and every unused primitive gets accused. Say that plainly
  // rather than handing back a list that means something else than it appears to.
  const noAliasLayer = hubs.size === 0;

  return {
    pages: pages.map((p) => p.name),
    nodesScanned,
    scopedToPages,
    noAliasLayer,
    foundationGroups: [...hubs].sort(),
    borrowedTokens: borrows.slice(0, 40),
    borrowCount: borrows.length,
    candidates,
    seenUsed,
    allScopesByGroup: wideOpenByGroup,
    criterion:
      "A foundation group is aliased into by 3+ other groups; anything else is component-authored. " +
      "Borrow = alias from one component group into another. Unused = no node binding and no alias pointing at it" +
      (scopedToPages ? " (scoped to the pages given — run without pageIds before deleting anything)" : ""),
  };
});
