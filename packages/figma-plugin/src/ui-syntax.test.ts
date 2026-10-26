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

  // setLang runs from the EN/日/中 buttons. Every function the script declares
  // is stubbed, so a call to one that no longer exists throws here as it does
  // in the panel, before the locale is saved.
  test("switching the language saves it", () => {
    const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
    const setLang = script.match(/function setLang\(l\) \{[\s\S]*?\n {4}\}/)![0];
    const declared = [
      ...new Set([...script.matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])),
    ].filter((name) => name !== "setLang");
    const saved: unknown[] = [];
    const stubs = declared.map((name) =>
      name === "saveSettings" ? (patch: unknown) => saved.push(patch) : () => {}
    );
    const run = new Function(...declared, `var locale = 'en';\n${setLang}\nsetLang('ja');`);
    run(...stubs);
    expect(saved).toEqual([{ locale: "ja" }]);
  });
});
