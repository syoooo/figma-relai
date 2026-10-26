import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "./server.js";
import { FigmaConnection } from "./connection.js";
import { logger } from "./logger.js";
import { registerAllTools, registerRoomTool, registerEventsTool } from "./tools/index.js";
import { startEmbeddedRelay, type EmbeddedRelay } from "./embedded-relay.js";
import { refreshTokenStatus } from "./credentials.js";
import { resolveFileIdentity } from "./tools/core/file-identity.js";
import { saveState } from "./state.js";
import { registerPrompts } from "./prompts.js";
import { recordCommand, getSessionLog } from "./session-log.js";
import { VERSION } from "./version.js";

export interface RuntimeOptions {
  serverUrl: string;
  port: number;
  // Room to auto-pair with on the first command (null: pick whatever plugin is there)
  initialRoom: string | null;
  // Write every joined room to the state file so the next process resumes it
  persistRoom: boolean;
  // "auto": host the relay in this process unless another one already does
  // (local relays only); "never": always connect as a client
  hostRelay: "auto" | "never";
  // Ask the plugin which file it is on after the first command reaches it
  probeIdentity: boolean;
}

export interface Runtime {
  server: McpServer;
  connection: FigmaConnection;
  // Stop reconnecting and release the relay this process hosts, if any
  close(): void;
}

// Everything the MCP server needs before a transport is attached: the server
// with all its tools, the relay (hosted or joined), and the connection to the
// plugin. The stdio entry point and any in-process caller share this one path,
// so a tool called in-process behaves exactly like one called over MCP.
export async function bootRuntime(options: RuntimeOptions): Promise<Runtime> {
  const { serverUrl, port } = options;

  // Create MCP server
  const server = createServer();

  // Ask Figma whether the stored token is still alive before anyone lights a
  // lamp for it. Fire-and-forget: nothing here should wait on the network.
  void refreshTokenStatus();

  // Host the relay in this process unless another instance already does
  // (bind-or-connect: first MCP server binds 9055, later ones connect to it).
  // Only for local relays — a remote --server means someone runs it there.
  const mayHost = options.hostRelay === "auto" && serverUrl === "localhost";
  let relay: EmbeddedRelay | null = null;
  if (mayHost) {
    relay = await startEmbeddedRelay(port, VERSION);
    if (!relay) {
      logger.info(`Port ${port} in use — connecting to the existing relay`);
    }
  }

  // Create WebSocket connection to relay
  const connection = new FigmaConnection(serverUrl, port, {
    initialRoom: options.initialRoom,
    onRoomChanged: options.persistRoom ? (room) => saveState({ room }) : undefined,
    beforeReconnect: async () => {
      // The hosting process may have exited; take over if the port is free
      if (mayHost && !relay) {
        relay = await startEmbeddedRelay(port, VERSION);
        if (relay) logger.info("Took over relay hosting");
      }
    },
  });

  // Register the join_room tool
  registerRoomTool(
    server,
    (room) => connection.joinRoom(room),
    () => connection.listRooms()
  );

  // Register designer-activity polling + the AI's own audit trail
  registerEventsTool(server, () => connection.consumeEvents(), getSessionLog);

  // Expose skill documents as MCP prompts (inlined at build time)
  registerPrompts(server);

  // Which file is this? Nothing used to ask until manage_comments did, so the
  // panel's lineage stayed blank in every session that never touched comments
  // — and blank forever on a machine that never touches them at all. The first
  // command that reaches the plugin is the earliest honest moment to find out.
  // A failure is not final: the designer may reload the plugin, open another
  // file, or store a token mid-session, and a latch set on the first attempt
  // would keep the panel blank for the rest of the process. Success latches;
  // failure gets a few more chances and then stops asking.
  let identityProbes = 0;
  let identityResolved = !options.probeIdentity;
  const probeIdentityOnce = () => {
    if (identityResolved || identityProbes >= 3) return;
    identityProbes += 1;
    void resolveFileIdentity((c, p2, t) => connection.sendCommand(c, p2, t))
      .then(() => {
        identityResolved = true;
      })
      .catch(() => {
        // No token, nothing published, no branch — all ordinary. The panel keeps
        // showing what it showed before and the caller is never told.
      });
  };

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
      // Not for the identity commands themselves, or the probe calls itself
      if (command !== "get_file_identity" && command !== "set_file_identity") {
        probeIdentityOnce();
      }
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

  return {
    server,
    connection,
    close() {
      connection.disconnect();
      relay?.close();
      relay = null;
    },
  };
}
