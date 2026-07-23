import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaCommand } from "@figma-relai/shared";

// Function signature for sending commands to Figma
export type SendCommandFn = (
  command: FigmaCommand,
  params?: unknown,
  timeoutMs?: number
) => Promise<unknown>;

// Interface that each tool module must implement
export interface ToolModule {
  register(server: McpServer, sendCommand: SendCommandFn): void;
}
