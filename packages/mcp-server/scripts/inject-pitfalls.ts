// Renders the pitfalls registry into the figma-plugin-api cheat sheet so the
// runtime hints (plugin) and the documentation (MCP prompt) share one source.
// Runs before tsup, which inlines the .md into the server bundle.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PITFALLS } from "../../shared/src/pitfalls.js";

const docPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "docs", "skills", "figma-plugin-api.md"
);

const START = "<!-- PITFALLS:START -->";
const END = "<!-- PITFALLS:END -->";

const bullets = PITFALLS.map((p) => `- ${p.doc}`).join("\n");

const md = readFileSync(docPath, "utf8");
const startIdx = md.indexOf(START);
const endIdx = md.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error("inject-pitfalls: markers not found in figma-plugin-api.md");
  process.exit(1);
}

writeFileSync(
  docPath,
  md.slice(0, startIdx + START.length) + "\n" + bullets + "\n" + md.slice(endIdx)
);
console.log(`inject-pitfalls: rendered ${PITFALLS.length} pitfalls into the cheat sheet`);
