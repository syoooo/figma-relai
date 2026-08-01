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

const STORE_KEY = "relai.fileIdentity";
const MAX_ENTRIES = 20;
const MAX_PROBE_KEYS = 6;

export interface FileIdentity {
  fileKey: string;
  fileName: string;
  /** Present only when this document is a branch of fileKey */
  branchKey?: string;
  branchName?: string;
  resolvedAt?: string;
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

/** Published components only: dot-prefixed ones are unpublishable and 404. */
function publishedKeys(): Array<{ key: string; name: string; kind: "set" | "component" }> {
  const out: Array<{ key: string; name: string; kind: "set" | "component" }> = [];
  const seen = new Set<string>();
  for (const page of figma.root.children) {
    for (const node of page.children) {
      if (out.length >= MAX_PROBE_KEYS) return out;
      if (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT") continue;
      if (node.name.startsWith(".")) continue;
      const key = (node as ComponentSetNode | ComponentNode).key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, name: node.name, kind: node.type === "COMPONENT_SET" ? "set" : "component" });
    }
  }
  return out;
}

registerHandler("get_file_identity", async () => {
  const rootName = figma.root.name;
  const candidates = publishedKeys();
  const store = await readStore();
  for (const c of candidates) {
    const hit = store[cacheKey(c.key, rootName)];
    if (hit) return { cached: true, rootName, identity: hit };
  }
  return {
    cached: false,
    rootName,
    // Nothing published means nothing to probe — the caller must ask for a URL
    candidates,
  };
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

/** Panel boot: show the lineage without waiting for an agent to ask. */
export async function postFileIdentity(): Promise<void> {
  const rootName = figma.root.name;
  const store = await readStore();
  for (const c of publishedKeys()) {
    const hit = store[cacheKey(c.key, rootName)];
    if (hit) {
      figma.ui.postMessage({ type: "file-identity", rootName, identity: hit });
      return;
    }
  }
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
