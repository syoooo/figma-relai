// Rulesets — named common-ancestor law, kept in figma.clientStorage so it
// spans every file this plugin opens on this machine. A file LINKS to one
// ruleset; the file's own carried law stays the working copy that travels
// with the file. Reconciliation on load heals files whose law was wiped
// (Figma discards root sharedPluginData on branch→main merges).
//
// Known limit, by design: clientStorage is per-machine. The ruleset is the
// law's home, not its only backup — export/import covers moving machines.

import { registerHandler } from "../dispatcher.js";
import { readMemory, writeMemory } from "./memory.js";
import type { PrecedentEntry } from "../memory-core.js";

const RS_KEY = "relai.rulesets";
const LINK_NS = "relai";
const LINK_KEY = "rulesetLink";
const CONVENTIONS_KEY = "conventions";
const MAX_RULESETS = 30;
const MAX_CONVENTIONS = 20000;

export interface Ruleset {
  name: string;
  conventions: string;
  seedPrecedents: PrecedentEntry[];
  autoRestore: boolean;
  provenance: string;
  createdAt: string;
  updatedAt: string;
}

interface RulesetLink {
  name: string;
  lastSyncHash: string;
}

// djb2 — cheap, stable content hash for sync comparison
export function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export async function readRulesets(): Promise<Ruleset[]> {
  try {
    const raw = (await figma.clientStorage.getAsync(RS_KEY)) as Ruleset[] | undefined;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function writeRulesets(list: Ruleset[]): Promise<void> {
  await figma.clientStorage.setAsync(RS_KEY, list);
}

export function readLink(): RulesetLink | null {
  const raw = figma.root.getSharedPluginData(LINK_NS, LINK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RulesetLink;
    return parsed && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLink(link: RulesetLink | null): void {
  figma.root.setSharedPluginData(LINK_NS, LINK_KEY, link ? JSON.stringify(link) : "");
}

function fileConventions(): string {
  return figma.root.getSharedPluginData(LINK_NS, CONVENTIONS_KEY);
}

export type RulesetState =
  | "none" // no rulesets exist at all
  | "unlinked" // rulesets exist, this file uses none
  | "in-sync"
  | "file-empty" // linked, but the file's law is gone (the merge wound)
  | "drifted" // linked, file law differs from the ancestor
  | "missing-set"; // linked to a name that no longer exists here

export interface RulesetStatus {
  state: RulesetState;
  linked?: string;
  autoRestore?: boolean;
  fileChars: number;
  setChars?: number;
  setUpdatedAt?: string;
}

export async function rulesetStatus(): Promise<RulesetStatus> {
  const link = readLink();
  const sets = await readRulesets();
  const file = fileConventions();
  if (!link) {
    return { state: sets.length ? "unlinked" : "none", fileChars: file.length };
  }
  const set = sets.find((s) => s.name === link.name);
  if (!set) return { state: "missing-set", linked: link.name, fileChars: file.length };
  const base = {
    linked: set.name,
    autoRestore: set.autoRestore,
    fileChars: file.length,
    setChars: set.conventions.length,
    setUpdatedAt: set.updatedAt,
  };
  if (file.length === 0 && set.conventions.length > 0) return { state: "file-empty", ...base };
  if (contentHash(file) === contentHash(set.conventions)) return { state: "in-sync", ...base };
  return { state: "drifted", ...base };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function requireSet(name: unknown): Promise<{ sets: Ruleset[]; set: Ruleset; index: number }> {
  if (typeof name !== "string" || !name.trim()) throw new Error("Ruleset name is required.");
  const sets = await readRulesets();
  const index = sets.findIndex((s) => s.name === name);
  if (index === -1) throw new Error(`No ruleset named "${name}". list_rulesets shows what exists.`);
  return { sets, set: sets[index], index };
}

/** Pull: ancestor → file. Writes conventions, merges seed precedents (by id). */
export async function restoreFromRuleset(): Promise<{
  restored: string;
  conventionsChars: number;
  precedentsSeeded: number;
}> {
  const link = readLink();
  if (!link) throw new Error("This file is not linked to a ruleset. Use link_ruleset first.");
  const { set } = await requireSet(link.name);
  figma.root.setSharedPluginData(LINK_NS, CONVENTIONS_KEY, set.conventions);
  let seeded = 0;
  if (set.seedPrecedents.length) {
    const existing = readMemory();
    const known = new Set(existing.map((e) => e.id));
    const fresh = set.seedPrecedents.filter((e) => !known.has(e.id));
    if (fresh.length) {
      // Through writeMemory so the precedent index and the panel both refresh
      writeMemory([...fresh, ...existing]);
      seeded = fresh.length;
    }
  }
  writeLink({ name: set.name, lastSyncHash: contentHash(set.conventions) });
  // The panel's rules row reads two messages — the file's law changed, so send both
  figma.ui.postMessage({
    type: "conventions-state",
    present: set.conventions.length > 0,
    content: set.conventions,
  });
  postRulesetState();
  return { restored: set.name, conventionsChars: set.conventions.length, precedentsSeeded: seeded };
}

/** Push: file → ancestor. The file's current conventions become the set's. */
export async function pushToRuleset(): Promise<{ pushed: string; conventionsChars: number }> {
  const link = readLink();
  if (!link) throw new Error("This file is not linked to a ruleset. Use link_ruleset first.");
  const { sets, set, index } = await requireSet(link.name);
  const file = fileConventions();
  if (!file) throw new Error("This file has no conventions to push.");
  sets[index] = { ...set, conventions: file, updatedAt: nowIso() };
  await writeRulesets(sets);
  writeLink({ name: set.name, lastSyncHash: contentHash(file) });
  postRulesetState();
  return { pushed: set.name, conventionsChars: file.length };
}

// The panel mirrors ruleset reality from this one message.
export async function postRulesetState(): Promise<void> {
  const [status, sets] = await Promise.all([rulesetStatus(), readRulesets()]);
  figma.ui.postMessage({
    type: "ruleset-state",
    status,
    rulesets: sets.map((s) => ({
      name: s.name,
      chars: s.conventions.length,
      seeds: s.seedPrecedents.length,
      autoRestore: s.autoRestore,
      updatedAt: s.updatedAt,
    })),
  });
}

/** Called once on plugin load: heal the merge wound, or surface it. */
export async function reconcileOnLoad(): Promise<
  { healed: true; name: string } | { healed: false; status: RulesetStatus }
> {
  const status = await rulesetStatus();
  if (status.state === "file-empty" && status.autoRestore) {
    const r = await restoreFromRuleset();
    figma.notify(`Relai: restored conventions from ruleset "${r.restored}"`);
    return { healed: true, name: r.restored };
  }
  return { healed: false, status };
}

// ─── Export / import (the future sharing format) ────────────────────

export function rulesetToMarkdown(set: Ruleset): string {
  const fm = [
    "---",
    `relai-ruleset: ${set.name}`,
    `layer: product`,
    `provenance: ${set.provenance || "unknown"}`,
    `autoRestore: ${set.autoRestore}`,
    `exportedAt: ${nowIso()}`,
    "---",
  ].join("\n");
  const seeds = set.seedPrecedents.length
    ? "\n\n## seed-precedents\n" +
      set.seedPrecedents
        .map((p) => `- ${JSON.stringify(p)}`)
        .join("\n")
    : "";
  return `${fm}\n\n${set.conventions}${seeds}\n`;
}

export function markdownToRuleset(markdown: string, fallbackName?: string): Omit<Ruleset, "createdAt" | "updatedAt"> {
  let name = fallbackName ?? "";
  let provenance = "";
  let autoRestore = false;
  let body = markdown;
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    body = markdown.slice(fmMatch[0].length);
    for (const line of fmMatch[1].split("\n")) {
      const m = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
      if (!m) continue;
      if (m[1] === "relai-ruleset") name = m[2].trim();
      if (m[1] === "provenance") provenance = m[2].trim();
      if (m[1] === "autoRestore") autoRestore = m[2].trim() === "true";
    }
  }
  // A hand-written conventions doc is not an export package: it carries no
  // frontmatter, so say which of the two ways forward is missing.
  if (!name.trim())
    throw new Error(
      "Ruleset name missing — this markdown has no `relai-ruleset:` frontmatter, so it wasn't produced by export. " +
        "Either import it with a name, or add a frontmatter block (---\\nrelai-ruleset: <name>\\n---) at the top."
    );
  const seeds: PrecedentEntry[] = [];
  const seedSection = body.match(/\n## seed-precedents\n([\s\S]*)$/);
  if (seedSection) {
    body = body.slice(0, body.length - seedSection[0].length);
    for (const line of seedSection[1].split("\n")) {
      const t = line.replace(/^- /, "").trim();
      if (!t) continue;
      try {
        const p = JSON.parse(t) as PrecedentEntry;
        if (p && typeof p.id === "string" && typeof p.text === "string") seeds.push(p);
      } catch {
        // skip malformed seed lines — conventions body is the cargo that matters
      }
    }
  }
  return { name, conventions: body.trim(), seedPrecedents: seeds, autoRestore, provenance };
}

// ─── Commands ───────────────────────────────────────────────────────

registerHandler("list_rulesets", async () => {
  const [sets, link, status] = [await readRulesets(), readLink(), await rulesetStatus()];
  return {
    rulesets: sets.map((s) => ({
      name: s.name,
      chars: s.conventions.length,
      seedPrecedents: s.seedPrecedents.length,
      autoRestore: s.autoRestore,
      provenance: s.provenance,
      updatedAt: s.updatedAt,
      linkedHere: link?.name === s.name,
    })),
    linked: link?.name ?? null,
    state: status.state,
  };
});

registerHandler("save_ruleset", async (params) => {
  const name = typeof params.name === "string" ? params.name.trim() : "";
  if (!name) throw new Error("Ruleset name is required.");
  const fromFile = params.fromFile === true;
  const conventions = fromFile
    ? fileConventions()
    : typeof params.conventions === "string"
      ? params.conventions
      : undefined;
  if (fromFile && !conventions) throw new Error("This file has no conventions to save from.");
  if (conventions !== undefined && conventions.length > MAX_CONVENTIONS)
    throw new Error(`Conventions doc is ${conventions.length} chars — keep it under ${MAX_CONVENTIONS}.`);

  const sets = await readRulesets();
  const index = sets.findIndex((s) => s.name === name);
  if (index === -1) {
    if (conventions === undefined) throw new Error("New ruleset needs conventions (or fromFile: true).");
    if (sets.length >= MAX_RULESETS) throw new Error(`Ruleset limit reached (${MAX_RULESETS}).`);
    sets.push({
      name,
      conventions,
      seedPrecedents: [],
      autoRestore: params.autoRestore === true,
      provenance: typeof params.provenance === "string" ? params.provenance : "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  } else {
    sets[index] = {
      ...sets[index],
      ...(conventions !== undefined ? { conventions } : {}),
      ...(typeof params.autoRestore === "boolean" ? { autoRestore: params.autoRestore } : {}),
      ...(typeof params.provenance === "string" ? { provenance: params.provenance } : {}),
      updatedAt: nowIso(),
    };
  }
  await writeRulesets(sets);
  await postRulesetState();
  return { saved: name, created: index === -1, count: sets.length };
});

registerHandler("delete_ruleset", async (params) => {
  const { sets, index, set } = await requireSet(params.name);
  sets.splice(index, 1);
  await writeRulesets(sets);
  const link = readLink();
  if (link?.name === set.name) writeLink(null);
  await postRulesetState();
  return { deleted: set.name, count: sets.length };
});

registerHandler("link_ruleset", async (params) => {
  const { set } = await requireSet(params.name);
  writeLink({ name: set.name, lastSyncHash: contentHash(set.conventions) });
  let restored: unknown = null;
  if (params.restore === true) restored = await restoreFromRuleset();
  await postRulesetState();
  return { linked: set.name, restored };
});

registerHandler("unlink_ruleset", async () => {
  const link = readLink();
  if (!link) return { unlinked: null };
  writeLink(null);
  await postRulesetState();
  return { unlinked: link.name };
});

registerHandler("ruleset_status", async () => rulesetStatus());

registerHandler("restore_from_ruleset", async () => restoreFromRuleset());

registerHandler("push_to_ruleset", async () => pushToRuleset());

registerHandler("promote_precedent", async (params) => {
  const id = typeof params.id === "string" ? params.id : "";
  if (!id) throw new Error("Precedent id is required.");
  const link = readLink();
  if (!link) throw new Error("This file is not linked to a ruleset — link one before promoting.");
  const { sets, set, index } = await requireSet(link.name);
  const entry = readMemory().find((e) => e.id === id);
  if (!entry) throw new Error(`No precedent with id "${id}".`);
  if (set.seedPrecedents.some((e) => e.id === id))
    return { promoted: id, ruleset: set.name, alreadyThere: true };
  sets[index] = {
    ...set,
    seedPrecedents: [entry, ...set.seedPrecedents].slice(0, 50),
    updatedAt: nowIso(),
  };
  await writeRulesets(sets);
  await postRulesetState();
  return { promoted: id, ruleset: set.name, seeds: sets[index].seedPrecedents.length };
});

registerHandler("export_ruleset", async (params) => {
  const { set } = await requireSet(params.name);
  return { name: set.name, markdown: rulesetToMarkdown(set) };
});

registerHandler("import_ruleset", async (params) => {
  if (typeof params.markdown !== "string" || !params.markdown.trim())
    throw new Error("Provide the ruleset markdown to import.");
  const parsed = markdownToRuleset(
    params.markdown,
    typeof params.name === "string" ? params.name : undefined
  );
  const sets = await readRulesets();
  const index = sets.findIndex((s) => s.name === parsed.name);
  if (index === -1) {
    if (sets.length >= MAX_RULESETS) throw new Error(`Ruleset limit reached (${MAX_RULESETS}).`);
    sets.push({ ...parsed, createdAt: nowIso(), updatedAt: nowIso() });
  } else {
    // The switch on THIS machine wins: a package exported before it was turned
    // on would otherwise silently disarm the one thing that heals a file after
    // a branch merge — which is the whole reason the switch exists.
    sets[index] = { ...sets[index], ...parsed, autoRestore: sets[index].autoRestore, updatedAt: nowIso() };
  }
  await writeRulesets(sets);
  await postRulesetState();
  return {
    imported: parsed.name,
    overwrote: index !== -1,
    seeds: parsed.seedPrecedents.length,
    autoRestore: sets[index === -1 ? sets.length - 1 : index].autoRestore,
  };
});
