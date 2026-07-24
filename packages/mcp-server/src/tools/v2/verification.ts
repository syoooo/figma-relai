import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { standardResult } from "../../semantic/response.js";
import { errorResult, noSelectionError } from "../../semantic/errors.js";
import { normalizeNode, calculateTokenCoverage } from "../../semantic/normalize.js";
import type {
  VerifyChangesData,
  ValidateDesignRulesData,
  DesignRuleResult,
} from "@figma-relai/shared";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  // ─── verify_changes ─────────────────────────────────────────────
  server.tool(
    "verify_changes",
    "Verify that a node's current properties match expected values. Use after update_node, set_auto_layout, or batch_execute to confirm changes applied correctly. Returns match/mismatch for each checked field.",
    {
      nodeId: z.string().describe("Node ID to verify"),
      expected: z.record(z.string(), z.unknown()).describe("Expected property values, e.g. { fill: '#3B82F6', cornerRadius: 8 }"),
    },
    { readOnlyHint: true },
    async ({ nodeId, expected }) => {
      try {
        const nodeInfo = await sendCommand("get_node_info", { nodeId, depth: 2 }) as any;
        if (!nodeInfo) {
          return errorResult(
            "invalid_input",
            `Node '${nodeId}' not found — it may have been deleted`,
            { suggestion: "Use search_nodes to find the node", tool: "search_nodes" }
          );
        }

        const normalized = normalizeNode(nodeInfo);
        if (!normalized) {
          return errorResult(
            "invalid_input",
            `Could not normalize node '${nodeId}'`,
            { suggestion: "Try get_node_details for raw data", tool: "get_node_details", args: { nodeId } }
          );
        }

        const fields: VerifyChangesData["fields"] = [];
        for (const [key, expectedValue] of Object.entries(expected)) {
          const actual = getNestedValue(normalized, nodeInfo, key);
          const match = deepEqual(actual, expectedValue);
          fields.push({ field: key, expected: expectedValue, actual, match });
        }

        const allMatch = fields.every(f => f.match);

        const data: VerifyChangesData = {
          nodeId,
          allMatch,
          fields,
        };

        return standardResult({
          summary: allMatch
            ? `All ${fields.length} checked properties match expected values`
            : `${fields.filter(f => !f.match).length} of ${fields.length} properties don't match expected values`,
          data,
          recommended_next: allMatch
            ? [{ tool: "screenshot", reason: "Visually confirm the changes" }]
            : [{ tool: "update_node", reason: "Re-apply changes that didn't match", args: { nodeId } }],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── validate_design_rules ──────────────────────────────────────
  server.tool(
    "validate_design_rules",
    "Run design quality rules on a node: token coverage, auto-layout usage, naming conventions, and accessibility basics. Use after modifications or during design audits. Returns pass/fail for each rule with fix suggestions.",
    {
      nodeId: z.string().optional().describe("Root node to validate (default: current selection)"),
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

        const [nodeInfo, boundVars] = await Promise.all([
          sendCommand("get_node_info", { nodeId: targetId, depth: 2 }) as Promise<any>,
          sendCommand("get_bound_variables", { nodeId: targetId }).catch(() => null) as Promise<any>,
        ]);

        if (!nodeInfo) {
          return errorResult("invalid_input", `Node '${targetId}' not found`, { suggestion: "Use search_nodes", tool: "search_nodes" });
        }

        const bv = boundVars?.boundVariables || {};
        const results: DesignRuleResult[] = [];

        // Rule 1: Token coverage — deep plugin-side walk when available; the
        // legacy shallow calculation reported 100% on component sets whose
        // variants were unbound (their own root has no paints to inspect).
        let coverage: number;
        let coverageDetail = "";
        try {
          const audit = await sendCommand("audit_colors", { nodeId: targetId }, 60000) as any;
          if (typeof audit?.totalProperties !== "number") throw new Error("no audit");
          coverage = audit.totalProperties > 0 ? audit.boundCount / audit.totalProperties : 1;
          coverageDetail = ` (${audit.boundCount}/${audit.totalProperties} paint props across ${audit.scanned} nodes${audit.hiddenCount ? `, ${audit.hiddenCount} hidden unbound` : ""})`;
        } catch {
          coverage = calculateTokenCoverage(nodeInfo, bv);
          coverageDetail = " (shallow — old plugin build)";
        }
        results.push({
          rule: "token_coverage",
          passed: coverage >= 0.8,
          severity: coverage >= 0.5 ? "warning" : "error",
          message: `Token coverage: ${Math.round(coverage * 100)}%${coverageDetail} (target: 80%+)`,
          nodeId: targetId,
          fix: coverage < 0.8
            ? { tool: "bind_tokens", reason: "Bind unbound properties to design tokens", args: { nodeId: targetId } }
            : undefined,
        });

        // Rule 2: Auto-layout usage
        if (nodeInfo.type === "FRAME" || nodeInfo.type === "COMPONENT") {
          const hasAutoLayout = nodeInfo.layoutMode && nodeInfo.layoutMode !== "NONE";
          const hasChildren = nodeInfo.children?.length >= 2;
          results.push({
            rule: "auto_layout",
            passed: hasAutoLayout || !hasChildren,
            severity: "warning",
            message: hasAutoLayout
              ? `Auto-layout: ${nodeInfo.layoutMode}`
              : hasChildren
                ? `No auto-layout on frame with ${nodeInfo.children.length} children`
                : "No children requiring auto-layout",
            nodeId: targetId,
            fix: !hasAutoLayout && hasChildren
              ? { tool: "set_auto_layout", reason: "Add auto-layout for responsive behavior", args: { nodeId: targetId } }
              : undefined,
          });
        }

        // Rule 3: Naming convention (no default names)
        const hasDefaultName = /^(Frame|Rectangle|Ellipse|Group|Text|Vector|Line|Polygon|Star)\s*\d*$/.test(nodeInfo.name);
        results.push({
          rule: "naming_convention",
          passed: !hasDefaultName,
          severity: "info",
          message: hasDefaultName
            ? `'${nodeInfo.name}' uses a default Figma name — rename for clarity`
            : `Name '${nodeInfo.name}' looks intentional`,
          nodeId: targetId,
          fix: hasDefaultName
            ? { tool: "update_node", reason: "Rename with a semantic name", args: { nodeId: targetId } }
            : undefined,
        });

        // Rule 4: Touch target minimum size (for interactive elements)
        if (nodeInfo.type === "INSTANCE" || nodeInfo.name?.toLowerCase().includes("button")) {
          const w = nodeInfo.width ?? 0;
          const h = nodeInfo.height ?? 0;
          const adequate = w >= 44 && h >= 44;
          results.push({
            rule: "touch_target_size",
            passed: adequate,
            severity: "warning",
            message: adequate
              ? `Touch target: ${Math.round(w)}×${Math.round(h)}px (OK)`
              : `Touch target: ${Math.round(w)}×${Math.round(h)}px (minimum 44×44px)`,
            nodeId: targetId,
            fix: !adequate
              ? { tool: "update_node", reason: "Increase size to meet touch target minimum", args: { nodeId: targetId } }
              : undefined,
          });
        }

        // Rule 5: Orphaned instances (main component deleted — the instance
        // survives on a detached internal copy and silently stops updating)
        try {
          const orph = await sendCommand("find_orphan_instances", { nodeId: targetId }, 60000) as any;
          if (orph && typeof orph.scanned === "number") {
            const found: any[] = orph.orphans ?? [];
            results.push({
              rule: "orphaned_instances",
              passed: found.length === 0,
              severity: "warning",
              message: found.length
                ? `${found.length} instance(s) reference deleted components (of ${orph.scanned} scanned): ${found.slice(0, 3).map((o: any) => o.name).join(", ")}${found.length > 3 ? "…" : ""}`
                : `No orphaned instances (${orph.scanned} scanned)`,
              nodeId: targetId,
              fix: found.length
                ? { tool: "manage_components", reason: "Re-instantiate from a living component, or detach deliberately", args: { action: "list" } }
                : undefined,
            });
          }
        } catch {
          // plugin build without the handler — rule silently absent
        }

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        const data: ValidateDesignRulesData = {
          rulesChecked: results.length,
          passed,
          failed,
          results,
        };

        return standardResult({
          summary: `Design validation: ${passed}/${results.length} rules passed, ${failed} failed`,
          data,
          recommended_next: failed > 0
            ? results.filter(r => !r.passed && r.fix).map(r => r.fix!).slice(0, 3)
            : [{ tool: "screenshot", reason: "Visually confirm the design quality" }],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── verify_visual ──────────────────────────────────────────────
  server.tool(
    "verify_visual",
    "The write→see→assert loop in one call: screenshots a node AND (optionally) checks expected property values. Returns the image plus structured pass/fail. Use after visual edits instead of separate screenshot + verify_changes calls.",
    {
      nodeId: z.string().describe("Node to verify"),
      expected: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Expected property values, e.g. { cornerRadius: 8, width: 320 }"),
    },
    { readOnlyHint: true },
    async ({ nodeId, expected }) => {
      try {
        const [shot, nodeInfo] = await Promise.all([
          sendCommand("get_screenshot", { nodeId }, 60000) as Promise<{
            imageData?: string;
            mimeType?: string;
          }>,
          expected
            ? (sendCommand("get_node_info", { nodeId, depth: 2 }) as Promise<unknown>)
            : Promise.resolve(null),
        ]);

        const content: Array<
          | { type: "image"; data: string; mimeType: string }
          | { type: "text"; text: string }
        > = [];
        if (shot?.imageData) {
          content.push({
            type: "image",
            data: shot.imageData,
            mimeType: shot.mimeType ?? "image/png",
          });
        }

        if (expected && nodeInfo) {
          const normalized = normalizeNode(nodeInfo) ?? {};
          const fields = Object.entries(expected).map(([key, expectedValue]) => {
            const actual = getNestedValue(normalized, nodeInfo, key);
            return { field: key, expected: expectedValue, actual, match: deepEqual(actual, expectedValue) };
          });
          const failing = fields.filter((f) => !f.match);
          content.push({
            type: "text",
            text: JSON.stringify(
              {
                summary:
                  failing.length === 0
                    ? `All ${fields.length} checked properties match — confirm the screenshot looks right`
                    : `${failing.length}/${fields.length} properties do NOT match`,
                fields,
              },
              null,
              2
            ),
          });
        } else if (!shot?.imageData) {
          content.push({ type: "text", text: "Screenshot unavailable for this node." });
        }

        return { content };
      } catch (error) {
        return errorResult(
          "connection_error",
          `Visual verification failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function getNestedValue(normalized: any, raw: any, key: string): unknown {
  // Check normalized summary first
  if (key in normalized) return normalized[key];
  // Check common nested paths
  if (key === "width") return normalized.size?.width;
  if (key === "height") return normalized.size?.height;
  if (key === "x") return normalized.position?.x;
  if (key === "y") return normalized.position?.y;
  // Fallback to raw node data
  return raw[key];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.01; // Float tolerance
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
