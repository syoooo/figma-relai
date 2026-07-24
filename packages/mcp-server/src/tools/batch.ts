import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../tool-registry.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "batch_execute",
    "Execute multiple commands in a single round-trip. Use when performing 3+ similar operations (e.g., styling multiple nodes, creating many elements). Commands run sequentially. Pass dryRun:true to preview the exact command list without touching the canvas — useful for showing the designer a plan before a large batch.",
    {
      commands: z
        .array(
          z.object({
            command: z.string().describe("Command name"),
            params: z.record(z.string(), z.unknown()).optional().describe("Command parameters"),
          })
        )
        .describe("Array of commands to execute sequentially"),
      dryRun: z.boolean().optional().describe("Preview only — return the plan, execute nothing"),
    },
    async ({ commands, dryRun }) => {
      try {
        if (dryRun) {
          return textResult(
            JSON.stringify({
              dryRun: true,
              commandCount: commands.length,
              commands,
              note: "Nothing was executed. Re-run without dryRun to apply.",
            })
          );
        }
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
