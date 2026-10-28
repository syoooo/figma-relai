import { describe, expect, test } from "bun:test";
import {
  contentHash,
  kitRefusalMessage,
  newerSide,
  pushRefusal,
  restoreRefusal,
  restoreWouldLoseWork,
  type KitSide,
} from "./ruleset-core.js";

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

describe("pushRefusal", () => {
  const kit: KitSide = { name: "kit", conventions: "# kit law", updatedAt: "2026-09-02T00:00:00.000Z", updatedBy: "B" };

  test("kit moved since this file last synced → kit_lease naming size, date and writer", () => {
    expect(pushRefusal(contentHash("# older"), kit, 12)).toEqual({
      code: "kit_lease",
      kit: "kit",
      kitChars: 9,
      kitUpdatedAt: "2026-09-02T00:00:00.000Z",
      updatedBy: "B",
      fileChars: 12,
    });
  });

  test("a kit with no recorded writer leaves updatedBy out", () => {
    const { updatedBy: _, ...anonymous } = kit;
    expect(pushRefusal(contentHash("# older"), anonymous, 12)).not.toHaveProperty("updatedBy");
  });

  test("first push with no lastSyncHash is allowed", () => {
    expect(pushRefusal("", kit, 12)).toBeNull();
  });

  test("an empty kit never refuses", () => {
    expect(pushRefusal(contentHash("# older"), { ...kit, conventions: "" }, 12)).toBeNull();
  });

  test("same content as last sync is allowed", () => {
    expect(pushRefusal(contentHash("# kit law"), kit, 12)).toBeNull();
  });
});

describe("restoreRefusal", () => {
  const kit: KitSide = { name: "kit", conventions: "# kit law", updatedAt: "2026-09-01T00:00:00.000Z" };

  test("newer file law → kit_older with both sizes and dates", () => {
    expect(restoreRefusal("# fresh", "2026-09-10T00:00:00.000Z", kit)).toEqual({
      code: "kit_older",
      kit: "kit",
      kitChars: 9,
      kitUpdatedAt: "2026-09-01T00:00:00.000Z",
      fileChars: 7,
      fileUpdatedAt: "2026-09-10T00:00:00.000Z",
    });
  });

  test("empty file is never refused (merge wound)", () => {
    expect(restoreRefusal("", "2026-09-10T00:00:00.000Z", kit)).toBeNull();
  });

  test("undated file cannot prove a loss and is allowed", () => {
    expect(restoreRefusal("# fresh", "", kit)).toBeNull();
  });

  test("an older file is allowed", () => {
    expect(restoreRefusal("# stale", "2026-08-01T00:00:00.000Z", kit)).toBeNull();
  });
});

describe("kitRefusalMessage", () => {
  test("names the writer only when the kit recorded one", () => {
    const lease = pushRefusal(contentHash("x"), { name: "kit", conventions: "y", updatedAt: "T" }, 1)!;
    expect(kitRefusalMessage(lease)).toBe(
      `Ruleset "kit" has changed since this file last synced it (kit 1 chars, updated T). ` +
        `Review with list/export first; pass force:true only if this file's law should replace it.`
    );
  });
});
