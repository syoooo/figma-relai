import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The plugin UI script has no build step — a syntax error ships silently and
// kills the whole panel (no room, no handlers). Parse it in CI.
describe("ui.html", () => {
  const html = readFileSync(join(import.meta.dir, "..", "ui.html"), "utf8");

  test("script block parses as valid JavaScript", () => {
    const match = html.match(/<script>([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match![1])).not.toThrow();
  });

  test("tool-list injection markers are present", () => {
    expect(html).toContain("<!-- TOOLS:START -->");
    expect(html).toContain("<!-- TOOLS:END -->");
  });

  test("every data-i18n key exists in all three locales", () => {
    const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
    const keys = [...html.matchAll(/data-i18n(?:-html|-title)?="([a-z_0-9]+)"/g)].map(
      (m) => m[1]
    );
    for (const locale of ["en", "ja", "zh"]) {
      const dict = script.match(new RegExp(`${locale}: \\{([\\s\\S]*?)\\n      \\}`));
      expect(dict).not.toBeNull();
      for (const key of keys) {
        expect(dict![1]).toContain(`${key}:`);
      }
    }
  });
});
