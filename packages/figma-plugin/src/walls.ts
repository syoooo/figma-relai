// The designer's walls as the plugin holds them: no-go zones, the
// confirmation dial, the code-execution toggle and the scope lock, for the
// open file. The authoritative copy lives in this module's closure, which a
// script run through execute_figma cannot reach. Storage (the file's shared
// plugin data and clientStorage) is only a record of it:
// - Storage is trusted once, when the plugin loads.
// - Enforcement reads this copy, never storage.
// - The panel changes this copy first and storage after, one write at a time.
// - Checks compare storage with this copy at that moment (wall-core.ts):
//   stricter values are adopted, looser ones are written back and reported.
// - Voice data (precedents, conventions, the ruleset link) is fingerprinted
//   around scripts and reported when a script changed it, never reverted.
// Every decision is a pure function in wall-core.ts; this file is the glue.
import { RelaiError, type LawNotice, type PageRef } from "@figma-relai/shared";
import {
  copyWalls,
  designerOnlyGuardMessage,
  fingerprint,
  guardChangeVerdict,
  panelLostNotice,
  panelMessageVerdict,
  persistShape,
  reconcileWalls,
  resolveFileWalls,
  voiceNotices,
  VOICE_KEYS,
  type CheckPoint,
  type FileWalls,
  type PanelMessageVerdict,
  type PanelProbe,
  type ResolvedFileWalls,
  type ScopeLock,
  type ScriptWindow,
  type SeenWalls,
  type VoiceSnap,
  type WallSettingsStore,
  type Walls,
} from "./wall-core.js";
import { clearScopeLock, setScopeLock } from "./write-guard.js";
import { readGuards, refreshGuardsUI, setGuardedPages } from "./handlers/guards.js";
import { postMemoryState } from "./handlers/memory.js";

export const SETTINGS_KEY = "relai.settings";
const FILE_NS = "relai";

let fileKey = "";
let walls: Walls = { confirmLevel: "risk", allowCodeExec: true, scopeLock: null, guards: [] };
let dropLegacyLock = false;
let ready: Promise<unknown> = Promise.resolve();

// No-go zones an agent added in this plugin session; only these may an agent
// lift again. Reopening the plugin empties it. The set_guards handler in
// handlers/guards.ts keeps the same set by the same rules (writeGuards below
// mirrors setGuardedPages), so this check and the handler always agree.
let agentAdded = new Set<string>();

// Counts Relai's own writes to voice data, so a script is never blamed for them
let voiceEpoch = 0;

// Settings writes run one after another, each writing the copy as it is when
// it runs, so the last write always carries the newest value
let chain: Promise<void> = Promise.resolve();
let settingsWritesPending = 0;

const scripts: ScriptWindow = { running: 0, lastEndedAt: null };
const panel: PanelProbe = { panelBoots: 0, relayConnected: false };

// Notices found inside a command (before a nested dispatch), collected for
// that command's result
let collected: LawNotice[] = [];

function pageRefs(): PageRef[] {
  return figma.root.children.map((p) => ({ id: p.id, name: p.name }));
}

async function loadStore(): Promise<WallSettingsStore> {
  return ((await figma.clientStorage.getAsync(SETTINGS_KEY)) as WallSettingsStore | undefined) ?? {};
}

// ── Load ────────────────────────────────────────────────────────────

/**
 * Read this file's walls from storage, the one time storage is trusted.
 * `key` is wallsKey() for the open file. Returns the stored settings (for
 * the panel's non-wall fields) and what was resolved for this file.
 */
export function initWalls(key: string): Promise<{ store: WallSettingsStore; resolved: ResolvedFileWalls }> {
  fileKey = key;
  const loading = (async () => {
    let store: WallSettingsStore = {};
    try {
      store = await loadStore();
    } catch {
      // Unreadable storage: start from the defaults
    }
    const resolved = resolveFileWalls(store, key, {
      legacyLockHere: await legacyLockIsHere(store.scopeLock),
    });
    const pages = new Set(figma.root.children.map((p) => p.id));
    walls = { ...copyWalls(resolved.walls), guards: readGuards().pages.filter((id) => pages.has(id)) };
    agentAdded = new Set();
    applyLock(walls.scopeLock);
    dropLegacyLock = resolved.migratedLegacyLock;
    // Give the file its own entry now, so the first check finds one
    if (!resolved.perFile || resolved.migratedLegacyLock) persistSettings(false);
    return { store, resolved };
  })();
  ready = loading;
  return loading;
}

/**
 * The machine-wide lock of older versions belongs to whichever file it was
 * set in. Take it over only when one of its nodes exists here under a name
 * the lock recorded (node ids repeat across files, names make it this file's).
 */
async function legacyLockIsHere(lock: ScopeLock | undefined): Promise<boolean> {
  if (!lock || !Array.isArray(lock.ids) || !Array.isArray(lock.names) || lock.names.length === 0) return false;
  for (const id of lock.ids.slice(0, 20)) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && lock.names.includes(node.name)) return true;
    } catch {
      // Not in this file
    }
  }
  return false;
}

