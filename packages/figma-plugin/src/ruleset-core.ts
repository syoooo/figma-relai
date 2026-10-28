// Pure decisions about the law and its ancestor kit, kept away from the
// handler so they can be tested without a `figma` global (same split as
// memory-core.ts).

import type { KitRefusal } from "@figma-relai/shared";

/** djb2 — cheap, stable content hash for sync comparison */
export function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export type NewerSide = "file" | "set" | "same" | "unknown";

/**
 * Which side of a drift was written last.
 *
 * This exists because "these differ" is not enough to act on. A panel that
 * can only say that has exactly one button to offer — restore — and restore
 * runs kit → file. On 2026-08-03 that replaced a law written minutes earlier
 * with a month-old ancestor, and nothing in the product noticed, because
 * nothing was comparing dates. Undated law is law you cannot adjudicate.
 */
export function newerSide(fileAt: string, setAt: string): NewerSide {
  if (!fileAt || !setAt) return "unknown";
  const f = Date.parse(fileAt);
  const s = Date.parse(setAt);
  if (!Number.isFinite(f) || !Number.isFinite(s)) return "unknown";
  if (f === s) return "same";
  return f > s ? "file" : "set";
}

/**
 * Would restoring the kit over the file destroy newer writing?
 * Only ever true when the file actually has law and the two differ.
 */
export function restoreWouldLoseWork(
  fileConventions: string,
  fileAt: string,
  setConventions: string,
  setAt: string
): boolean {
  if (fileConventions.length === 0) return false;
  if (contentHash(fileConventions) === contentHash(setConventions)) return false;
  return newerSide(fileAt, setAt) === "file";
}

// ─── Kit refusals ───────────────────────────────────────────────────
// A refused push or restore carries the facts the panel shows in place on the
// kit card; the error text the agent gets is built from the same facts.

/** The kit fields a refusal reads. */
export interface KitSide {
  name: string;
  conventions: string;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Push is force-with-lease: refused when the kit has moved since this file
 * last synced it. A file that never synced, or an empty kit, has nothing to
 * lose and is never refused.
 */
export function pushRefusal(lastSyncHash: string, set: KitSide, fileChars: number): KitRefusal | null {
  if (!lastSyncHash || set.conventions.length === 0) return null;
  if (contentHash(set.conventions) === lastSyncHash) return null;
  return {
    code: "kit_lease",
    kit: set.name,
    kitChars: set.conventions.length,
    kitUpdatedAt: set.updatedAt,
    ...(set.updatedBy ? { updatedBy: set.updatedBy } : {}),
    fileChars,
  };
}

/** Restore is refused when it would replace newer file law with an older kit. */
export function restoreRefusal(fileConventions: string, fileAt: string, set: KitSide): KitRefusal | null {
  if (!restoreWouldLoseWork(fileConventions, fileAt, set.conventions, set.updatedAt)) return null;
  return {
    code: "kit_older",
    kit: set.name,
    kitChars: set.conventions.length,
    kitUpdatedAt: set.updatedAt,
    fileChars: fileConventions.length,
    fileUpdatedAt: fileAt,
  };
}

/** The error text for a refusal, as the agent reads it in the tool result. */
export function kitRefusalMessage(refusal: KitRefusal): string {
  if (refusal.code === "kit_lease") {
    return (
      `Ruleset "${refusal.kit}" has changed since this file last synced it ` +
      `(kit ${refusal.kitChars} chars, updated ${refusal.kitUpdatedAt}` +
      `${refusal.updatedBy ? ` by "${refusal.updatedBy}"` : ""}). ` +
      `Review with list/export first; pass force:true only if this file's law should replace it.`
    );
  }
  return (
    `Restore would overwrite newer law. This file's conventions (${refusal.fileChars} chars, written ${refusal.fileUpdatedAt}) ` +
    `are more recent than ruleset "${refusal.kit}" (${refusal.kitChars} chars, ${refusal.kitUpdatedAt}). ` +
    `If the file's law is the one to keep, push it up instead (file → kit). ` +
    `To replace the file anyway, restore with force: true.`
  );
}
