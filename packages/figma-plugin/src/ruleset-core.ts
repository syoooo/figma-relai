// Pure decisions about the law and its ancestor kit, kept away from the
// handler so they can be tested without a `figma` global (same split as
// memory-core.ts).

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
