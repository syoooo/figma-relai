import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "import_from_library",
    "Import a component, style, or variable from an enabled team library by its key. Keys come from get_design_system's libraryCatalog, which resolves each library this file draws from and lists everything it publishes — not just what the file already uses. If the library you want is not in that catalog, it is listed under librariesNotCatalogued with what to do about it. Imported components can then be instantiated with manage_components.",
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
