import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../tool-registry.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "batch_execute",
    "Execute multiple commands in a single round-trip. Use when performing 3+ similar operations (e.g., styling multiple nodes, creating many elements). Commands run sequentially.",
    {
      commands: z
        .array(
          z.object({
            command: z.string().describe("Command name"),
            params: z.record(z.string(), z.unknown()).optional().describe("Command parameters"),
          })
        )
        .describe("Array of commands to execute sequentially"),
    },
    async ({ commands }) => {
      try {
        const result = await sendCommand(
          "batch_execute",
          { commands },
          commands.length * 30000 // Scale timeout by command count
        );
        return textResult(JSON.stringify(result));
      } catch (error) {
        return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
