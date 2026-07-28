// Page guards — designer-declared no-go zones, stored in the file and
// enforced at dispatch so every write path (including batch_execute's nested
// commands) is covered. The designer edits guards in the panel; agents can
// read them, and may SET them only through the same command surface (which
// the designer sees in the activity feed).

import { collectNodeRefs, isWriteCommand } from "../write-guard.js";
import { registerHandler, setGuardEnforcer } from "../dispatcher.js";

const GUARDS_NS = "relai";
const GUARDS_KEY = "guards";

interface GuardsData {
  pages: string[];
}

export function readGuards(): GuardsData {
  const raw = figma.root.getSharedPluginData(GUARDS_NS, GUARDS_KEY);
  if (!raw) return { pages: [] };
  try {
    const parsed = JSON.parse(raw);
    return { pages: Array.isArray(parsed.pages) ? parsed.pages.filter((p: unknown) => typeof p === "string") : [] };
  } catch {
    return { pages: [] };
  }
}

function writeGuards(data: GuardsData): void {
  figma.root.setSharedPluginData(GUARDS_NS, GUARDS_KEY, data.pages.length ? JSON.stringify(data) : "");
  postGuardsState();
}

export function guardsStatePayload(): {
  pages: Array<{ id: string; name: string; guarded: boolean }>;
  guardedCount: number;
} {
  const guarded = new Set(readGuards().pages);
  const pages = figma.root.children.map((p) => ({
    id: p.id,
    name: p.name,
    guarded: guarded.has(p.id),
  }));
  return { pages, guardedCount: guarded.size };
}

export function postGuardsState(): void {
  figma.ui.postMessage({ type: "guards-state", ...guardsStatePayload() });
}

export function setGuardedPages(pageIds: string[]): GuardsData {
  const valid = new Set(figma.root.children.map((p) => p.id));
  const pages = [...new Set(pageIds.filter((id) => valid.has(id)))];
  const data = { pages };
  writeGuards(data);
  return data;
}

// ─── Enforcement ────────────────────────────────────────────────────

// Commands that operate ON a page object itself
const PAGE_TARGETED = new Set(["delete_page", "rename_page", "set_page_background"]);
// Guard-management + reads that must keep working everywhere
const EXEMPT = new Set(["get_guards", "set_guards", "switch_page", "create_page", "get_pages"]);

const pageOfNodeCache = new Map<string, string | null>();

async function pageOfNode(nodeId: string): Promise<string | null> {
  const cached = pageOfNodeCache.get(nodeId);
  if (cached !== undefined) return cached;
  let pageId: string | null = null;
  try {
    let node = await figma.getNodeByIdAsync(nodeId);
    while (node) {
      if (node.type === "PAGE") {
        pageId = node.id;
        break;
      }
      node = node.parent as BaseNode | null;
    }
  } catch {
    pageId = null;
  }
  pageOfNodeCache.set(nodeId, pageId);
  if (pageOfNodeCache.size > 2000) pageOfNodeCache.clear();
  return pageId;
}

export async function enforcePageGuards(
  command: string,
  params: Record<string, unknown>
): Promise<void> {
  const guarded = new Set(readGuards().pages);
  if (guarded.size === 0) return;
  if (EXEMPT.has(command)) return;

  const guardName = (id: string) =>
    figma.root.children.find((p) => p.id === id)?.name ?? id;

  if (PAGE_TARGETED.has(command) && typeof params.pageId === "string" && guarded.has(params.pageId)) {
    throw new Error(
      `Page "${guardName(params.pageId)}" is an AI no-go zone (designer-set guard). Ask the designer to lift it in the plugin panel (AI no-go zones) if this is intended.`
    );
  }

  if (!isWriteCommand(command, params)) return;

  const refs = collectNodeRefs(params);
  if (refs.length === 0) {
    // Creates and page-scoped writes land on the current page
    if (guarded.has(figma.currentPage.id)) {
      throw new Error(
        `The current page "${figma.currentPage.name}" is an AI no-go zone (designer-set guard). Switch to another page, or ask the designer to lift the guard in the plugin panel.`
      );
    }
    return;
  }
  for (const id of refs.slice(0, 200)) {
    const pageId = await pageOfNode(id);
    if (pageId && guarded.has(pageId)) {
      throw new Error(
        `Node ${id} lives on "${guardName(pageId)}", an AI no-go zone (designer-set guard). That edit is blocked; ask the designer to lift the guard if intended.`
      );
    }
  }
}

/**
 * Post-hoc guard check for the one path that cannot be intercepted up front.
 * enforcePageGuards blocks execute_code only when the CURRENT page is guarded
 * (its params carry no node refs); code that reaches across to another guarded
 * page slips through. This reports those nodes after the fact, so guards and
 * the scope lock speak with the same voice instead of one staying silent.
 */
export async function guardedNodesAmong(
  nodeIds: string[]
): Promise<Array<{ nodeId: string; pageName: string }>> {
  const guarded = new Set(readGuards().pages);
  if (guarded.size === 0) return [];
  const hits: Array<{ nodeId: string; pageName: string }> = [];
  for (const id of nodeIds.slice(0, 200)) {
    const pageId = await pageOfNode(id);
    if (pageId && guarded.has(pageId)) {
      hits.push({
        nodeId: id,
        pageName: figma.root.children.find((p) => p.id === pageId)?.name ?? pageId,
      });
    }
  }
  return hits;
}

/** Structure changed (pages added/removed) — panel list must refresh. */
export function refreshGuardsUI(): void {
  postGuardsState();
}

// ─── Commands ───────────────────────────────────────────────────────

registerHandler("get_guards", async () => guardsStatePayload());

registerHandler("set_guards", async (params) => {
  const pageIds = Array.isArray(params.pages)
    ? (params.pages as unknown[]).filter((p): p is string => typeof p === "string")
    : null;
  if (!pageIds) throw new Error("set_guards needs pages: string[] (page IDs to guard; [] clears).");
  const data = setGuardedPages(pageIds);
  return { guarded: data.pages, count: data.pages.length };
});

setGuardEnforcer(enforcePageGuards);
