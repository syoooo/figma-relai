import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Skill documents are inlined into the bundle at build time (tsup .md loader),
// so they ship with the npm package and need no filesystem access at runtime.
import figmaPluginApi from "../../../docs/skills/figma-plugin-api.md";
import designTokensStrategy from "../../../docs/skills/design-tokens-strategy.md";
import componentArchitecture from "../../../docs/skills/component-architecture-strategy.md";
import designAuditStrategy from "../../../docs/skills/design-audit-strategy.md";
import tokenAudit from "../../../docs/skills/token-audit.md";
import componentSpec from "../../../docs/skills/component-spec.md";

const SKILLS: Array<[name: string, description: string, text: string]> = [
  [
    "figma-plugin-api",
    "Cheat sheet for writing execute_figma code: dynamic-page rules, font loading, auto-layout pitfalls, common patterns. Load before non-trivial execute_figma work.",
    figmaPluginApi,
  ],
  [
    "design-tokens-strategy",
    "4-tier design-token architecture: naming, mode design, tier reference rules. Load before creating or restructuring variables.",
    designTokensStrategy,
  ],
  [
    "component-architecture-strategy",
    "Component conventions: token-first properties, state handling, size variants, variant naming. Load before building components.",
    componentArchitecture,
  ],
  [
    "design-audit-strategy",
    "End-to-end design audit workflow: overview → tokens → per-aspect analysis → report.",
    designAuditStrategy,
  ],
  [
    "token-audit",
    "Token-compliance check: find raw values, tier violations, scope issues, unbound properties.",
    tokenAudit,
  ],
  [
    "component-spec",
    "Generate a structured component specification: properties, variants, token bindings, state matrix.",
    componentSpec,
  ],
];

export function registerPrompts(server: McpServer): void {
  for (const [name, description, text] of SKILLS) {
    server.prompt(name, description, () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text },
        },
      ],
    }));
  }
}
