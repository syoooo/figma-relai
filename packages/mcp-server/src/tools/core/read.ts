import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "get_node_data",
    "Raw node data at a chosen detail level: summary (shallow), tree (sparse structure for orientation), full (deeper serialization), css (CSS representation), variables (bound variable ids). For human-oriented summaries prefer get_node_details / get_selection_context.",
    {
      nodeIds: z.array(z.string()).min(1).describe("One or more node ids"),
      detail: z.enum(["summary", "tree", "full", "css", "variables"]).optional()
        .describe("Default summary"),
      depth: z.number().int().min(0).optional().describe("Override serialization depth"),
      maxNodes: z.number().int().positive().optional().describe("Override node budget"),
    },
    { readOnlyHint: true },
    async ({ nodeIds, detail = "summary", depth, maxNodes }) => {
      try {
        if (detail === "css" || detail === "variables") {
          const command = detail === "css" ? "get_css" : "get_bound_variables";
          const results = [];
          for (const nodeId of nodeIds) {
            results.push({ nodeId, data: await sendCommand(command, { nodeId }) });
          }
          return jsonResult(nodeIds.length === 1 ? results[0].data : results);
        }
        if (detail === "tree") {
          const results = [];
          for (const nodeId of nodeIds) {
            results.push(await sendCommand("get_node_tree", { nodeId, depth, maxNodes }));
          }
          return jsonResult(nodeIds.length === 1 ? results[0] : results);
        }
        if (nodeIds.length > 1) {
          const result = await sendCommand("get_nodes_info", { nodeIds });
          return jsonResult(result);
        }
        const result = await sendCommand("get_node_info", {
          nodeId: nodeIds[0],
          depth: depth ?? (detail === "full" ? 4 : 1),
          maxNodes,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
