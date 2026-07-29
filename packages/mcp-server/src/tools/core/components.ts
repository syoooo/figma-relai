import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_components",
    "Component workflow: list local components, create a component from a node, create_set (combine components as variants), instantiate (place an instance by componentKey OR by the node id of a local component — an unpublished component has no importable key, so the id is the way), add_property / bind_property (declare a TEXT/BOOLEAN/INSTANCE_SWAP property on a SET — never on a single variant — then point a layer's characters/visible at it, in every variant at once with layerName), get_props / set_props (component properties on an instance; get_props on a variant answers with its set's definitions), get_overrides / set_overrides (copy overrides from a source instance to targets), reset_instance (clear ALL overrides so the instance re-inherits its main component — returns property snapshots before/after so you can re-apply what mattered), detach.",
    {
      action: z.enum([
        "list",
        "create",
        "create_set",
        "instantiate",
        "get_props",
        "set_props",
        "get_overrides",
        "set_overrides",
        "reset_instance",
        "detach",
        "add_property",
        "bind_property",
      ]),
      nodeId: z.string().optional().describe("Target node (create/get_props/set_props/reset_instance/detach)"),
      componentIds: z.array(z.string()).optional().describe("create_set: components to combine"),
      componentKey: z.string().optional().describe("instantiate: component key (or node id)"),
      x: z.number().optional().describe("instantiate: position"),
      y: z.number().optional(),
      properties: z
        .record(z.union([z.string(), z.boolean()]))
        .optional()
        .describe("set_props: property name → value (variant/text/boolean/swap)"),
      sourceInstanceId: z.string().optional().describe("set_overrides: copy from this instance"),
      targetNodeIds: z.array(z.string()).optional().describe("set_overrides: apply to these"),
      instanceNodeId: z.string().optional().describe("get_overrides: instance to inspect"),
      propertyName: z.string().optional().describe("add_property: the name designers will see (e.g. hasLabel, text)"),
      propertyType: z
        .enum(["TEXT", "BOOLEAN", "INSTANCE_SWAP"])
        .optional()
        .describe("add_property: VARIANT axes come from variant names, so they are not addable here"),
      defaultValue: z.union([z.string(), z.boolean()]).optional().describe("add_property: the value a fresh instance starts with"),
      propertyKey: z.string().optional().describe("bind_property: the key add_property returned (name#id)"),
      field: z
        .enum(["characters", "visible", "mainComponent"])
        .optional()
        .describe("bind_property: which part of the layer the property drives — text, show/hide, or which component sits in a swap slot"),
      layerName: z.string().optional().describe("bind_property: bind this layer in EVERY variant of the set at once"),
    },
    async (args) => {
      try {
        let result: unknown;
        switch (args.action) {
          case "list":
            result = await sendCommand("get_local_components", {}, 60000);
            break;
          case "create":
            result = await sendCommand("create_component_from_node", { nodeId: args.nodeId });
            break;
          case "create_set":
            result = await sendCommand("create_component_set", { componentIds: args.componentIds });
            break;
          case "instantiate":
            result = await sendCommand("create_component_instance", {
              componentKey: args.componentKey,
              x: args.x,
              y: args.y,
            });
            break;
          case "get_props":
            result = await sendCommand("get_component_properties", { nodeId: args.nodeId });
            break;
          case "set_props":
            result = await sendCommand("set_component_properties", {
              nodeId: args.nodeId,
              properties: args.properties,
            });
            break;
          case "add_property":
            result = await sendCommand("add_component_property", {
              nodeId: args.nodeId,
              propertyName: args.propertyName,
              propertyType: args.propertyType,
              defaultValue: args.defaultValue,
            });
            break;
          case "bind_property":
            result = await sendCommand("bind_component_property", {
              nodeId: args.nodeId,
              propertyKey: args.propertyKey,
              field: args.field,
              layerName: args.layerName,
            });
            break;
          case "get_overrides":
            result = await sendCommand("get_instance_overrides", {
              instanceNodeId: args.instanceNodeId ?? args.nodeId,
            });
            break;
          case "set_overrides":
            result = await sendCommand("set_instance_overrides", {
              sourceInstanceId: args.sourceInstanceId,
              targetNodeIds: args.targetNodeIds,
            });
            break;
          case "reset_instance":
            result = await sendCommand("reset_instance", { nodeId: args.nodeId });
            break;
          case "detach":
            result = await sendCommand("detach_instance", { nodeId: args.nodeId });
            break;
        }
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
