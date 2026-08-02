import { registerHandler } from "../dispatcher.js";

// Which file is this, and is it a branch?
//
// `figma.fileKey` is private-plugin-only (the typings say so outright), so a
// Community plugin always reads null and every "auto-detected from the open
// plugin" promise is a lie. What the plugin CAN offer is the raw material:
// the root name, and the keys of components this file publishes. The MCP side
// turns those into a file key over REST and hands the answer back here, where
// it is cached so the round trip happens once per installation.
//
// The cache lives in clientStorage on purpose — the designer's file already
// carries the law and the precedents, and a file key is an environment fact,
// not a design decision. It has no business travelling through a merge.

// Bumped because 0.7.2 cached a wrong answer: the branch lookup was skipped,
// so every branch stored itself as the main file under its own name. A cache
// is read before anything else, so a poisoned one outlives the fix.
const STORE_KEY = "relai.fileIdentity.2";
const MAX_ENTRIES = 20;
const MAX_PROBE_KEYS = 6;

export interface FileIdentity {
  fileKey: string;
  fileName: string;
  /** Present only when this document is a branch of fileKey */
  branchKey?: string;
  branchName?: string;
  resolvedAt?: string;
  /**
   * Which server release worked this out. The plugin never reads it — it is
   * stored and handed back so the server can tell its own answers from those
   * of another release still talking to this same plugin.
   */
  by?: string;
}

type Store = Record<string, FileIdentity>;

async function readStore(): Promise<Store> {
  try {
    return ((await figma.clientStorage.getAsync(STORE_KEY)) as Store) ?? {};
  } catch {
    return {};
  }
}

/**
 * Component keys survive branching — main and its branches publish the same
 * key — so the root name has to join the cache key or a branch would read its
 * parent's identity back out of the cache.
 */
function cacheKey(componentKey: string, rootName: string): string {
  return `${componentKey}::${rootName}`;
}

type Candidate = { key: string; name: string; kind: "set" | "component" };

/**
 * Components are rarely parked at the top of a page — a design system files
 * them inside sections, and scanning one level deep found nothing at all in a
 * file that publishes sixty sets. So this walks, skipping what cannot hold a
 * publishable component: instances, and the inside of a set (its children are
 * variants, whose keys are not the set's).
 *
 * Dot-prefixed names are unpublishable, so their keys only ever 404.
 */
function harvest(root: PageNode | SceneNode, out: Candidate[], seen: Set<string>, depth = 0): void {
  if (out.length >= MAX_PROBE_KEYS || depth > 6) return;
  const children = "children" in root ? root.children : [];
  for (const node of children) {
    if (out.length >= MAX_PROBE_KEYS) return;
    if (node.type === "INSTANCE") continue;
    if (node.type === "COMPONENT_SET" || node.type === "COMPONENT") {
      if (node.name.startsWith(".")) continue;
      const key = (node as ComponentSetNode | ComponentNode).key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, name: node.name, kind: node.type === "COMPONENT_SET" ? "set" : "component" });
      continue; // a set's children are variants; their keys are not the set's
    }
    if ("children" in node) harvest(node, out, seen, depth + 1);
  }
}

/**
 * Under `documentAccess: dynamic-page` a page's children cannot be read until
 * that page is loaded — reaching for them throws rather than returning empty,
 * which took this whole handler down. Pages are loaded one at a time and only
 * until enough keys are in hand: a probe needs a handful, and a file with
 * fifty pages should not pay for all of them.
 */
async function publishedKeys(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  harvest(figma.currentPage, out, seen); // already loaded, so it is free
  if (out.length >= MAX_PROBE_KEYS) return out;
  for (const page of figma.root.children) {
    if (page.id === figma.currentPage.id) continue;
    try {
      await page.loadAsync();
    } catch {
      continue;
    }
    harvest(page, out, seen);
    if (out.length >= MAX_PROBE_KEYS) break;
  }
  return out;
}


