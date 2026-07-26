// File memory (precedents) — pure logic, no figma global, unit-testable.
// A precedent is one adjudication the designer made, recorded so every future
// session (from any AI client) inherits it. Storage lives in shared plugin
// data on the document root; this module owns validation, capacity and the
// ref index used for in-band surfacing on write results.

export type PrecedentKind = "decision" | "intent" | "correction";
export type PrecedentSource = "gate" | "chat" | "manual";

export interface PrecedentRef {
  id: string;
  name?: string;
}

export interface PrecedentRefs {
  tokens?: PrecedentRef[];
  nodes?: PrecedentRef[];
  pages?: PrecedentRef[];
}

export interface PrecedentEntry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  kind: PrecedentKind;
  text: string;
  refs?: PrecedentRefs;
  source: PrecedentSource;
}

export const MEMORY_MAX_ENTRIES = 200;
export const MEMORY_MAX_BYTES = 64000; // stays well under the 100KB/key limit
export const PRECEDENT_TEXT_MAX = 280;

const KINDS: PrecedentKind[] = ["decision", "intent", "correction"];

export function validatePrecedentInput(kind: unknown, text: unknown): { kind: PrecedentKind; text: string } {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Precedent text is required — one sentence stating the adjudication.");
  }
  const trimmed = text.trim();
  if (trimmed.length > PRECEDENT_TEXT_MAX) {
    throw new Error(
      `Precedent text is ${trimmed.length} chars — keep it under ${PRECEDENT_TEXT_MAX} (one adjudication, one sentence).`
    );
  }
  const k = (kind ?? "intent") as PrecedentKind;
  if (!KINDS.includes(k)) {
    throw new Error(`Unknown precedent kind "${String(kind)}" — use decision | intent | correction.`);
  }
  return { kind: k, text: trimmed };
}

/** Throws when adding would exceed capacity; message tells the fix. */
export function assertCapacity(entries: PrecedentEntry[], candidate: PrecedentEntry): void {
  if (entries.length + 1 > MEMORY_MAX_ENTRIES) {
    throw new Error(
      `File memory is full (${MEMORY_MAX_ENTRIES} precedents). Ask the agent to consolidate old precedents into summary entries (list_precedents → merge → remove), then record again.`
    );
  }
  const size = serializedSize([candidate, ...entries]);
  if (size > MEMORY_MAX_BYTES) {
    throw new Error(
      `File memory would exceed ${Math.round(MEMORY_MAX_BYTES / 1000)}KB. Ask the agent to consolidate old precedents into summary entries, then record again.`
    );
  }
}

export function serializedSize(entries: PrecedentEntry[]): number {
  return JSON.stringify(entries).length;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Ref index for in-band surfacing ───────────────────────────────

export interface PrecedentIndex {
  byToken: Map<string, PrecedentEntry[]>;
  byNode: Map<string, PrecedentEntry[]>;
  byPage: Map<string, PrecedentEntry[]>;
}

export function buildIndex(entries: PrecedentEntry[]): PrecedentIndex {
  const byToken = new Map<string, PrecedentEntry[]>();
  const byNode = new Map<string, PrecedentEntry[]>();
  const byPage = new Map<string, PrecedentEntry[]>();
  const add = (map: Map<string, PrecedentEntry[]>, key: string, entry: PrecedentEntry) => {
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  };
  for (const entry of entries) {
    for (const r of entry.refs?.tokens ?? []) add(byToken, r.id, entry);
    for (const r of entry.refs?.nodes ?? []) add(byNode, r.id, entry);
    for (const r of entry.refs?.pages ?? []) add(byPage, r.id, entry);
  }
  return { byToken, byNode, byPage };
}

export interface MatchQuery {
  tokenIds?: string[];
  nodeIds?: string[];
  pageId?: string;
}

/** Newest-first, deduped. Page matches rank after direct token/node hits.
 * Gate-sourced entries (approval reasons) never match at page level — they
 * would spam every write on the page; they surface only via direct refs. */
export function matchPrecedents(index: PrecedentIndex, query: MatchQuery): PrecedentEntry[] {
  const seen = new Set<string>();
  const direct: PrecedentEntry[] = [];
  const pageLevel: PrecedentEntry[] = [];
  const take = (
    list: PrecedentEntry[] | undefined,
    into: PrecedentEntry[],
    skipGate = false
  ) => {
    for (const entry of list ?? []) {
      if (seen.has(entry.id)) continue;
      if (skipGate && entry.source === "gate") continue;
      seen.add(entry.id);
      into.push(entry);
    }
  };
  for (const id of query.tokenIds ?? []) take(index.byToken.get(id), direct);
  for (const id of query.nodeIds ?? []) take(index.byNode.get(id), direct);
  if (query.pageId) take(index.byPage.get(query.pageId), pageLevel, true);
  return [...direct, ...pageLevel];
}

/** Compact shape attached to write results (in-band surfacing). */
export function toSurfaced(entries: PrecedentEntry[], max = 2): {
  precedents: Array<{ text: string; kind: PrecedentKind; date: string }>;
  more?: string;
} | null {
  if (entries.length === 0) return null;
  const shown = entries.slice(0, max).map((e) => ({ text: e.text, kind: e.kind, date: e.date }));
  const rest = entries.length - shown.length;
  return rest > 0
    ? { precedents: shown, more: `+${rest} more (manage_conventions action:list_precedents)` }
    : { precedents: shown };
}
