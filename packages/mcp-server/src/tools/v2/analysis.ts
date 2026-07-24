import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { standardResult } from "../../semantic/response.js";
import { errorResult, noSelectionError } from "../../semantic/errors.js";
import { normalizeNode } from "../../semantic/normalize.js";
import { computeHealthScore, type HealthInputs } from "../../semantic/health.js";
import { rgbaToHex } from "@figma-relai/shared";
import type {
  ColorUsageData,
  ColorUsageIssue,
  LayoutQualityData,
  LayoutIssue,
  ComponentHealthData,
  AccessibilityData,
  AccessibilityIssue,
  DiffNodesData,
  NodeDiffField,
} from "@figma-relai/shared";

// The consolidated tool surface exposes one analyze_design tool; the four
// aspect implementations below register through an interceptor that collects
// their handlers instead of exposing them individually. diff_nodes stays a
// real tool (it has a different signature).
const ASPECT_TOOL: Record<string, string> = {
  color: "analyze_color_usage",
  layout: "analyze_layout_quality",
  components: "analyze_component_health",
  accessibility: "analyze_accessibility",
};

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  type ToolHandler = (args: { nodeId?: string }) => Promise<CallToolResult>;
  const aspectHandlers = new Map<string, ToolHandler>();

  const interceptor = new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== "tool") return Reflect.get(target, prop, receiver);
      return (name: string, ...rest: unknown[]) => {
        if (name.startsWith("analyze_")) {
          aspectHandlers.set(name, rest[rest.length - 1] as ToolHandler);
          return;
        }
        return (target.tool as (...a: unknown[]) => unknown).call(target, name, ...rest);
      };
    },
  }) as McpServer;

  registerAnalysisTools(interceptor, sendCommand);

  server.tool(
    "analyze_design",
    "Audit the design from one aspect: color (token coverage, unbound fills/strokes), layout (auto-layout quality, spacing consistency), components (detached instances, component health), accessibility (WCAG contrast incl. large-text thresholds, touch targets, minimum text sizes), tokens (hardcoded values that match an existing variable — each finding names the variable to bind; fix in one shot with manage_variables action:tokenize fix:true), or overall (runs color/layout/components/accessibility and returns a weighted 0-100 health score — good for audits and reports). Defaults to the current selection; tokens defaults to the current page.",
    {
      aspect: z.enum(["color", "layout", "components", "accessibility", "tokens", "overall"]),
      nodeId: z.string().optional().describe("Root node to analyze (default: current selection)"),
    },
    { readOnlyHint: true },
    async ({ aspect, nodeId }) => {
      if (aspect === "overall") {
        return runOverallAudit(aspectHandlers, nodeId);
      }
      if (aspect === "tokens") {
        return runTokenDrift(sendCommand, nodeId);
      }
      const handler = aspectHandlers.get(ASPECT_TOOL[aspect]);
      if (!handler) throw new Error(`Unknown aspect: ${aspect}`);
      return handler({ nodeId });
    }
  );
}

// Token drift is a report-only pass over scan_token_drift; the write path
// lives in manage_variables (action: tokenize) so this tool stays read-only.
async function runTokenDrift(
  sendCommand: SendCommandFn,
  nodeId?: string
): Promise<CallToolResult> {
  const data = (await sendCommand("scan_token_drift", { nodeId, fix: false }, 120000)) as {
    findings?: Array<{ variableName?: string }>;
    stats?: { nodesScanned?: number; matched?: number };
    note?: string;
  };
  const matched = data.stats?.matched ?? 0;
  return standardResult({
    summary:
      data.note ??
      (matched === 0
        ? `No token drift: nothing hardcoded matches an existing variable (${data.stats?.nodesScanned ?? 0} nodes scanned).`
        : `${matched} hardcoded value(s) match an existing variable and could be bound.`),
    data,
    warnings:
      matched > 0
        ? [
            {
              category: "general" as const,
              message: `${matched} value(s) drift from tokens they visually match`,
            },
          ]
        : [],
    recommended_next:
      matched > 0
        ? [
            {
              tool: "manage_variables",
              reason: 'Bind them in one pass: action "tokenize" with fix: true',
            },
          ]
        : [],
  });
}

