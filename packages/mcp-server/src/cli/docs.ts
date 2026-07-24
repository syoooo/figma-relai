import type { Manifest } from "./manifest.js";

// Renders tool docs from the same manifest the agents consume — one source,
// two audiences (figma-relai docs [tool]).

interface SchemaProp {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: { type?: string; enum?: unknown[] };
}

function propType(p: SchemaProp): string {
  if (p.enum) return p.enum.map((v) => JSON.stringify(v)).join(" | ");
  const base = Array.isArray(p.type) ? p.type.join("|") : (p.type ?? "any");
  if (base === "array") {
    const item = p.items?.enum
      ? p.items.enum.map((v) => JSON.stringify(v)).join(" | ")
      : (p.items?.type ?? "any");
    return `(${item})[]`;
  }
  return base;
}

export function renderToolDoc(manifest: Manifest, toolName: string): string {
  const tool = manifest.tools.find((t) => t.name === toolName);
  if (!tool) {
    const names = manifest.tools.map((t) => t.name).join(", ");
    return `Unknown tool "${toolName}". Available: ${names}`;
  }
  const schema = tool.inputSchema as {
    properties?: Record<string, SchemaProp>;
    required?: string[];
  };
  const required = new Set(schema.required ?? []);
  const lines = [
    `# ${tool.name}`,
    ``,
    `Category: ${tool.category}`,
    ``,
    tool.description,
    ``,
  ];
  const props = Object.entries(schema.properties ?? {});
  if (props.length > 0) {
    lines.push(`## Parameters`, ``, `| name | type | required | description |`, `|---|---|---|---|`);
    for (const [name, p] of props) {
      const desc = (p.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${name} | \`${propType(p)}\` | ${required.has(name) ? "yes" : "—"} | ${desc} |`);
    }
  } else {
    lines.push(`No parameters.`);
  }
  return lines.join("\n");
}

export function renderToolIndex(manifest: Manifest): string {
  const lines = [`# figma-relai ${manifest.version} — ${manifest.tools.length} tools`, ``];
  let category = "";
  for (const tool of manifest.tools) {
    if (tool.category !== category) {
      category = tool.category;
      lines.push(``, `## ${category}`, ``);
    }
    const first = tool.description.split(/[.:]/)[0];
    lines.push(`- **${tool.name}** — ${first}`);
  }
  lines.push(``, `Run \`figma-relai docs <tool>\` for parameters; \`figma-relai manifest\` for the full JSON contract.`);
  return lines.join("\n");
}