registerHandler("get_file_identity", async () => {
  const rootName = figma.root.name;
  // Nothing published means nothing to probe — the caller must ask for a URL
  const candidates = await publishedKeys();
  const store = await readStore();
  for (const c of candidates) {
    const hit = store[cacheKey(c.key, rootName)];
    // The candidates travel WITH the hit. Deciding whether a cached answer is
    // still worth having belongs to the caller that knows which code computed
    // it — and a caller that rejects it must be able to redo the work without
    // asking again.
    if (hit) return { cached: true, rootName, identity: hit, candidates };
  }
  return { cached: false, rootName, candidates };
});

registerHandler("set_file_identity", async (params) => {
  const identity = params.identity as FileIdentity | undefined;
  const componentKey = params.componentKey as string | undefined;
  if (!identity?.fileKey || !componentKey) {
    throw new Error("set_file_identity needs identity.fileKey and the componentKey it was resolved from.");
  }
  const rootName = figma.root.name;
  const store = await readStore();
  store[cacheKey(componentKey, rootName)] = { ...identity, resolvedAt: new Date().toISOString() };
  const entries = Object.entries(store);
  if (entries.length > MAX_ENTRIES) {
    // Oldest first — resolvedAt is written on every store, so this is stable
    entries.sort((a, b) => (a[1].resolvedAt ?? "").localeCompare(b[1].resolvedAt ?? ""));
    for (const [k] of entries.slice(0, entries.length - MAX_ENTRIES)) delete store[k];
  }
  await figma.clientStorage.setAsync(STORE_KEY, store);
  figma.ui.postMessage({ type: "file-identity", rootName, identity });
  return { stored: true, identity };
});

/**
 * Panel boot: paint the lineage the file card is meant to show.
 *
 * Matched on the document's name alone, deliberately. Storing by component key
 * is right — the key is what proves which file this is — but looking up that
 * way at boot meant reading the open page for keys, and only the open page:
 * the label appeared or vanished depending on which page the designer happened
 * to leave open, with the correct answer sitting in the cache the whole time.
 * Loading every page to find a key would make each launch pay for a label.
 *
 * Two files can share a name, so the newest entry wins and this stays a label:
 * the identity that gets addressed is the one the session's own probe resolves.
 */
export async function postFileIdentity(): Promise<void> {
  const rootName = figma.root.name;
  const store = await readStore();
  const suffix = `::${rootName}`;
  const hit = Object.entries(store)
    .filter(([k]) => k.endsWith(suffix))
    .sort((a, b) => (b[1].resolvedAt ?? "").localeCompare(a[1].resolvedAt ?? ""))[0]?.[1];
  if (hit) figma.ui.postMessage({ type: "file-identity", rootName, identity: hit });
}

/**
 * Where a comment pin actually is. A pin gives a node id and an offset inside
 * it, which locates nothing until you know where that node sits and on which
 * page — and a pin whose node IS a page is a pin on empty canvas.
 */
registerHandler("get_comment_anchors", async (params) => {
  const ids = Array.isArray(params.nodeIds) ? (params.nodeIds as string[]) : [];
  const out: Record<
    string,
    { name?: string; type?: string; page?: string; x?: number; y?: number }
  > = {};
  for (const id of ids.slice(0, 100)) {
    let node: BaseNode | null = null;
    try {
      node = await figma.getNodeByIdAsync(id);
    } catch {
      continue;
    }
    if (!node) continue;
    if (node.type === "PAGE") {
      out[id] = { name: node.name, type: "PAGE", page: node.name };
      continue;
    }
    let page: BaseNode | null = node.parent;
    while (page && page.type !== "PAGE") page = page.parent;
    const box = (node as SceneNode).absoluteBoundingBox ?? null;
    out[id] = {
      name: node.name,
      type: node.type,
      page: page?.name,
      ...(box ? { x: box.x, y: box.y } : {}),
    };
  }
  return out;
});
