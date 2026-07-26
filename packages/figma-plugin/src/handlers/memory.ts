// File memory (precedents) — storage, handlers, and the in-band surfacing
// lookup. One precedent = one adjudication the designer made; they live in
// shared plugin data on the document root so they travel with the file and
// reach every future session from any AI client.

import { registerHandler } from "../dispatcher.js";
import { collectNodeRefs, isWriteCommand } from "../write-guard.js";
import {
  assertCapacity,
  buildIndex,
  makeId,
  matchPrecedents,
  toSurfaced,
  validatePrecedentInput,
  type PrecedentEntry,
  type PrecedentIndex,
  type PrecedentRef,
  type PrecedentRefs,
  type PrecedentSource,
} from "../memory-core.js";

const MEMORY_NS = "relai";
const MEMORY_KEY = "memory";

export function readMemory(): PrecedentEntry[] {
  const raw = figma.root.getSharedPluginData(MEMORY_NS, MEMORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PrecedentEntry[]) : [];
  } catch {
    return [];
  }
}

let indexCache: PrecedentIndex | null = null;

function writeMemory(entries: PrecedentEntry[]): void {
  figma.root.setSharedPluginData(MEMORY_NS, MEMORY_KEY, entries.length ? JSON.stringify(entries) : "");
  indexCache = null;
  postMemoryState(entries);
}

function getIndex(): PrecedentIndex {
  if (!indexCache) indexCache = buildIndex(readMemory());
  return indexCache;
}

export function postMemoryState(entries?: PrecedentEntry[]): void {
  figma.ui.postMessage({ type: "memory-state", entries: entries ?? readMemory() });
}

// Resolve ref ids to {id, name} so the panel can display names even after
// the referenced thing is renamed (match stays by id).
async function resolveRefs(refs: unknown): Promise<PrecedentRefs | undefined> {
  if (!refs || typeof refs !== "object") return undefined;
  const input = refs as { tokens?: string[]; nodes?: string[]; pages?: string[] };
  const out: PrecedentRefs = {};

  if (Array.isArray(input.tokens) && input.tokens.length) {
    const resolved: PrecedentRef[] = [];
    for (const id of input.tokens.slice(0, 10)) {
      if (typeof id !== "string") continue;
      try {
        const v = await figma.variables.getVariableByIdAsync(id);
        resolved.push({ id, name: v?.name });
      } catch {
        resolved.push({ id });
      }
    }
    if (resolved.length) out.tokens = resolved;
  }
  if (Array.isArray(input.nodes) && input.nodes.length) {
    const resolved: PrecedentRef[] = [];
    for (const id of input.nodes.slice(0, 10)) {
      if (typeof id !== "string") continue;
      try {
        const n = await figma.getNodeByIdAsync(id);
        resolved.push({ id, name: n?.name });
      } catch {
        resolved.push({ id });
      }
    }
    if (resolved.length) out.nodes = resolved;
  }
  if (Array.isArray(input.pages) && input.pages.length) {
    const resolved: PrecedentRef[] = [];
    for (const id of input.pages.slice(0, 5)) {
      if (typeof id !== "string") continue;
      const page = figma.root.children.find((p) => p.id === id);
      resolved.push({ id, name: page?.name });
    }
    if (resolved.length) out.pages = resolved;
  }
  return out.tokens || out.nodes || out.pages ? out : undefined;
}

export async function recordPrecedent(params: {
  kind?: unknown;
  text: unknown;
  refs?: unknown;
  source?: PrecedentSource;
}): Promise<{ id: string; count: number }> {
  const { kind, text } = validatePrecedentInput(params.kind, params.text);
  const entries = readMemory();
  const entry: PrecedentEntry = {
    id: makeId(),
    date: new Date().toISOString().slice(0, 10),
    kind,
    text,
    refs: await resolveRefs(params.refs),
    source: params.source ?? "chat",
  };
  assertCapacity(entries, entry);
  const next = [entry, ...entries];
  writeMemory(next);
  return { id: entry.id, count: next.length };
}

/** Approval-gate companion recording: reason typed by the designer becomes a decision. */
export async function recordGatePrecedent(
  command: string,
  params: Record<string, unknown>,
  approved: boolean,
  reason: string
): Promise<void> {
  const nodes = collectNodeRefs(params).slice(0, 10);
  const variableId =
    typeof params.variableId === "string"
      ? [params.variableId]
      : typeof params.targetVariableId === "string"
        ? [params.targetVariableId]
        : [];
  try {
    await recordPrecedent({
      kind: "decision",
      text: `${approved ? "approved" : "rejected"} ${command}: ${reason}`,
      refs: { nodes, tokens: variableId, pages: [figma.currentPage.id] },
      source: "gate",
    });
  } catch {
    // A full memory must never block the approval flow itself.
  }
}

// ─── In-band surfacing ──────────────────────────────────────────────
// After a successful WRITE, attach precedents whose refs the command touched.
// Same delivery lane as pitfall hints: public law (API physics) there, this
// file's private law here.

// The file-law family manages memory itself — surfacing on it is circular
// (and would clobber list_precedents' own `precedents` key).
const MEMORY_COMMANDS = new Set([
  "record_precedent",
  "list_precedents",
  "update_precedent",
  "remove_precedent",
  "get_conventions",
  "set_conventions",
]);

export function attachPrecedents(
  command: string,
  params: Record<string, unknown>,
  result: unknown
): unknown {
  try {
    if (MEMORY_COMMANDS.has(command)) return result;
    if (!isWriteCommand(command, params)) return result;
    if (result === null || typeof result !== "object" || Array.isArray(result)) return result;
    if ("precedents" in (result as Record<string, unknown>)) return result;
    const tokenIds: string[] = [];
    for (const key of ["variableId", "targetVariableId"]) {
      const v = params[key];
      if (typeof v === "string") tokenIds.push(v);
    }
    const hits = matchPrecedents(getIndex(), {
      tokenIds,
      nodeIds: collectNodeRefs(params),
      pageId: figma.currentPage.id,
    });
    const surfaced = toSurfaced(hits);
    if (!surfaced) return result;
    return { ...(result as Record<string, unknown>), ...surfaced };
  } catch {
    return result; // surfacing must never break the command itself
  }
}

// ─── Handlers ───────────────────────────────────────────────────────

registerHandler("record_precedent", async (params) => {
  return recordPrecedent({
    kind: params.kind,
    text: params.text,
    refs: params.refs,
    source: (params.source as PrecedentSource) ?? "chat",
  });
});

registerHandler("list_precedents", async (params) => {
  const entries = readMemory();
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 50;
  return { precedents: entries.slice(0, limit), count: entries.length };
});

export function removePrecedentById(id: string): { removed: string; count: number } {
  const entries = readMemory();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) throw new Error(`No precedent with id "${id}".`);
  writeMemory(next);
  return { removed: id, count: next.length };
}

registerHandler("remove_precedent", async (params) => {
  return removePrecedentById(params.id as string);
});

registerHandler("update_precedent", async (params) => {
  const id = params.id as string;
  const entries = readMemory();
  const existing = entries.find((e) => e.id === id);
  if (!existing) throw new Error(`No precedent with id "${id}".`);
  const { kind, text } = validatePrecedentInput(params.kind ?? existing.kind, params.text ?? existing.text);
  const updated: PrecedentEntry = {
    ...existing,
    kind,
    text,
    refs: params.refs !== undefined ? await resolveRefs(params.refs) : existing.refs,
  };
  writeMemory(entries.map((e) => (e.id === id ? updated : e)));
  return { updated: id };
});