function applyLock(lock: ScopeLock | null): void {
  if (lock) setScopeLock(lock.ids, lock.names);
  else clearScopeLock();
}

/** This file's walls, as enforced. A copy; changing it changes nothing. */
export function currentWalls(): Walls {
  return { ...copyWalls(walls), guards: [...walls.guards] };
}

// ── Writes ──────────────────────────────────────────────────────────

/**
 * Queue a write of this file's walls to clientStorage. `asDefault` also makes
 * them the default for files without an entry (a change made in the panel).
 */
export function persistSettings(asDefault: boolean): Promise<void> {
  settingsWritesPending++;
  chain = chain
    .then(async () => {
      const stored = await loadStore();
      const next = persistShape(stored, fileKey, walls, { asDefault, dropLegacyLock });
      await figma.clientStorage.setAsync(SETTINGS_KEY, next);
      dropLegacyLock = false;
    })
    .catch(() => {
      // The next check finds storage behind the copy and writes again
    })
    .finally(() => {
      settingsWritesPending--;
    });
  return chain;
}

/**
 * Write settings that are not walls (locale, client, rooms, auto-connect).
 * They are merged into what is stored, in the same queue as wall writes so
 * neither overwrites the other.
 */
export function persistOtherSettings(patch: Record<string, unknown>): Promise<void> {
  chain = chain
    .then(async () => {
      const stored = await loadStore();
      await figma.clientStorage.setAsync(SETTINGS_KEY, { ...stored, ...patch });
    })
    .catch(() => {
      // Best-effort, as before
    });
  return chain;
}

export interface PanelWallPatch {
  confirmLevel?: Walls["confirmLevel"];
  allowCodeExec?: boolean;
  scopeLock?: ScopeLock | null;
  guards?: string[];
}

/**
 * A change from this plugin's own panel. The copy changes first, with no
 * await before the no-go list reaches the file, so no script can slip in
 * between. A zone the designer lifts or adds is the designer's from then on,
 * so an agent can no longer lift it.
 */
export function commitFromPanel(patch: PanelWallPatch): void {
  let settingsChanged = false;
  if (patch.confirmLevel !== undefined) {
    walls.confirmLevel = patch.confirmLevel;
    settingsChanged = true;
  }
  if (patch.allowCodeExec !== undefined) {
    walls.allowCodeExec = patch.allowCodeExec;
    settingsChanged = true;
  }
  if (patch.scopeLock !== undefined) {
    walls.scopeLock = patch.scopeLock && patch.scopeLock.ids.length > 0 ? patch.scopeLock : null;
    applyLock(walls.scopeLock);
    settingsChanged = true;
  }
  if (patch.guards !== undefined) walls.guards = writeGuards(patch.guards);
  if (settingsChanged) void persistSettings(true);
}

/**
 * An agent's set_guards, judged against the copy. Adding is allowed; lifting
 * a zone the agent did not add in this session is refused whole. On success
 * the copy holds the new list; the caller writes it to the file.
 */
export function judgeAgentGuards(params: Record<string, unknown>): string[] {
  const pages = pageRefs();
  const verdict = guardChangeVerdict(walls.guards, params, agentAdded, new Set(pages.map((p) => p.id)));
  if (verdict.invalid) throw new RelaiError("invalid_params", verdict.invalid);
  if (!verdict.ok) {
    const names = new Map(pages.map((p) => [p.id, p.name]));
    throw new RelaiError(
      "designer_only",
      designerOnlyGuardMessage(verdict.refused.map((id) => ({ id, name: names.get(id) ?? id })))
    );
  }
  walls.guards = verdict.next;
  agentAdded = new Set(verdict.agentAdded);
  return verdict.next;
}

/**
 * Every no-go write that is not an agent's set_guards: the panel, an accepted
 * proposal, a write-back. A zone that changes here is the designer's from now
 * on: one lifted or added, and one put back after something cleared it.
 */
function writeGuards(pages: string[]): string[] {
  const before = new Set(readGuards().pages);
  const written = setGuardedPages(pages).pages;
  agentAdded = new Set([...agentAdded].filter((id) => before.has(id) && written.includes(id)));
  return written;
}

// ── Checks ──────────────────────────────────────────────────────────

function readSeenGuards(): string[] {
  return readGuards().pages;
}

function applyReconcile(r: ReturnType<typeof reconcileWalls>, writeSettings: boolean): void {
  const lockBefore = walls.scopeLock;
  walls = r.next;
  if (walls.scopeLock !== lockBefore) applyLock(walls.scopeLock);
  if (r.writeGuards) writeGuards(r.writeGuards);
  else if (r.notices.some((n) => "key" in n && n.key === "guards")) refreshGuardsUI();
  if (r.writeSettings && writeSettings) void persistSettings(false);
}

