// Regenerates the tool list inside ui.html from the built MCP server so the
// plugin UI can never drift from the real tool surface.
// Runs as part of `bun run build` (after the mcp-server build).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiPath = join(pluginDir, "ui.html");
const serverEntry = join(pluginDir, "..", "mcp-server", "dist", "index.js");

const START = "<!-- TOOLS:START -->";
const END = "<!-- TOOLS:END -->";

if (!existsSync(serverEntry)) {
  console.log("inject-tools: mcp-server not built yet, skipping tool list injection");
  process.exit(0);
}

const catalog: Array<{ name: string; category: string }> = JSON.parse(
  execFileSync("node", [serverEntry, "--list-tools"], { encoding: "utf8" })
);

const byCategory = new Map<string, string[]>();
for (const { name, category } of catalog) {
  const list = byCategory.get(category) ?? [];
  list.push(name);
  byCategory.set(category, list);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = [...byCategory.entries()]
  .map(
    ([category, names]) =>
      `        <details class="cat-details"><summary><span class="cat-arrow">&#9654;</span> ${escapeHtml(category)} (${names.length})</summary><div class="cat-tools">${names
        .map((n) => `<span class="tool-tag">${escapeHtml(n)}</span>`)
        .join("")}</div></details>`
  )
  .join("\n");

const ui = readFileSync(uiPath, "utf8");
const startIdx = ui.indexOf(START);
const endIdx = ui.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error("inject-tools: TOOLS markers not found in ui.html");
  process.exit(1);
}

const next =
  ui.slice(0, startIdx + START.length) + "\n" + html + "\n      " + ui.slice(endIdx);
writeFileSync(uiPath, next);
console.log(`inject-tools: injected ${catalog.length} tools into ui.html`);
