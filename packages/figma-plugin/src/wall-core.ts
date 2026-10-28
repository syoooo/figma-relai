// The wall kernel: every decision the plugin makes about the designer's walls
// (no-go zones, the confirmation dial, the scope lock, the code-execution
// toggle), as pure functions over plain data. Nothing here touches the figma
// global, storage or timers; the closure that holds the walls and the
// handlers that read and write the file call these, and the tests drive them
// directly.
//
// The rules these functions encode:
// - Enforcement reads the plugin's own copy of the walls, never storage.
// - The designer's panel changes that copy first and storage after.
// - A check compares storage with the copy as it is at that moment. Stricter
//   values found in storage are adopted; looser ones are written back over.
// - The scope lock and loosening come only from this plugin's own panel.
// - Voice data (precedents, conventions, the ruleset link) is reported when a
//   script changes it, never reverted.

import type {
  ConfirmLevel,
  DesignerOnlyMessageType,
  Fingerprint,
  LawChangeSource,
  LawNotice,
  PageRef,
  VoiceKey,
  WallField,
} from "@figma-relai/shared";
import { matchPrecedents, toSurfaced, type PrecedentIndex } from "./memory-core.js";

type Params = Record<string, unknown>;

function isObject(value: unknown): value is Params {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

function unique(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

// ── The dial ────────────────────────────────────────────────────────

export const CONFIRM_LEVELS: readonly ConfirmLevel[] = ["open", "risk", "bulk", "all"];

/** Higher asks more often. */
export const LEVEL_RANK: Record<ConfirmLevel, number> = { open: 0, risk: 1, bulk: 2, all: 3 };

export function isConfirmLevel(value: unknown): value is ConfirmLevel {
  return typeof value === "string" && (CONFIRM_LEVELS as readonly string[]).includes(value);
}

/**
 * The dial for settings saved before it existed (pre-0.4). Same rule as
 * migrateConfirmLevel in write-guard.ts; a test keeps the two equal.
 */
export function legacyConfirmLevel(requireApproval?: unknown, confirmHighRisk?: unknown): ConfirmLevel {
  if (requireApproval === "all") return "all";
  if (requireApproval === "bulk") return "bulk";
  return confirmHighRisk === false ? "open" : "risk";
}

// ── Walls and where they are stored ─────────────────────────────────

/** Edits are allowed only inside these nodes (or the page, when a page id). */
export interface ScopeLock {
  ids: string[]; // root node ids; empty never happens (no lock is null)
  names: string[]; // up to 3 names, for the panel and error text
}

/** The designer's wall settings for one file, kept in plugin storage. */
export interface FileWalls {
  confirmLevel: ConfirmLevel;
  allowCodeExec: boolean; // execute_figma may run
  scopeLock: ScopeLock | null; // null: no lock
}

/** All walls for the open file. The no-go list lives in the file itself. */
export interface Walls extends FileWalls {
  guards: string[]; // page ids of the no-go zones
}

/**
 * The wall-related part of the plugin's stored settings. Other fields
 * (room, locale, client, auto-connect) pass through untouched.
 */
export interface WallSettingsStore {
  // Default for a file with no entry: the value the designer last set in any
  // file. Older plugins read these, so they keep being written.
  confirmLevel?: ConfirmLevel;
  allowCodeExec?: boolean;
  requireApproval?: "off" | "bulk" | "all"; // legacy (pre-0.4)
  confirmHighRisk?: boolean; // legacy (pre-0.4)
  // Legacy: one lock for every file on the machine. Migrated into the file
  // whose nodes it names, then dropped.
  scopeLock?: ScopeLock;
  // Each file's own walls, by wallsKey()
  wallsByFile?: Record<string, FileWalls>;
  [key: string]: unknown;
}

/**
 * The storage key for one file's walls. The file's private seed comes first:
 * it is copied into branches and duplicates and survives renames, so the
 * walls follow the file there. Figma's fileKey is the fallback when no seed
 * can be read. Never the file name: renaming a file must not drop its walls.
 */
export function wallsKey(file: { seed?: string | null; fileKey?: string | null }): string | null {
  if (file.seed) return `seed:${file.seed}`;
  if (file.fileKey) return `key:${file.fileKey}`;
  return null;
}

function copyLock(lock: ScopeLock | null | undefined): ScopeLock | null {
  if (!lock || !Array.isArray(lock.ids)) return null;
  const ids = stringList(lock.ids) ?? [];
  if (ids.length === 0) return null;
  return { ids, names: stringList(lock.names) ?? [] };
}

export function copyWalls<T extends FileWalls>(walls: T): T {
  return { ...walls, scopeLock: copyLock(walls.scopeLock) };
}

function sameLock(a: ScopeLock | null, b: ScopeLock | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.ids.length !== b.ids.length) return false;
  const ids = new Set(a.ids);
  return b.ids.every((id) => ids.has(id));
}

export interface ResolvedFileWalls {
  walls: FileWalls;
  perFile: boolean; // the file had its own entry
  migratedLegacyLock: boolean; // the legacy machine-wide lock was taken over by this file
}

/**
 * This file's walls at load, the one moment storage is trusted. The file's
 * own entry wins. Without one, the dial and the toggle come from the
 * machine-wide defaults (or the pre-0.4 settings), and the legacy lock is
 * taken over only when `legacyLockHere` says its root nodes exist in this
 * file; another file's lock is never inherited.
 */
export function resolveFileWalls(
  store: WallSettingsStore,
  key: string,
  options: { legacyLockHere?: boolean } = {}
): ResolvedFileWalls {
  const defaultLevel = isConfirmLevel(store.confirmLevel)
    ? store.confirmLevel
    : legacyConfirmLevel(store.requireApproval, store.confirmHighRisk);
  const defaultExec = store.allowCodeExec !== false;

  const entry = store.wallsByFile?.[key];
  if (isObject(entry)) {
    return {
      walls: {
        confirmLevel: isConfirmLevel(entry.confirmLevel) ? entry.confirmLevel : defaultLevel,
        allowCodeExec: typeof entry.allowCodeExec === "boolean" ? entry.allowCodeExec : defaultExec,
        scopeLock: copyLock(entry.scopeLock),
      },
      perFile: true,
      migratedLegacyLock: false,
    };
  }

  const legacyLock = options.legacyLockHere ? copyLock(store.scopeLock) : null;
  return {
    walls: { confirmLevel: defaultLevel, allowCodeExec: defaultExec, scopeLock: legacyLock },
    perFile: false,
    migratedLegacyLock: legacyLock !== null,
  };
}

/**
 * The settings object to store after this file's walls changed. Other files'
 * entries and every non-wall field come from `stored`, read just before
 * writing; this file's entry comes from `walls`.
 * - `asDefault`: also make these the default for files with no entry (a
 *   change the designer made in the panel).
 * - `dropLegacyLock`: remove the legacy machine-wide lock (this file took it
 *   over). Otherwise it stays for the file it belongs to.
 */
export function persistShape(
  stored: WallSettingsStore,
  key: string,
  walls: FileWalls,
  options: { asDefault: boolean; dropLegacyLock: boolean }
): WallSettingsStore {
  const next: WallSettingsStore = {
    ...stored,
    wallsByFile: {
      ...(isObject(stored.wallsByFile) ? stored.wallsByFile : {}),
      [key]: copyWalls({
        confirmLevel: walls.confirmLevel,
        allowCodeExec: walls.allowCodeExec,
        scopeLock: walls.scopeLock,
      }),
    },
  };
  if (options.asDefault) {
    next.confirmLevel = walls.confirmLevel;
    next.allowCodeExec = walls.allowCodeExec;
  }
  if (options.dropLegacyLock) delete next.scopeLock;
  return next;
}

// ── Checking storage against the plugin's copy ──────────────────────

/** What storage holds at a check. */
export interface SeenWalls {
  guards: string[]; // the file's stored no-go list
  walls: FileWalls | null; // this file's stored entry; null when missing or unreadable
}

export interface WallComparison {
  next: Walls; // the plugin's copy after adopting anything stricter
  tightened: { guards: string[]; fields: Array<"confirmLevel" | "allowCodeExec"> }; // adopted from storage
  looser: { guards: string[]; fields: WallField[] }; // storage is looser here; write `next` back
}

/**
 * Compare storage with the plugin's copy. Stricter is adopted: no-go pages
 * are united (pages that no longer exist drop out), the dial only moves up,
 * a disabled code toggle wins. Anything looser is listed for writing back.
 * The scope lock is never adopted; any difference is written back. A missing
 * entry counts as every setting being looser, so it is written back.
 */
export function adoptStricter(auth: Walls, seen: SeenWalls, pages: readonly PageRef[]): WallComparison {
  const exists = new Set(pages.map((p) => p.id));
  const authGuards = auth.guards.filter((id) => exists.has(id));
  const seenGuards = new Set(seen.guards.filter((id) => exists.has(id)));
  const adopted = [...seenGuards].filter((id) => !authGuards.includes(id));
  const guards = unique([...authGuards, ...adopted]);
  const missing = guards.filter((id) => !seenGuards.has(id));

  const next: Walls = { ...copyWalls(auth), guards };
  const tightened: WallComparison["tightened"] = { guards: adopted, fields: [] };
  const looser: WallComparison["looser"] = { guards: missing, fields: [] };

  if (seen.walls === null) {
    looser.fields.push("confirmLevel", "allowCodeExec", "scopeLock");
    return { next, tightened, looser };
  }

  const seenLevel = isConfirmLevel(seen.walls.confirmLevel) ? seen.walls.confirmLevel : null;
  if (seenLevel === null || LEVEL_RANK[seenLevel] < LEVEL_RANK[auth.confirmLevel]) {
    looser.fields.push("confirmLevel");
  } else if (LEVEL_RANK[seenLevel] > LEVEL_RANK[auth.confirmLevel]) {
    next.confirmLevel = seenLevel;
    tightened.fields.push("confirmLevel");
  }

  if (seen.walls.allowCodeExec === false && auth.allowCodeExec) {
    next.allowCodeExec = false;
    tightened.fields.push("allowCodeExec");
  } else if (seen.walls.allowCodeExec !== false && !auth.allowCodeExec) {
    looser.fields.push("allowCodeExec");
  } else if (typeof seen.walls.allowCodeExec !== "boolean") {
    looser.fields.push("allowCodeExec");
  }

  if (!sameLock(copyLock(seen.walls.scopeLock), auth.scopeLock)) looser.fields.push("scopeLock");

  return { next, tightened, looser };
}

/** Where a check runs. */
export type CheckPoint =
  | "entry" // before each agent command
  | "after_code" // when an execute_figma script finishes, thrown or not
  | "close"; // when the plugin closes (only the no-go list can be written synchronously)

export interface WallReconcile {
  next: Walls; // the plugin's new copy
  writeGuards: string[] | null; // write this no-go list to the file; null: leave it
  writeSettings: boolean; // write `next` as this file's entry
  notices: LawNotice[];
}

/**
 * One check: adopt what is stricter, write back what is looser, and say so.
 * Because the comparison is with the copy at this moment, a change the
 * designer made in the panel while a script ran is already in the copy and
 * is never mistaken for tampering.
 *
 * `settingsWritePending`: a panel change to this file's settings is still on
 * its way to storage, so storage may lag behind the copy. Settings are still
 * written back, but not reported as restored.
 */
export function reconcileWalls(
  auth: Walls,
  seen: SeenWalls,
  where: CheckPoint,
  pages: readonly PageRef[],
  options: { settingsWritePending?: boolean } = {}
): WallReconcile {
  const { next, tightened, looser } = adoptStricter(auth, seen, pages);
  const by: LawChangeSource = where === "after_code" ? "code" : "unknown";
  const names = new Map(pages.map((p) => [p.id, p.name]));
  const refs = (ids: string[]): PageRef[] => ids.map((id) => ({ id, name: names.get(id) ?? id }));

  const notices: LawNotice[] = [];
  if (tightened.guards.length > 0) {
    notices.push({ kind: "law_tightened_outside", key: "guards", pages: refs(tightened.guards) });
  }
  if (tightened.fields.length > 0) {
    notices.push({ kind: "law_tightened_outside", key: "settings", fields: tightened.fields });
  }
  if (looser.guards.length > 0) {
    notices.push({ kind: "law_restored", key: "guards", pages: refs(looser.guards), by });
  }
  if (looser.fields.length > 0 && !options.settingsWritePending) {
    notices.push({ kind: "law_restored", key: "settings", fields: looser.fields, by });
  }

  return {
    next,
    writeGuards: looser.guards.length > 0 ? next.guards : null,
    writeSettings: looser.fields.length > 0,
    notices,
  };
}

/** The warning added to a result whose command had walls put back. */
export function lawRestoredWarning(notices: readonly LawNotice[]): string | null {
  const restored = notices.filter((n) => n.kind === "law_restored");
  if (restored.length === 0) return null;
  const parts: string[] = [];
  for (const n of restored) {
    if (n.kind !== "law_restored") continue;
    if (n.key === "guards") parts.push(`no-go zones: ${n.pages.map((p) => `"${p.name}"`).join(", ")}`);
    else parts.push(`settings: ${n.fields.join(", ")}`);
  }
  return `LAW RESTORED: Relai's own law was changed outside the panel (${parts.join("; ")}). Relai put the designer's value back. No-go zones are lifted, and the confirmation level, the code toggle and the lock are changed, only in the panel.`;
}

// ── Designer-only: lifting a no-go zone ─────────────────────────────

export interface GuardChange {
  ok: boolean; // false when refused or invalid; nothing changes then
  next: string[]; // the no-go list to keep (unchanged unless ok)
  added: string[]; // pages this request adds
  removed: string[]; // pages this request lifts
  refused: string[]; // pages it may not lift: not added by the agent in this plugin session
  agentAdded: string[]; // the session's agent-added pages after the change
  invalid?: string; // the request had none of add, remove or pages
}

/**
 * Judge a set_guards request from an agent. Agents may add zones. Lifting is
 * the designer's, in the panel; the one exception is a zone an agent added
 * in this same plugin session (the set resets when the plugin reopens). If
 * any lift is refused the whole request is refused.
 *
 * Request forms: `{add?, remove?}`, or the older `{pages}`, the complete new
 * list, which is diffed against `current`. When `add` or `remove` is present
 * `pages` is ignored. `existing`, when given, drops ids that are not pages
 * of this file (adding them would do nothing, lifting them is harmless).
 */
export function guardChangeVerdict(
  current: readonly string[],
  request: Params,
  agentAdded: ReadonlySet<string>,
  existing?: ReadonlySet<string>
): GuardChange {
  const add = stringList(request.add);
  const remove = stringList(request.remove);
  const pages = stringList(request.pages);
  const unchanged = { next: [...current], agentAdded: [...agentAdded] };
  if (add === undefined && remove === undefined && pages === undefined) {
    return {
      ok: false,
      ...unchanged,
      added: [],
      removed: [],
      refused: [],
      invalid: "set_guards needs add or remove (page ids), or pages (the full list).",
    };
  }

  const isPage = (id: string) => !existing || existing.has(id);
  const now = new Set(current);
  let added: string[];
  let removed: string[];
  if (add !== undefined || remove !== undefined) {
    added = unique((add ?? []).filter((id) => !now.has(id) && isPage(id)));
    removed = unique((remove ?? []).filter((id) => now.has(id) && isPage(id)));
  } else {
    const wanted = new Set(pages);
    added = unique((pages ?? []).filter((id) => !now.has(id) && isPage(id)));
    removed = current.filter((id) => !wanted.has(id) && isPage(id));
  }
  added = added.filter((id) => !removed.includes(id));

  const refused = removed.filter((id) => !agentAdded.has(id));
  if (refused.length > 0) return { ok: false, ...unchanged, added, removed, refused };

  const lifted = new Set(removed);
  return {
    ok: true,
    next: unique([...current.filter((id) => !lifted.has(id)), ...added]),
    added,
    removed,
    refused: [],
    agentAdded: unique([...[...agentAdded].filter((id) => !lifted.has(id)), ...added]),
  };
}

/** Error text for a refused lift. Starts with "Designer-only:", which the panel styles as law. */
export function designerOnlyGuardMessage(refused: readonly PageRef[]): string {
  const names = refused.map((p) => `"${p.name}"`).join(", ");
  const zone = refused.length === 1 ? "zone" : "zones";
  return `Designer-only: lifting the AI no-go ${zone} on ${names} is done in the Relai panel (AI no-go zones). Agents can add a zone, not remove one. Ask the designer.`;
}

// ── Designer-only: panel messages while a script runs ───────────────

/** Panel messages that change walls or answer for the designer. */
export const DESIGNER_ONLY_MESSAGES: ReadonlySet<DesignerOnlyMessageType> = new Set<DesignerOnlyMessageType>([
  "save-settings",
  "approval-response",
  "guards-set",
  "proposal-response",
  "scope-lock",
]);

/**
 * How long after a script ends designer-only messages stay refused. A script
 * can replace the panel and keep posting from timers after it returns; a
 * timer write was seen landing about 1.5 s after the script returned.
 */
export const SCRIPT_COOLDOWN_MS = 3000;

export function isDesignerOnlyMessage(type: unknown): type is DesignerOnlyMessageType {
  return typeof type === "string" && DESIGNER_ONLY_MESSAGES.has(type as DesignerOnlyMessageType);
}

/** Scripts in flight, and when the last one ended (Date.now(); null: none yet). */
export interface ScriptWindow {
  running: number;
  lastEndedAt: number | null;
}

export type PanelMessageVerdict =
  | { accept: true }
  | { accept: false; reason: "script_running" | "script_cooldown" };

/**
 * Whether to apply a panel message now. While a script runs, and for
 * `cooldownMs` after the last one ends, a message on the designer-only list
 * may come from a script posing as the panel, so it is refused; the caller
 * tells the designer it was not applied. Everything else is accepted.
 */
export function panelMessageVerdict(
  type: unknown,
  window: ScriptWindow,
  now: number,
  cooldownMs = SCRIPT_COOLDOWN_MS
): PanelMessageVerdict {
  if (!isDesignerOnlyMessage(type)) return { accept: true };
  if (window.running > 0) return { accept: false, reason: "script_running" };
  if (window.lastEndedAt !== null && now - window.lastEndedAt < cooldownMs) {
    return { accept: false, reason: "script_cooldown" };
  }
  return { accept: true };
}

/** What the plugin knows about its panel at one moment. */
export interface PanelProbe {
  panelBoots: number; // times a panel has announced itself since the plugin started
  relayConnected: boolean; // the panel's last report of its relay link
}

/**
 * Compare the panel before and after a command. A reload or a dropped relay
 * link means the panel may have been replaced (a script can do that), so the
 * command's outcome is unknown and the designer must reopen the plugin.
 * Returns the notice, or null when the panel is the same one.
 */
export function panelLostNotice(before: PanelProbe, after: PanelProbe): LawNotice | null {
  const panelReloaded = after.panelBoots !== before.panelBoots;
  const relayDropped = before.relayConnected && !after.relayConnected;
  if (!panelReloaded && !relayDropped) return null;
  return { kind: "panel_lost", panelReloaded, relayDropped };
}

// ── Voice data: report, never revert ────────────────────────────────

export const VOICE_KEYS: readonly VoiceKey[] = ["memory", "conventions", "conventionsAt", "rulesetLink"];

/** 32-bit FNV-1a over UTF-16 code units, as 8 lowercase hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprint(text: string): Fingerprint {
  return { len: text.length, fnv: fnv1a(text) };
}

/**
 * Voice data around a script. `epoch` counts Relai's own writes to it; when
 * it moved during the script, Relai itself wrote and nothing is blamed on
 * the script.
 */
export interface VoiceSnap {
  epoch: number;
  prints: Record<VoiceKey, Fingerprint>;
}

/** Voice keys a script changed; [] when Relai itself wrote in between. */
export function voiceDiff(pre: VoiceSnap, post: VoiceSnap): VoiceKey[] {
  if (pre.epoch !== post.epoch) return [];
  return VOICE_KEYS.filter((key) => {
    const a = pre.prints[key];
    const b = post.prints[key];
    return a.len !== b.len || a.fnv !== b.fnv;
  });
}

export function voiceNotices(pre: VoiceSnap, post: VoiceSnap): LawNotice[] {
  return voiceDiff(pre, post).map((key) => ({
    kind: "law_edited_by_code" as const,
    key,
    before: pre.prints[key],
    after: post.prints[key],
  }));
}

// ── Batch: each wrapped command is judged ───────────────────────────

/** Deepest batch_execute nesting allowed; one level deeper is refused as invalid_params. */
export const MAX_BATCH_DEPTH = 3;

export type TaxTier = "ghost" | "irreversible";

/** The single-command rules (write-guard.ts), passed in so this module imports none of it. */
export interface CommandRules {
  isWrite(command: string, params: Params): boolean;
  taxTier(command: string, params: Params): TaxTier | null;
  // The dial's rule for one command; never called with batch_execute
  needsApproval(level: ConfirmLevel, command: string, params: Params): boolean;
  bulkThreshold: number; // batch size that asks at bulk
}

export interface BatchApproval {
  asks: boolean; // the batch needs the designer's approval at this level
  tooDeep: boolean; // nested deeper than MAX_BATCH_DEPTH; refuse the batch as invalid_params
  total: number; // commands, nested batches flattened (malformed items included)
  writes: number; // writes among them (malformed items count as writes)
  codeRuns: number; // execute_code among them
  ghostRisk: number; // ghost-making deletes among them
  irreversible: number; // detach, flatten and wide deletes among them
  malformed: number; // items with no command name, or a non-list `commands`
  asking: number[]; // indexes of top-level items that ask on their own
}

/**
 * Judge a batch_execute at a confirmation level by looking at every wrapped
 * command, nested batches included. The batch asks when any command in it
 * would ask on its own. On top: at `all` when any is a write (a read-only
 * batch no longer asks), at `bulk` when the flattened count reaches the
 * threshold. `open` never asks. Items that cannot be read count as writes
 * that ask.
 */
export function batchApproval(level: ConfirmLevel, commands: unknown, rules: CommandRules, depth = 0): BatchApproval {
  const out: BatchApproval = {
    asks: false,
    tooDeep: depth >= MAX_BATCH_DEPTH,
    total: 0,
    writes: 0,
    codeRuns: 0,
    ghostRisk: 0,
    irreversible: 0,
    malformed: 0,
    asking: [],
  };
  if (out.tooDeep) return out;

  let anyAsk = false;
  if (!Array.isArray(commands)) {
    out.malformed = 1;
    out.total = 1;
    out.writes = 1;
    anyAsk = true;
  } else {
    commands.forEach((item, index) => {
      let asks: boolean;
      if (!isObject(item) || typeof item.command !== "string") {
        out.malformed++;
        out.total++;
        out.writes++;
        asks = true;
      } else if (item.command === "batch_execute") {
        const nested = batchApproval(
          level,
          isObject(item.params) ? item.params.commands : undefined,
          rules,
          depth + 1
        );
        if (nested.tooDeep) out.tooDeep = true;
        out.total += nested.total;
        out.writes += nested.writes;
        out.codeRuns += nested.codeRuns;
        out.ghostRisk += nested.ghostRisk;
        out.irreversible += nested.irreversible;
        out.malformed += nested.malformed;
        asks = nested.asks;
      } else {
        const params = isObject(item.params) ? item.params : {};
        out.total++;
        if (item.command === "execute_code") out.codeRuns++;
        const tier = rules.taxTier(item.command, params);
        if (tier === "ghost") out.ghostRisk++;
        if (tier === "irreversible") out.irreversible++;
        if (rules.isWrite(item.command, params)) out.writes++;
        asks = rules.needsApproval(level, item.command, params);
      }
      if (asks) {
        anyAsk = true;
        out.asking.push(index);
      }
    });
  }

  if (out.tooDeep || level === "open") return { ...out, asks: false };
  out.asks =
    anyAsk || (level === "all" && out.writes > 0) || (level === "bulk" && out.total >= rules.bulkThreshold);
  return out;
}

/** The approval card's scale line for a batch: "12 commands · contains execute_code · 2 ghost-risk". */
export function batchScale(verdict: BatchApproval): string {
  const parts = [`${verdict.total} ${verdict.total === 1 ? "command" : "commands"}`];
  if (verdict.codeRuns > 0) parts.push("contains execute_code");
  if (verdict.ghostRisk > 0) parts.push(`${verdict.ghostRisk} ghost-risk`);
  if (verdict.irreversible > 0) parts.push(`${verdict.irreversible} irreversible`);
  if (verdict.malformed > 0) parts.push(`${verdict.malformed} unreadable`);
  return parts.join(" · ");
}

// ── Precedents matched before the write ─────────────────────────────

export type SurfacedPrecedents = NonNullable<ReturnType<typeof toSurfaced>>;

export interface PrecedentContext {
  pageId: string; // the page the designer is on, read before the write
  isWrite(command: string, params: Params): boolean;
  nodeRefs(params: Params): string[]; // node ids the command references
  skip: ReadonlySet<string>; // commands that never surface precedents (memory and convention commands)
}

/** Precedents matched for one command; a batch has one entry per wrapped command. */
export interface PrecedentPreflight {
  surfaced: SurfacedPrecedents | null; // this command's own matches
  items?: Array<PrecedentPreflight | null>; // batch_execute: per wrapped command, same order
}

// Params that hold variable ids
const TOKEN_KEYS = ["variableId", "targetVariableId"] as const;

/**
 * Match the file's precedents against a command before it runs, against the
 * file as it is before the write (a delete still finds its node). Each
 * command wrapped in a batch is matched on its own. Matching never blocks
 * anything. Returns null when nothing matched.
 */
export function preflightPrecedents(
  index: PrecedentIndex,
  command: string,
  params: Params,
  ctx: PrecedentContext,
  depth = 0
): PrecedentPreflight | null {
  if (ctx.skip.has(command) || !ctx.isWrite(command, params)) return null;

  if (command === "batch_execute") {
    if (!Array.isArray(params.commands) || depth >= MAX_BATCH_DEPTH) return null;
    const items = params.commands.map((item) =>
      isObject(item) && typeof item.command === "string"
        ? preflightPrecedents(index, item.command, isObject(item.params) ? item.params : {}, ctx, depth + 1)
        : null
    );
    return items.some((item) => item !== null) ? { surfaced: null, items } : null;
  }

  const tokenIds = TOKEN_KEYS.map((key) => params[key]).filter((v): v is string => typeof v === "string");
  const surfaced = toSurfaced(
    matchPrecedents(index, { tokenIds, nodeIds: ctx.nodeRefs(params), pageId: ctx.pageId })
  );
  return surfaced ? { surfaced } : null;
}

/** Most precedents an approval card shows, and the most characters of each. */
export const CARD_PRECEDENTS = 2;
export const CARD_PRECEDENT_CHARS = 160;

/** Precedent texts for the approval card: the command's own first, then each wrapped command's, deduped. */
export function cardPrecedents(
  preflight: PrecedentPreflight | null,
  max = CARD_PRECEDENTS,
  maxChars = CARD_PRECEDENT_CHARS
): string[] {
  const texts: string[] = [];
  const walk = (p: PrecedentPreflight | null) => {
    if (!p) return;
    for (const entry of p.surfaced?.precedents ?? []) texts.push(entry.text);
    for (const item of p.items ?? []) walk(item);
  };
  walk(preflight);
  return unique(texts)
    .slice(0, max)
    .map((text) => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text));
}

/**
 * Put the matched precedents on the result. An object result gets
 * `precedents` (and `more`) as its first keys, with
 * `precedentsMatched: "before_write"`. A batch result (an array of
 * `{command, success, result}`) gets them on the item of the command they
 * matched, failed items included. A result that already carries
 * `precedents`, or is not an object or array, is returned unchanged.
 */
export function attachPreflight(result: unknown, preflight: PrecedentPreflight | null): unknown {
  if (!preflight) return result;
  if (Array.isArray(result)) {
    if (!preflight.items) return result;
    return result.map((item, i) => {
      const pre = preflight.items?.[i] ?? null;
      if (!pre || !isObject(item)) return item;
      const withNested =
        pre.items && Array.isArray(item.result) ? { ...item, result: attachPreflight(item.result, pre) } : item;
      return pre.surfaced ? withSurfaced(withNested, pre.surfaced) : withNested;
    });
  }
  if (!isObject(result) || !preflight.surfaced) return result;
  return withSurfaced(result, preflight.surfaced);
}

function withSurfaced(target: Params, surfaced: SurfacedPrecedents): Params {
  if ("precedents" in target) return target;
  return { ...surfaced, precedentsMatched: "before_write", ...target };
}
