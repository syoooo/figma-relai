import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { FigmaConnection } from "./connection.js";
import { logger } from "./logger.js";
import {
  registerAllTools,
  registerRoomTool,
  registerEventsTool,
  listToolCatalog,
} from "./tools/index.js";
import { startEmbeddedRelay, type EmbeddedRelay } from "./embedded-relay.js";
import { loadState, saveState } from "./state.js";
import { registerPrompts } from "./prompts.js";
import { recordCommand, getSessionLog } from "./session-log.js";

const VERSION = "0.1.1";

// Parse CLI arguments
const args = process.argv.slice(2);
const serverArg = args.find((arg) => arg.startsWith("--server="));
const serverUrl = serverArg ? serverArg.split("=")[1] : "localhost";

const portArg = args.find((arg) => arg.startsWith("--port="));
const port = portArg ? parseInt(portArg.split("=")[1]) : 9055;

const roomArg = args.find((arg) => arg.startsWith("--room="));

// Build-time inventory for the plugin UI tool list; exits without stdio setup
if (args.includes("--list-tools")) {
  console.log(JSON.stringify(listToolCatalog(), null, 2));
  process.exit(0);
}

async function main() {
  // Create MCP server
  const server = createServer();

  // Host the relay in this process unless another instance already does
  // (bind-or-connect: first MCP server binds 9055, later ones connect to it).
  // Only for local relays — a remote --server means someone runs it there.
  let relay: EmbeddedRelay | null = null;
  if (serverUrl === "localhost") {
    relay = await startEmbeddedRelay(port, VERSION);
    if (!relay) {
      logger.info(`Port ${port} in use — connecting to the existing relay`);
    }
  }

  const initialRoom =
    roomArg?.split("=")[1] ?? process.env.FIGMA_RELAI_ROOM ?? loadState().room ?? null;

  // Create WebSocket connection to relay
  const connection = new FigmaConnection(serverUrl, port, {
    initialRoom,
    onRoomChanged: (room) => saveState({ room }),
    beforeReconnect: async () => {
      // The hosting process may have exited; take over if the port is free
      if (serverUrl === "localhost" && !relay) {
        relay = await startEmbeddedRelay(port, VERSION);
        if (relay) logger.info("Took over relay hosting");
      }
    },
  });

  // Register the join_room tool
  registerRoomTool(server, (room) => connection.joinRoom(room));

  // Register designer-activity polling + the AI's own audit trail
  registerEventsTool(server, () => connection.consumeEvents(), getSessionLog);

  // Expose skill documents as MCP prompts (inlined at build time)
  registerPrompts(server);

  // Register all domain tools; every plugin command lands in the session log
  registerAllTools(server, async (command, params, timeoutMs) => {
    const t0 = Date.now();
    const nodeId =
      typeof (params as { nodeId?: unknown })?.nodeId === "string"
        ? ((params as { nodeId: string }).nodeId)
        : undefined;
    try {
      const result = await connection.sendCommand(command, params, timeoutMs);
      recordCommand({ ts: t0, command, nodeId, ok: true, ms: Date.now() - t0 });
      return result;
    } catch (error) {
      recordCommand({
        ts: t0,
        command,
        nodeId,
        ok: false,
        ms: Date.now() - t0,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
      throw error;
    }
  });

  // Connect to relay (auto-reconnects on failure)
  try {
    await connection.connect();
    logger.info("Connected to relay successfully");
  } catch (error) {
    logger.warn(
      `Could not connect initially: ${error instanceof Error ? error.message : String(error)}`
    );
    logger.warn("Will attempt to connect when the first command is sent");
  }

  // Start MCP server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Relai MCP server running on stdio");
}

main().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
