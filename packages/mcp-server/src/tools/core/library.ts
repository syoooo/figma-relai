import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "import_from_library",
    "Import a component, style, or variable from an enabled team library by its key. Component keys come from the design system or get_local_components; imported components can then be instantiated with manage_components.",
    {
      kind: z.enum(["component", "style", "variable"]),
      key: z.string().describe("Library key"),
    },
    async ({ kind, key }) => {
      try {
        const command =
          kind === "component"
            ? "import_component_by_key"
            : kind === "style"
              ? "import_style_by_key"
              : "import_variable_by_key";
        const result = await sendCommand(command, { key }, 60000);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