// Runs all four aspect analyses and folds them into one weighted score.
// A failed aspect is excluded and the remaining weights renormalize.
async function runOverallAudit(
  aspectHandlers: Map<string, (args: { nodeId?: string }) => Promise<CallToolResult>>,
  nodeId?: string
): Promise<CallToolResult> {
  const parse = (result: CallToolResult): any => {
    try {
      const text = (result.content?.[0] as { text?: string })?.text ?? "";
      const parsed = JSON.parse(text);
      return parsed?.data ?? null;
    } catch {
      return null;
    }
  };

  const run = async (tool: string) => {
    const handler = aspectHandlers.get(tool);
    if (!handler) return null;
    try {
      return parse(await handler({ nodeId }));
    } catch {
      return null;
    }
  };

  const [color, layout, components, accessibility] = await Promise.all([
    run("analyze_color_usage"),
    run("analyze_layout_quality"),
    run("analyze_component_health"),
    run("analyze_accessibility"),
  ]);

  const inputs: HealthInputs = {
    color: color
      ? { tokenCoverage: color.tokenCoverage ?? 0, unboundCount: color.unboundCount ?? 0 }
      : null,
    layout: layout
      ? {
          autoLayoutCoverage: layout.autoLayoutCoverage ?? 0,
          issueCount: layout.issues?.length ?? 0,
        }
      : null,
    components: components
      ? {
          totalInstances: components.totalInstances ?? 0,
          detachedCount: components.detachedCount ?? 0,
        }
      : null,
    accessibility: accessibility ? { issueCount: accessibility.issueCount ?? 0 } : null,
  };

  const health = computeHealthScore(inputs);
  const excluded = (Object.keys(inputs) as Array<keyof HealthInputs>).filter((k) => !inputs[k]);

  const worst = [...health.categories].sort((a, b) => a.score - b.score)[0];
  return standardResult({
    summary: `Design health: ${health.score}/100 (grade ${health.grade}). Weakest area: ${worst ? `${worst.category} at ${worst.score}` : "n/a"}.`,
    data: {
      ...health,
      ...(excluded.length > 0 ? { excluded } : {}),
      details: { color, layout, components, accessibility },
    },
    warnings:
      health.grade === "A"
        ? []
        : health.categories
            .filter((c) => c.score < 75)
            .map((c) => ({
              category: "general" as const,
              message: `${c.category}: ${c.score}/100 — ${c.note}`,
            })),
    recommended_next: worst
      ? [
          {
            tool: "analyze_design",
            reason: `Drill into the weakest area with aspect: "${worst.category}"`,
          },
        ]
      : [],
  });
}

