import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { standardResult } from "../../semantic/response.js";
import { errorResult, noSelectionError } from "../../semantic/errors.js";
import { normalizeNode, normalizeNodes, calculateTokenCoverage } from "../../semantic/normalize.js";
import type {
  DocumentOverviewData,
  SelectionContextData,
  NodeDetailsData,
  SearchNodesData,
  DesignTokensData,
} from "@figma-relai/shared";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  // ─── get_document_overview ───────────────────────────────────────
  server.tool(
    "get_document_overview",
    "Get the full document structure: pages, component/style/variable counts. Always call this first to understand the file. Follow with get_selection_context or search_nodes.",
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const [docInfo, collections, styles, conventions] = await Promise.all([
          sendCommand("get_document_info") as Promise<any>,
          sendCommand("get_variable_collections") as Promise<any[]>,
          sendCommand("get_styles") as Promise<any[]>,
          // Older plugin builds don't have the handler — degrade quietly
          sendCommand("get_conventions", {}).catch(() => null) as Promise<any>,
        ]);

        // get_local_components can be slow, just count from doc info
        const componentCount = docInfo.componentCount ?? 0;

        const stylesByType = { paint: 0, text: 0, effect: 0, grid: 0 };
        if (Array.isArray(styles)) {
          for (const s of styles) {
            const t = (s.type || "").toLowerCase();
            if (t === "paint") stylesByType.paint++;
            else if (t === "text") stylesByType.text++;
            else if (t === "effect") stylesByType.effect++;
            else if (t === "grid") stylesByType.grid++;
          }
        }

        const data: DocumentOverviewData = {
          name: docInfo.name,
          currentPage: docInfo.currentPage,
          pages: docInfo.pages || [],
          counts: {
            components: componentCount,
            styles: Array.isArray(styles) ? styles.length : 0,
            variableCollections: Array.isArray(collections) ? collections.length : 0,
          },
        };

        // File conventions are standing designer instructions — surface them
        // where every session starts so they cannot be missed
        const conventionsText: string | null = conventions?.content ?? null;

        return standardResult({
          summary:
            `"${data.name}" — ${data.pages.length} pages, ${data.counts.components} components, ${data.counts.styles} styles, ${data.counts.variableCollections} variable collections` +
            (conventionsText ? ". This file has conventions — follow them (see data.conventions)." : ""),
          data: { ...data, ...(conventionsText ? { conventions: conventionsText } : {}) },
          recommended_next: [
            { tool: "get_selection_context", reason: "Inspect currently selected nodes" },
            { tool: "search_nodes", reason: "Find specific nodes by name or type" },
            { tool: "get_design_tokens", reason: "Explore the design token system" },
          ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Failed to get document info: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected. Call join_room first.", tool: "join_room" }
        );
      }
    }
  );

  // ─── get_selection_context ──────────────────────────────────────
  server.tool(
    "get_selection_context",
    "Get full context for the current Figma selection: node properties, fills, layout, token bindings, and children summary. Use as the starting point for any inspection or modification workflow. Follow with analyze_* tools or update_node.",
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const selection = await sendCommand("get_selection") as any;
        if (!selection?.nodes?.length) {
          return noSelectionError();
        }

        const nodeIds = selection.nodes.map((n: any) => n.id);

        // Fetch detailed info and variable bindings in parallel
        const [nodesInfo, ...bindings] = await Promise.all([
          sendCommand("get_nodes_info", { nodeIds, depth: 2 }) as Promise<any[]>,
          ...nodeIds.map((id: string) =>
            sendCommand("get_bound_variables", { nodeId: id }).catch(() => null) as Promise<any>
          ),
        ]);

        const nodes = (Array.isArray(nodesInfo) ? nodesInfo : []).map((raw: any, i: number) => {
          const summary = normalizeNode(raw);
          if (!summary) return null;

          const boundVars = bindings[i]?.boundVariables || null;
          summary.tokenCoverage = calculateTokenCoverage(raw, boundVars);
          if (boundVars) {
            summary.fillToken = extractTokenName(boundVars, "fills");
            summary.strokeToken = extractTokenName(boundVars, "strokes");
          }
          return summary;
        }).filter(Boolean);

        const data: SelectionContextData = {
          nodes: nodes as any[],
          pageInfo: selection.currentPage || { id: "", name: "" },
        };

        const avgCoverage = nodes.length > 0
          ? Math.round(nodes.reduce((sum: number, n: any) => sum + (n.tokenCoverage || 0), 0) / nodes.length * 100)
          : 0;

        const warnings = [];
        if (avgCoverage < 50) {
          warnings.push({
            category: "tokens" as const,
            message: `Token coverage is ${avgCoverage}% — many properties are not bound to design variables`,
          });
        }

        return standardResult({
          summary: `Selected ${nodes.length} node(s): ${nodes.map((n: any) => `'${n.name}' (${n.type})`).join(", ")}. Token coverage: ${avgCoverage}%`,
          data,
          warnings,
          recommended_next: [
            { tool: "analyze_color_usage", reason: "Audit color consistency and token coverage" },
            { tool: "update_node", reason: "Modify selected node properties" },
            { tool: "screenshot", reason: "Visually inspect the selection" },
          ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Failed to get selection: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── get_node_details ───────────────────────────────────────────
  server.tool(
    "get_node_details",
    "Get a single node's full properties, CSS, token bindings, and children. Use after search_nodes or get_selection_context to inspect a specific node. Follow with update_node or analyze_* tools.",
    {
      nodeId: z.string().describe("The node ID to inspect"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        const [nodeInfo, boundVars, css] = await Promise.all([
          sendCommand("get_node_info", { nodeId, depth: 2 }) as Promise<any>,
          sendCommand("get_bound_variables", { nodeId }).catch(() => null) as Promise<any>,
          sendCommand("get_css", { nodeId }).catch(() => null) as Promise<any>,
        ]);

        if (!nodeInfo) {
          return errorResult(
            "invalid_input",
            `Node '${nodeId}' not found`,
            { suggestion: "Use search_nodes to find the correct node ID", tool: "search_nodes" }
          );
        }

        const node = normalizeNode(nodeInfo);
        if (!node) {
          return errorResult(
            "invalid_input",
            `Could not process node '${nodeId}'`,
            { suggestion: "Try get_node_info directly for raw data", tool: "get_node_info" }
          );
        }

        const bv = boundVars?.boundVariables || null;
        node.tokenCoverage = calculateTokenCoverage(nodeInfo, bv);
        if (bv) {
          node.fillToken = extractTokenName(bv, "fills");
          node.strokeToken = extractTokenName(bv, "strokes");
        }

        const children = nodeInfo.children
          ? normalizeNodes(nodeInfo.children)
          : undefined;

        const data: NodeDetailsData = {
          node,
          css: css?.css,
          boundVariables: bv || undefined,
          children,
        };

        return standardResult({
          summary: `'${node.name}' (${node.type}, ${node.size.width}×${node.size.height}). Token coverage: ${Math.round((node.tokenCoverage || 0) * 100)}%`,
          data,
          recommended_next: [
            { tool: "update_node", reason: "Modify this node's properties", args: { nodeId } },
            { tool: "analyze_color_usage", reason: "Check color token usage", args: { nodeId } },
          ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Failed to get node details: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── search_nodes ───────────────────────────────────────────────
  server.tool(
    "search_nodes",
    "Search for nodes by name and/or type within a scope. Returns matching node IDs, names, and types. Use to find specific elements before inspecting or modifying them. Follow with get_node_details or update_node.",
    {
      query: z.string().optional().describe("Name substring to search for"),
      types: z.array(z.string()).optional().describe("Node types to filter: FRAME, TEXT, COMPONENT, INSTANCE, RECTANGLE, etc."),
      parentId: z.string().optional().describe("Scope search to children of this node (default: current page)"),
    },
    { readOnlyHint: true },
    async ({ query, types, parentId }) => {
      try {
        const result = await sendCommand("find_nodes", {
          name: query,
          types,
          parentId,
        }) as any[];

        const matches = (Array.isArray(result) ? result : []).map((n: any) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          parentName: n.parent?.name,
        }));

        const data: SearchNodesData = {
          matches,
          total: matches.length,
        };

        return standardResult({
          summary: `Found ${matches.length} node(s)${query ? ` matching '${query}'` : ""}${types?.length ? ` of type ${types.join("/")}` : ""}`,
          data,
          recommended_next: matches.length > 0
            ? [
                { tool: "get_node_details", reason: "Inspect a specific node", args: { nodeId: matches[0].id } },
                { tool: "navigate_to", reason: "Focus on a found node", args: { nodeId: matches[0].id } },
              ]
            : [
                { tool: "get_document_overview", reason: "Check document structure" },
              ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── get_design_tokens ──────────────────────────────────────────
  server.tool(
    "get_design_tokens",
    "Get an overview of the design token system: variable collections, modes, variable counts, and style counts. Use to understand the design system before binding tokens or creating new variables. Follow with manage_variables or bind_tokens.",
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const [collections, styles] = await Promise.all([
          sendCommand("get_variable_collections") as Promise<any[]>,
          sendCommand("get_styles") as Promise<any[]>,
        ]);

        const collectionSummaries = (Array.isArray(collections) ? collections : []).map((c: any) => ({
          id: c.id,
          name: c.name,
          modes: Array.isArray(c.modes) ? c.modes : [],
          variableCount: Array.isArray(c.variableIds) ? c.variableIds.length : 0,
        }));

        const stylesByType = { paint: 0, text: 0, effect: 0, grid: 0 };
        if (Array.isArray(styles)) {
          for (const s of styles) {
            const t = (s.type || "").toLowerCase();
            if (t in stylesByType) (stylesByType as any)[t]++;
          }
        }

        const totalVars = collectionSummaries.reduce((sum, c) => sum + c.variableCount, 0);

        const data: DesignTokensData = {
          collections: collectionSummaries,
          styles: stylesByType,
        };

        return standardResult({
          summary: `${collectionSummaries.length} collection(s) with ${totalVars} variables. Styles: ${stylesByType.paint} paint, ${stylesByType.text} text, ${stylesByType.effect} effect, ${stylesByType.grid} grid`,
          data,
          recommended_next: [
            { tool: "manage_variables", reason: "Create or update design tokens" },
            { tool: "analyze_color_usage", reason: "Check token coverage on selected nodes" },
          ],
        });
      } catch (error) {
        return errorResult(
          "connection_error",
          `Failed to get design tokens: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );

  // ─── screenshot ─────────────────────────────────────────────────
  server.tool(
    "screenshot",
    "Take a PNG screenshot of a node or the current view. Returns an image visible to the AI. Use to visually verify changes or inspect design details. Works for both context inspection and verification after modifications.",
    {
      nodeId: z.string().optional().describe("Node ID to screenshot (default: current view)"),
    },
    { readOnlyHint: true },
    async ({ nodeId }) => {
      try {
        const result = await sendCommand("get_screenshot", nodeId ? { nodeId } : {}) as any;

        // get_screenshot returns image data — pass through as-is for image content type
        if (result?.imageData) {
          return {
            content: [
              {
                type: "image" as const,
                data: result.imageData,
                mimeType: "image/png",
              },
              {
                type: "text" as const,
                text: JSON.stringify({
                  summary: `Screenshot taken${nodeId ? ` of node ${nodeId}` : " of current view"}`,
                  recommended_next: [
                    { tool: "get_selection_context", reason: "Get structured data about the selection" },
                    { tool: "update_node", reason: "Make changes based on what you see" },
                  ],
                }),
              },
            ],
          };
        }

        // Fallback: result might be in a different format
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return errorResult(
          "connection_error",
          `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
          { suggestion: "Ensure Figma plugin is connected", tool: "join_room" }
        );
      }
    }
  );
}

// Extract token/variable name from bound variables
function extractTokenName(boundVars: Record<string, unknown>, prefix: string): string | null {
  for (const [key, value] of Object.entries(boundVars)) {
    if (key.startsWith(prefix) || key === prefix) {
      if (value && typeof value === "object" && "name" in (value as any)) {
        return (value as any).name;
      }
      if (typeof value === "string") return value;
    }
  }
  return null;
}
