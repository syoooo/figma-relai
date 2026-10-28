// File memory (precedents) — storage, handlers, and the in-band surfacing
// lookup. One precedent = one adjudication the designer made; they live in
// shared plugin data on the document root so they travel with the file and
// reach every future session from any AI client.

import { registerHandler } from "../dispatcher.js";
import { collectNodeRefs, isWriteCommand } from "../write-guard.js";
import {
  attachPreflight,
  fingerprint,
  preflightPrecedents as matchBeforeWrite,
  VOICE_KEYS,
  type PrecedentContext,
  type PrecedentPreflight,
  type VoiceSnap,
} from "../wall-core.js";
import {
  assertCapacity,
  assertUpdateCapacity,
  buildIndex,
  makeId,
  validatePrecedentInput,
  type PrecedentEntry,
  type PrecedentIndex,
  type PrecedentRef,
  type PrecedentRefs,
  type PrecedentSource,
} from "../memory-core.js";

const MEMORY_NS = "relai";
const MEMORY_KEY = "memory";

function parseMemory(raw: string): PrecedentEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PrecedentEntry[]) : [];
  } catch {
    return [];
  }
}

export function readMemory(): PrecedentEntry[] {
  return parseMemory(figma.root.getSharedPluginData(MEMORY_NS, MEMORY_KEY));
}

// ─── Voice writes ───────────────────────────────────────────────────
// Precedents, conventions, their timestamp and the ruleset link are reported
// when a script changes them, never reverted. The post-run check snapshots
// them around a script; the epoch counts Relai's own writes so a write by
// one of its own commands while the script awaits is not blamed on it.

let voiceEpoch = 0;

/** Call before Relai itself writes any voice key (memory, conventions, conventionsAt, rulesetLink). */
export function noteVoiceWrite(): void {
  voiceEpoch++;
}

/** The voice keys' fingerprints and Relai's write count, read synchronously. */
export function snapshotVoice(): VoiceSnap {
  const prints = {} as VoiceSnap["prints"];
  for (const key of VOICE_KEYS) prints[key] = fingerprint(figma.root.getSharedPluginData(MEMORY_NS, key));
  return { epoch: voiceEpoch, prints };
}

export function writeMemory(entries: PrecedentEntry[]): void {
  noteVoiceWrite();
  figma.root.setSharedPluginData(MEMORY_NS, MEMORY_KEY, entries.length ? JSON.stringify(entries) : "");
  postMemoryState(entries);
}

// Keyed by the stored text, so a write that bypassed writeMemory (a script
// writing relai/memory directly) is seen at the next match, not after the
// plugin reopens.
let indexCache: { raw: string; index: PrecedentIndex } | null = null;

function getIndex(): PrecedentIndex {
  const raw = figma.root.getSharedPluginData(MEMORY_NS, MEMORY_KEY);
  if (indexCache?.raw !== raw) indexCache = { raw, index: buildIndex(parseMemory(raw)) };
  return indexCache.index;
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
    const missing: string[] = [];
    for (const raw of input.tokens.slice(0, 10)) {
      if (typeof raw !== "string") continue;
      // Writes carry "VariableID:N:M", so a bare "N:M" token ref would never
      // match — and a ref that names no variable surfaces nothing. Both used
      // to be saved silently; fix the first, refuse the second.
      const id = /^\d+:\d+$/.test(raw) ? `VariableID:${raw}` : raw;
      const v = await figma.variables.getVariableByIdAsync(id).catch(() => null);
      if (v) resolved.push({ id, name: v.name });
      else missing.push(id === raw ? `"${raw}"` : `"${raw}" (as ${id})`);
    }
    if (missing.length) {
      throw new Error(
        `No variable found for token ref ${missing.join(", ")} — nothing was saved. ` +
          `Pass variable ids as "VariableID:N:M" (manage_variables action:list shows them).`
      );
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
  // Page ref only as a last resort (no direct anchors) — and page-level
  // surfacing skips gate entries anyway, so this is purely for the record.
  const record = (tokens: string[]) =>
    recordPrecedent({
      kind: "decision",
      text: `${approved ? "approved" : "rejected"} ${command}: ${reason}`,
      refs: { nodes, tokens, pages: nodes.length === 0 && tokens.length === 0 ? [figma.currentPage.id] : [] },
      source: "gate",
    });
  try {
    await record(variableId);
  } catch {
    // A variable that can't be found must not cost the designer's reason:
    // keep it without the token ref. A full memory must never block the
    // approval flow itself.
    if (variableId.length) await record([]).catch(() => {});
  }
}

// ─── In-band surfacing ──────────────────────────────────────────────
// Precedents whose refs a WRITE touches are matched before it runs, against
// the file as it is then (a delete still finds its node), and ride the
// result as its first keys. Each command inside a batch is matched on its
// own. Same delivery lane as pitfall hints: public law (API physics) there,
// this file's private law here. Matching never blocks a write.

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

/**
 * Match this file's precedents against a command before it runs. Call it
 * before dispatch and hand the result to attachPrecedents (and its texts to
 * the approval card). Null when nothing matched.
 */
export function preflightPrecedents(command: string, params: Record<string, unknown>): PrecedentPreflight | null {
  try {
    const ctx: PrecedentContext = {
      pageId: figma.currentPage.id,
      isWrite: isWriteCommand,
      nodeRefs: collectNodeRefs,
      skip: MEMORY_COMMANDS,
    };
    return matchBeforeWrite(getIndex(), command, params, ctx);
  } catch {
    return null; // surfacing must never break the command itself
  }
}

/** Put the precedents matched before the write on the command's result. */
export function attachPrecedents(
  command: string,
  params: Record<string, unknown>,
  result: unknown,
  pre: PrecedentPreflight | null = preflightPrecedents(command, params)
): unknown {
  try {
    return attachPreflight(result, pre);
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
  const next = entries.map((e) => (e.id === id ? updated : e));
  assertUpdateCapacity(entries, next);
  writeMemory(next);
  return { updated: id };
});