function registerAnalysisTools(server: McpServer, sendCommand: SendCommandFn): void {
  // ─── analyze_color_usage ────────────────────────────────────────
  server.tool(
    "analyze_color_usage",
    "Audit color consistency and design token coverage for a node tree. Reports which fill/stroke colors are not bound to variables. Use after get_selection_context to diagnose token gaps. Follow with bind_tokens to fix issues.",
    {
      nodeId: z.string().optional().describe("Root node to analyze (default: current selection)"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        // Resolve target node(s)
        let targetIds: string[];
        if (nodeId) {
          targetIds = [nodeId];
        } else {
          const selection = await sendCommand("get_selection") as any;
          if (!selection?.nodes?.length) return noSelectionError();
          targetIds = selection.nodes.map((n: any) => n.id);
        }

        const unboundColors: ColorUsageIssue[] = [];
        const counters = { totalProps: 0, boundCount: 0 };

        for (const id of targetIds) {
          const [nodeInfo, boundVars] = await Promise.all([
            sendCommand("get_node_info", { nodeId: id, depth: 2, maxNodes: 200 }) as Promise<any>,
            sendCommand("get_bound_variables", { nodeId: id }).catch(() => null) as Promise<any>,
          ]);
          if (!nodeInfo) continue;

          const bv = boundVars?.boundVariables || {};
          collectColorIssues(nodeInfo, bv, unboundColors, counters);

          // Also scan children (1 level deep for performance)
          if (nodeInfo.children) {
            for (const child of nodeInfo.children) {
              const childBv = await sendCommand("get_bound_variables", { nodeId: child.id }).catch(() => null) as any;
              const cbv = childBv?.boundVariables || {};
              collectColorIssues(child, cbv, unboundColors, counters);
            }
          }
        }

        const tokenCoverage =
          counters.totalProps > 0
            ? Math.round((counters.boundCount / counters.totalProps) * 100) / 100
            : 1;

        const data: ColorUsageData = {
          totalProperties: counters.totalProps,
          boundCount: counters.boundCount,
          unboundCount: unboundColors.length,
          tokenCoverage,
          unboundColors,
        };

        const warnings = unboundColors.length > 0
          ? [{ category: "tokens" as const, message: `${unboundColors.length} color(s) not bound to design tokens` }]
          : [];

        return standardResult({
          summary: `Color audit: ${unboundColors.length} unbound color(s) found. Token coverage: ${Math.round(data.tokenCoverage * 100)}%`,
          data,
          warnings,
          recommended_next: unboundColors.length > 0
            ? [
                { tool: "bind_tokens", reason: "Bind unbound colors to design tokens" },
                { tool: "get_design_tokens", reason: "See available tokens for binding" },
              ]
            : [
                { tool: "analyze_layout_quality", reason: "Check layout quality next" },
              ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── analyze_layout_quality ─────────────────────────────────────
  server.tool(
    "analyze_layout_quality",
    "Check layout quality: auto-layout usage, magic numbers in spacing/padding, and sizing consistency. Use after get_selection_context to find layout improvements. Follow with set_auto_layout to fix issues.",
    {
      nodeId: z.string().optional().describe("Root node to analyze (default: current selection)"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        let targetId: string;
        if (nodeId) {
          targetId = nodeId;
        } else {
          const selection = await sendCommand("get_selection") as any;
          if (!selection?.nodes?.length) return noSelectionError();
          targetId = selection.nodes[0].id;
        }

        const nodeInfo = await sendCommand("get_node_info", { nodeId: targetId, depth: 8, maxNodes: 500 }) as any;
        if (!nodeInfo) {
          return errorResult("invalid_input", `Node '${targetId}' not found`, { suggestion: "Use search_nodes", tool: "search_nodes" });
        }

        const issues: LayoutIssue[] = [];
        let totalFrames = 0;
        let autoLayoutCount = 0;

        analyzeLayoutNode(nodeInfo, issues, { totalFrames: 0, autoLayoutCount: 0 });

        // Count from issues to get proper totals
        const frameNodes = collectFrames(nodeInfo);
        totalFrames = frameNodes.length;
        autoLayoutCount = frameNodes.filter((f: any) => f.layoutMode && f.layoutMode !== "NONE").length;

        const data: LayoutQualityData = {
          totalFrames,
          autoLayoutCount,
          autoLayoutCoverage: totalFrames > 0 ? Math.round((autoLayoutCount / totalFrames) * 100) / 100 : 1,
          issues,
        };

        return standardResult({
          summary: `Layout audit: ${autoLayoutCount}/${totalFrames} frames use auto-layout (${Math.round(data.autoLayoutCoverage * 100)}%). ${issues.length} issue(s) found.`,
          data,
          warnings: issues.filter(i => i.severity === "warning").map(i => ({
            category: "layout" as const,
            message: i.issue,
            nodeId: i.nodeId,
          })),
          recommended_next: issues.length > 0
            ? [{ tool: "set_auto_layout", reason: "Fix layout issues on specific frames" }]
            : [{ tool: "analyze_color_usage", reason: "Check color token coverage next" }],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── analyze_component_health ───────────────────────────────────
  server.tool(
    "analyze_component_health",
    "Check component system health: detached instances, unused components, and override consistency. Use to audit design system adherence. Follow with create_component or update_instance to fix issues.",
    {
      nodeId: z.string().optional().describe("Scope to analyze (default: current page)"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        const [instances, components] = await Promise.all([
          sendCommand("scan_nodes_by_types", {
            types: ["INSTANCE"],
            parentId: nodeId,
          }, 120000) as Promise<any[]>,
          sendCommand("get_local_components") as Promise<any[]>,
        ]);

        const instanceList = Array.isArray(instances) ? instances : [];
        const componentList = Array.isArray(components) ? components : [];

        const issues: Array<{ nodeId: string; nodeName: string; issue: string }> = [];

        // Find detached-looking instances (no mainComponent reference)
        let detachedCount = 0;
        for (const inst of instanceList) {
          if (!inst.mainComponent && !inst.componentId) {
            detachedCount++;
            issues.push({
              nodeId: inst.id,
              nodeName: inst.name,
              issue: "Instance appears detached from its main component",
            });
          }
        }

        const data: ComponentHealthData = {
          totalComponents: componentList.length,
          totalInstances: instanceList.length,
          detachedCount,
          issues,
        };

        return standardResult({
          summary: `Components: ${componentList.length} defined, ${instanceList.length} instances, ${detachedCount} potentially detached`,
          data,
          recommended_next: [
            { tool: "get_design_tokens", reason: "Review design system completeness" },
            { tool: "search_nodes", reason: "Find specific components by name" },
          ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── analyze_accessibility ──────────────────────────────────────
  server.tool(
    "analyze_accessibility",
    "Check accessibility: text contrast ratios against backgrounds, touch target sizes. Use to ensure designs meet WCAG guidelines. Follow with update_node to fix contrast or sizing issues.",
    {
      nodeId: z.string().optional().describe("Root node to analyze (default: current selection)"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        let targetId: string;
        if (nodeId) {
          targetId = nodeId;
        } else {
          const selection = await sendCommand("get_selection") as any;
          if (!selection?.nodes?.length) return noSelectionError();
          targetId = selection.nodes[0].id;
        }

        const nodeInfo = await sendCommand("get_node_info", { nodeId: targetId, depth: 8, maxNodes: 500 }) as any;
        if (!nodeInfo) {
          return errorResult("invalid_input", `Node '${targetId}' not found`, { suggestion: "Use search_nodes", tool: "search_nodes" });
        }

        const issues: AccessibilityIssue[] = [];
        checkAccessibility(nodeInfo, null, issues);

        const data: AccessibilityData = {
          issueCount: issues.length,
          issues,
        };

        return standardResult({
          summary: `Accessibility: ${issues.length} issue(s) found`,
          data,
          warnings: issues.map(i => ({
            category: "accessibility" as const,
            message: i.issue,
            nodeId: i.nodeId,
          })),
          recommended_next: issues.length > 0
            ? [{ tool: "update_node", reason: "Fix accessibility issues" }]
            : [{ tool: "validate_design_rules", reason: "Run full design validation" }],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── diff_nodes ─────────────────────────────────────────────────
  const CHECKPOINT_KEY = "relai.checkpoint";
  server.tool(
    "diff_nodes",
    "Compare two nodes and list their differences (fills, strokes, size, layout, etc.), or audit changes over time with checkpoints: checkpoint:\"save\" snapshots nodeIdA's key properties; checkpoint:\"compare\" later diffs the current state against that snapshot — useful before/after an editing session to show the designer exactly what changed.",
    {
      nodeIdA: z.string().describe("First node ID (or the checkpoint target)"),
      nodeIdB: z.string().optional().describe("Second node ID (omit when using checkpoint)"),
      checkpoint: z.enum(["save", "compare"]).optional()
        .describe("save: snapshot nodeIdA now; compare: diff current vs saved snapshot"),
    },
    { readOnlyHint: true },
    async ({ nodeIdA, nodeIdB, checkpoint }) => {
      try {
        if (checkpoint === "save") {
          const node = (await sendCommand("get_node_info", { nodeId: nodeIdA, depth: 2 })) as any;
          if (!node) return errorResult("invalid_input", `Node '${nodeIdA}' not found`, { suggestion: "Check node ID", tool: "search_nodes" });
          const summary = normalizeNode(node);
          await sendCommand("set_plugin_data", {
            nodeId: nodeIdA,
            key: CHECKPOINT_KEY,
            value: JSON.stringify({ ts: Date.now(), name: node.name, summary }),
          });
          return standardResult({
            summary: `Checkpoint saved for '${node.name}' (${nodeIdA}). Run diff_nodes with checkpoint:"compare" after editing to see what changed.`,
            data: { nodeId: nodeIdA, saved: true },
            recommended_next: [],
          });
        }

        if (checkpoint === "compare") {
          const [node, stored] = await Promise.all([
            sendCommand("get_node_info", { nodeId: nodeIdA, depth: 2 }) as Promise<any>,
            sendCommand("get_plugin_data", { nodeId: nodeIdA, key: CHECKPOINT_KEY }) as Promise<any>,
          ]);
          if (!node) return errorResult("invalid_input", `Node '${nodeIdA}' not found`, { suggestion: "Check node ID", tool: "search_nodes" });
          const raw = typeof stored === "string" ? stored : stored?.value;
          if (!raw) {
            return errorResult("invalid_input", `No checkpoint saved on '${nodeIdA}'`, {
              suggestion: 'Save one first with checkpoint:"save"', tool: "diff_nodes",
            });
          }
          const saved = JSON.parse(raw);
          const before = saved.summary;
          const after = normalizeNode(node);

          const differences: NodeDiffField[] = [];
          if (before && after) {
            compareField(differences, "type", before.type, after.type);
            compareField(differences, "fill", before.fill, after.fill);
            compareField(differences, "stroke", before.stroke, after.stroke);
            compareField(differences, "cornerRadius", before.cornerRadius, after.cornerRadius);
            compareField(differences, "opacity", before.opacity, after.opacity);
            compareField(differences, "width", before.size?.width, after.size.width);
            compareField(differences, "height", before.size?.height, after.size.height);
            compareField(differences, "layout.mode", before.layout?.mode, after.layout?.mode);
            compareField(differences, "layout.gap", before.layout?.gap, after.layout?.gap);
            compareField(differences, "layout.padding", before.layout?.padding, after.layout?.padding);
          }
          const age = Math.round((Date.now() - (saved.ts ?? Date.now())) / 1000);
          return standardResult({
            summary: differences.length === 0
              ? `'${node.name}' is unchanged since the checkpoint ${age}s ago`
              : `${differences.length} propert${differences.length === 1 ? "y" : "ies"} changed on '${node.name}' since the checkpoint ${age}s ago`,
            data: {
              nodeId: nodeIdA,
              checkpointTs: saved.ts,
              identical: differences.length === 0,
              differences,
            },
            recommended_next: [],
          });
        }

        if (!nodeIdB) {
          return errorResult("invalid_input", "Provide nodeIdB, or use checkpoint:\"save\"/\"compare\" with nodeIdA alone", {
            suggestion: "Two-node diff needs both ids", tool: "diff_nodes",
          });
        }

        const [nodeA, nodeB] = await Promise.all([
          sendCommand("get_node_info", { nodeId: nodeIdA, depth: 2 }) as Promise<any>,
          sendCommand("get_node_info", { nodeId: nodeIdB, depth: 2 }) as Promise<any>,
        ]);

        if (!nodeA) return errorResult("invalid_input", `Node '${nodeIdA}' not found`, { suggestion: "Check node ID", tool: "search_nodes" });
        if (!nodeB) return errorResult("invalid_input", `Node '${nodeIdB}' not found`, { suggestion: "Check node ID", tool: "search_nodes" });

        const summaryA = normalizeNode(nodeA);
        const summaryB = normalizeNode(nodeB);

        const differences: NodeDiffField[] = [];
        if (summaryA && summaryB) {
          compareField(differences, "type", summaryA.type, summaryB.type);
          compareField(differences, "fill", summaryA.fill, summaryB.fill);
          compareField(differences, "stroke", summaryA.stroke, summaryB.stroke);
          compareField(differences, "cornerRadius", summaryA.cornerRadius, summaryB.cornerRadius);
          compareField(differences, "opacity", summaryA.opacity, summaryB.opacity);
          compareField(differences, "width", summaryA.size.width, summaryB.size.width);
          compareField(differences, "height", summaryA.size.height, summaryB.size.height);
          compareField(differences, "layout.mode", summaryA.layout?.mode, summaryB.layout?.mode);
          compareField(differences, "layout.gap", summaryA.layout?.gap, summaryB.layout?.gap);
          compareField(differences, "layout.padding", summaryA.layout?.padding, summaryB.layout?.padding);
        }

        const data: DiffNodesData = {
          nodeA: { id: nodeIdA, name: nodeA.name },
          nodeB: { id: nodeIdB, name: nodeB.name },
          identical: differences.length === 0,
          differences,
        };

        return standardResult({
          summary: differences.length === 0
            ? `'${nodeA.name}' and '${nodeB.name}' are identical in key properties`
            : `${differences.length} difference(s) between '${nodeA.name}' and '${nodeB.name}'`,
          data,
          recommended_next: differences.length > 0
            ? [{ tool: "update_node", reason: "Align properties between nodes" }]
            : [],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Diff failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

export function collectColorIssues(
  node: any,
  boundVars: Record<string, unknown>,
  issues: ColorUsageIssue[],
  counters: { totalProps: number; boundCount: number }
) {
  // Check fills (counted as one bindable property per node)
  if (node.fills?.length > 0) {
    const solidFills = node.fills.filter((f: any) => f.type === "SOLID" && f.visible !== false);
    if (solidFills.length > 0) {
      counters.totalProps++;
      const hasFillBinding = Object.keys(boundVars).some(k => k.startsWith("fills"));
      if (hasFillBinding) {
        counters.boundCount++;
      } else {
        for (const fill of solidFills) {
          if (!fill.color) continue;
          const color = typeof fill.color === "string" ? fill.color : rgbaToHex({
            r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.color.a ?? 1,
          });
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "fill",
            color,
          });
        }
      }
    }
  }

  // Check strokes (counted as one bindable property per node)
  if (node.strokes?.length > 0) {
    const solidStrokes = node.strokes.filter((s: any) => s.type === "SOLID" && s.visible !== false);
    if (solidStrokes.length > 0) {
      counters.totalProps++;
      const hasStrokeBinding = Object.keys(boundVars).some(k => k.startsWith("strokes"));
      if (hasStrokeBinding) {
        counters.boundCount++;
      } else {
        for (const stroke of solidStrokes) {
          if (!stroke.color) continue;
          const color = typeof stroke.color === "string" ? stroke.color : rgbaToHex({
            r: stroke.color.r, g: stroke.color.g, b: stroke.color.b, a: stroke.color.a ?? 1,
          });
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "stroke",
            color,
          });
        }
      }
    }
  }
}

function collectFrames(node: any): any[] {
  const frames: any[] = [];
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    frames.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      frames.push(...collectFrames(child));
    }
  }
  return frames;
}

function analyzeLayoutNode(node: any, issues: LayoutIssue[], _counters: { totalFrames: number; autoLayoutCount: number }) {
  if (node.type === "FRAME" || node.type === "COMPONENT") {
    if (!node.layoutMode || node.layoutMode === "NONE") {
      if (node.children?.length >= 2) {
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          issue: `Frame '${node.name}' has ${node.children.length} children but no auto-layout`,
          severity: "warning",
          suggestion: "Add auto-layout with set_auto_layout for responsive behavior",
        });
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      analyzeLayoutNode(child, issues, _counters);
    }
  }
}

function checkAccessibility(node: any, parentBg: any, issues: AccessibilityIssue[]) {
  // Check touch target sizes for interactive elements
  if (node.type === "INSTANCE" || node.name?.toLowerCase().includes("button")) {
    const w = node.width ?? node.absoluteBoundingBox?.width ?? 0;
    const h = node.height ?? node.absoluteBoundingBox?.height ?? 0;
    if ((w > 0 && w < 44) || (h > 0 && h < 44)) {
      issues.push({
        nodeId: node.id,
        nodeName: node.name,
        issue: `Touch target too small: ${Math.round(w)}×${Math.round(h)}px (minimum 44×44px)`,
      });
    }
  }

  if (node.type === "TEXT") {
    const fontSize = typeof node.fontSize === "number" ? node.fontSize : null;
    const fontWeight = typeof node.fontWeight === "number" ? node.fontWeight : 400;

    // Minimum readable size (common floor; WCAG has no hard px but <11 is trouble)
    if (fontSize !== null && fontSize < 11) {
      issues.push({
        nodeId: node.id,
        nodeName: node.name,
        issue: `Text size ${fontSize}px is below the 11px readability floor`,
      });
    }

    const textFill = node.fills?.find((f: any) => f.type === "SOLID" && f.visible !== false);
    if (textFill?.color && parentBg?.color) {
      if (parentBg.solid) {
        // WCAG 1.4.3: large text (≥24px, or ≥18.66px bold) needs 3:1; else 4.5:1.
        // Effective color accounts for fill and node opacity blended over the bg.
        const alpha =
          (textFill.opacity ?? 1) *
          (typeof node.opacity === "number" ? node.opacity : 1) *
          (textFill.color.a ?? 1);
        const effective = blendOver(textFill.color, parentBg.color, alpha);
        const isLarge =
          fontSize !== null && (fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700));
        const required = isLarge ? 3 : 4.5;
        const ratio = calculateContrastRatio(effective, parentBg.color);
        if (ratio < required) {
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            issue: `Low contrast ratio: ${ratio.toFixed(1)}:1 (minimum ${required}:1 for ${isLarge ? "large" : "body"} text${alpha < 1 ? ", opacity included" : ""})`,
            contrastRatio: Math.round(ratio * 10) / 10,
            requiredRatio: required,
          });
        }
      } else {
        // Text sits on an image/gradient — contrast can't be computed statically
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          issue: `Text sits on a ${parentBg.kind} background — contrast cannot be verified automatically; check manually or add a solid scrim`,
        });
      }
    }
  }

  // Track the nearest background for children: solid color when available,
  // otherwise remember that it's an image/gradient so contrast is flagged
  let bg = parentBg;
  if (node.type !== "TEXT" && node.fills?.length > 0) {
    const visible = node.fills.filter((f: any) => f.visible !== false);
    const solid = visible.find((f: any) => f.type === "SOLID");
    const nonSolid = visible.find((f: any) => f.type !== "SOLID");
    if (nonSolid) {
      const type = String(nonSolid.type ?? "IMAGE");
      bg = {
        color: solid?.color ?? { r: 0.5, g: 0.5, b: 0.5 },
        solid: false,
        kind: type.startsWith("GRADIENT") ? "gradient" : type.toLowerCase(),
      };
    } else if (solid?.color) {
      bg = { color: solid.color, solid: true, kind: "solid" };
    }
  }

  if (node.children) {
    for (const child of node.children) {
      checkAccessibility(child, bg, issues);
    }
  }
}

// Alpha-composite fg over bg (both 0-1 RGB)
function blendOver(fg: any, bg: any, alpha: number): { r: number; g: number; b: number } {
  const a = Math.max(0, Math.min(1, alpha));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

function calculateContrastRatio(fg: any, bg: any): number {
  const fgL = relativeLuminance(fg.r ?? 0, fg.g ?? 0, fg.b ?? 0);
  const bgL = relativeLuminance(bg.r ?? 0, bg.g ?? 0, bg.b ?? 0);
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(r: number, g: number, b: number): number {
  // r, g, b are in 0-1 range (Figma format)
  const rL = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gL = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bL = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
}

function compareField(diffs: NodeDiffField[], field: string, a: unknown, b: unknown) {
  if (a !== b) {
    diffs.push({ field, nodeA: a, nodeB: b });
  }
}
