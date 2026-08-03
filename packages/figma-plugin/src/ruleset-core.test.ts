import { describe, expect, test } from "bun:test";
import { contentHash, newerSide, restoreWouldLoseWork } from "./ruleset-core.js";

describe("contentHash", () => {
  test("same text hashes the same, different text does not", () => {
    expect(contentHash("law")).toBe(contentHash("law"));
    expect(contentHash("law")).not.toBe(contentHash("laws"));
  });

  test("empty is stable", () => {
    expect(contentHash("")).toBe(contentHash(""));
  });
});

describe("newerSide", () => {
  test("names the side written last", () => {
    expect(newerSide("2026-08-03T15:37:00.000Z", "2026-07-29T12:25:11.000Z")).toBe("file");
    expect(newerSide("2026-07-29T12:25:11.000Z", "2026-08-03T15:37:00.000Z")).toBe("set");
  });

  test("identical stamps are 'same', not a winner", () => {
    expect(newerSide("2026-08-03T10:00:00.000Z", "2026-08-03T10:00:00.000Z")).toBe("same");
  });

  test("an unstamped file cannot be adjudicated", () => {
    // Law written before stamping existed. Guessing here is what caused the
    // damage, so the answer has to be "unknown" rather than a default.
    expect(newerSide("", "2026-08-03T10:00:00.000Z")).toBe("unknown");
    expect(newerSide("2026-08-03T10:00:00.000Z", "")).toBe("unknown");
    expect(newerSide("not a date", "2026-08-03T10:00:00.000Z")).toBe("unknown");
  });
});

describe("restoreWouldLoseWork", () => {
  const NEW = "2026-08-03T15:37:00.000Z";
  const OLD = "2026-07-29T12:25:11.000Z";

  test("the 2026-08-03 incident: fresh file law, month-old kit", () => {
    // 7,404 chars written minutes earlier vs a 3,548-char kit from July 29.
    expect(restoreWouldLoseWork("x".repeat(7404), NEW, "y".repeat(3548), OLD)).toBe(true);
  });

  test("the merge wound is still healable — an empty file loses nothing", () => {
    expect(restoreWouldLoseWork("", NEW, "kit law", OLD)).toBe(false);
  });

  test("an older file is what restore is for", () => {
    expect(restoreWouldLoseWork("old law", OLD, "new law", NEW)).toBe(false);
  });

  test("identical law is never a loss, whatever the dates say", () => {
    expect(restoreWouldLoseWork("same law", NEW, "same law", OLD)).toBe(false);
  });

  test("without stamps it does not block — it cannot prove a loss", () => {
    expect(restoreWouldLoseWork("file law", "", "kit law", "")).toBe(false);
  });
});
