import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { booleanOperationSchema, reorderDirectionSchema } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "edit_structure",
    "Structural operations on nodes: group/ungroup, reparent (move into another parent), reorder (z-order), clone, flatten to vector, boolean operations (union/subtract/intersect/exclude), delete. group/boolean/delete take nodeIds; the rest take nodeId.",
    {
      operation: z.enum([
        "group",
        "ungroup",
        "reparent",
        "reorder",
        "clone",
        "flatten",
        "boolean",
        "delete",
      ]),
      nodeId: z.string().optional().describe("Target node (ungroup/reparent/reorder/clone/flatten)"),
      nodeIds: z.array(z.string()).optional().describe("Target nodes (group/boolean/delete)"),
      parentId: z.string().optional().describe("reparent: new parent"),
      index: z.number().int().min(0).optional().describe("reparent: insertion index"),
      direction: reorderDirectionSchema.optional().describe("reorder direction"),
      booleanOperation: booleanOperationSchema.optional().describe("boolean: which operation"),
      x: z.number().optional().describe("clone: position of the copy"),
      y: z.number().optional(),
    },
    async ({ operation, nodeId, nodeIds, parentId, index, direction, booleanOperation, x, y }) => {
      try {
        const need = (value: unknown, what: string) => {
          if (value === undefined) throw new Error(`"${operation}" requires ${what}`);
        };
        let result: unknown;
        switch (operation) {
          case "group":
            need(nodeIds, "nodeIds");
            result = await sendCommand("group_nodes", { nodeIds });
            break;
          case "ungroup":
            need(nodeId, "nodeId");
            result = await sendCommand("ungroup_nodes", { nodeId });
            break;
          case "reparent":
            need(nodeId, "nodeId");
            need(parentId, "parentId");
            result = await sendCommand("reparent_node", { nodeId, parentId, index });
            break;
          case "reorder":
            need(nodeId, "nodeId");
            need(direction, "direction");
            result = await sendCommand("reorder_node", { nodeId, direction });
            break;
          case "clone":
            need(nodeId, "nodeId");
            result = await sendCommand("clone_node", { nodeId, x, y });
            break;
          case "flatten":
            need(nodeId, "nodeId");
            result = await sendCommand("flatten_node", { nodeId });
            break;
          case "boolean":
            need(nodeIds, "nodeIds");
            need(booleanOperation, "booleanOperation");
            result = await sendCommand("boolean_operation", {
              nodeIds,
              operation: booleanOperation,
            });
            break;
          case "delete":
            if (nodeIds) result = await sendCommand("delete_multiple_nodes", { nodeIds });
            else {
              need(nodeId, "nodeId or nodeIds");
              result = await sendCommand("delete_node", { nodeId });
            }
            break;
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