/**
 * Compare storage with the copy: adopt what is stricter, write back what is
 * looser, and return what happened. `entry` runs before each agent command,
 * `after_code` when a script finished (pass the voice snapshot taken before
 * it). Closing uses checkOnClose().
 */
export async function checkpoint(where: Exclude<CheckPoint, "close">, voicePre?: VoiceSnap): Promise<LawNotice[]> {
  await ready;
  let stored: FileWalls | null;
  try {
    const store = await loadStore();
    const entry = store.wallsByFile?.[fileKey];
    stored = entry && typeof entry === "object" ? entry : null;
  } catch {
    // Unreadable now: compare guards only
    stored = copyWalls(walls);
  }
  const seen: SeenWalls = { guards: readSeenGuards(), walls: stored };
  const r = reconcileWalls(walls, seen, where, pageRefs(), { settingsWritePending: settingsWritesPending > 0 });
  applyReconcile(r, true);
  const notices = [...r.notices];
  if (voicePre) {
    const voice = voiceNotices(voicePre, snapshotVoice());
    if (voice.some((n) => n.kind === "law_edited_by_code" && n.key === "memory")) postMemoryState();
    notices.push(...voice);
  }
  return notices;
}

/**
 * The no-go list only, synchronously: before every dispatch (nested batch
 * commands included), so a script earlier in a batch cannot clear a zone for
 * the commands after it. Notices wait in collectNotices().
 */
function checkGuardsNow(): void {
  const r = reconcileWalls(
    walls,
    { guards: readSeenGuards(), walls: copyWalls(walls) },
    scripts.running > 0 ? "after_code" : "entry",
    pageRefs()
  );
  if (r.notices.length === 0) return;
  applyReconcile(r, false);
  collected.push(...r.notices);
}

/** Notices found during the current command by the per-dispatch check. */
export function collectNotices(): LawNotice[] {
  const out = collected;
  collected = [];
  return out;
}

/**
 * At close only a synchronous write lands, so only the no-go list is put
 * back. The panel is already gone, so its refresh may fail.
 */
export function checkOnClose(): void {
  const seen = readSeenGuards();
  const missing = walls.guards.filter((id) => !seen.includes(id));
  if (missing.length === 0) return;
  try {
    writeGuards([...new Set([...seen, ...walls.guards])]);
  } catch {
    // The data was written before the panel refresh threw
  }
}

/** The refusal when the designer turned code execution off. */
export function codeExecDisabled(): RelaiError {
  return new RelaiError(
    "code_exec_disabled",
    'Code execution is disabled. The designer can enable it with the "Allow code execution" toggle in the Relai plugin.'
  );
}

type Enforcer = (command: string, params: Record<string, unknown>) => Promise<void>;

/**
 * Wraps the dispatcher's guard check so every dispatch, nested ones included,
 * first sees storage at least as strict as the copy, reads the code toggle
 * from the copy, and judges set_guards against the copy.
 */
export function wallEnforcer(next: Enforcer): Enforcer {
  return async (command, params) => {
    checkGuardsNow();
    if (command === "execute_code" && !walls.allowCodeExec) throw codeExecDisabled();
    if (command === "set_guards") judgeAgentGuards(params);
    await next(command, params);
  };
}

// ── Voice data ──────────────────────────────────────────────────────

/** Fingerprints of the voice data now, with Relai's write count. */
export function snapshotVoice(): VoiceSnap {
  const prints = {} as VoiceSnap["prints"];
  for (const key of VOICE_KEYS) prints[key] = fingerprint(figma.root.getSharedPluginData(FILE_NS, key));
  return { epoch: voiceEpoch, prints };
}

/** Call before Relai itself writes voice data, so no script is blamed for it. */
export function noteVoiceWrite(): void {
  voiceEpoch++;
}

// ── Scripts posing as the panel ─────────────────────────────────────

export function scriptStarted(): void {
  scripts.running++;
}

export function scriptEnded(now = Date.now()): void {
  scripts.running = Math.max(0, scripts.running - 1);
  scripts.lastEndedAt = now;
}

/** Whether to apply a panel message now (designer-only ones wait out scripts). */
export function panelVerdict(type: unknown, now = Date.now()): PanelMessageVerdict {
  return panelMessageVerdict(type, scripts, now);
}

/** The panel announced itself (it loaded). */
export function notePanelBoot(relayConnected: boolean): void {
  panel.panelBoots++;
  panel.relayConnected = relayConnected;
}

/** The panel reported its relay link. */
export function noteRelayState(connected: boolean): void {
  panel.relayConnected = connected;
}

/** The panel as now, to compare across a command; null until the panel has announced itself. */
export function probePanel(): PanelProbe | null {
  return panel.panelBoots > 0 ? { ...panel } : null;
}

export function panelLost(before: PanelProbe | null): LawNotice | null {
  return before ? panelLostNotice(before, panel) : null;
}
