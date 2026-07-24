import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Skill documents are inlined into the bundle at build time (tsup .md loader),
// so they ship with the npm package and need no filesystem access at runtime.
import figmaPluginApi from "../../../docs/skills/figma-plugin-api.md";
import designTokensStrategy from "../../../docs/skills/design-tokens-strategy.md";
import componentArchitecture from "../../../docs/skills/component-architecture-strategy.md";
import designAuditStrategy from "../../../docs/skills/design-audit-strategy.md";
import tokenAudit from "../../../docs/skills/token-audit.md";
import componentSpec from "../../../docs/skills/component-spec.md";
import commentDrivenTasks from "../../../docs/skills/comment-driven-tasks.md";
import designSystemFirst from "../../../docs/skills/design-system-first.md";
import janitorialCleanup from "../../../docs/skills/janitorial-cleanup.md";

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
  [
    "comment-driven-tasks",
    "Async collaboration via Figma comments: poll unresolved threads, claim, execute, report back on-thread. Load when asked to 'handle the comments' or work comment-driven.",
    commentDrivenTasks,
  ],
  [
    "design-system-first",
    "Build UI from the file's own system: inventory → conventions → instantiate components → bind variables → verify. Load before building screens in any file that has a design system.",
    designSystemFirst,
  ],
  [
    "janitorial-cleanup",
    "Bulk cleanup recipes: content-based layer renaming, tokenizing hardcoded values, spacing normalization, detached-instance sweeps — with preview-first discipline.",
    janitorialCleanup,
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
