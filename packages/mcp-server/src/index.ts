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
import { refreshTokenStatus } from "./credentials.js";
import { resolveFileIdentity } from "./tools/core/file-identity.js";
import { loadState, saveState } from "./state.js";
import { registerPrompts } from "./prompts.js";
import { recordCommand, getSessionLog } from "./session-log.js";

const VERSION = "0.7.2";

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

// CLI subcommands (Astryx-style: the contract is executable, not prose).
// `manifest` prints the machine-readable contract, `docs` renders it for
// humans, `doctor` triages the local environment. All exit before stdio.
const subcommand = args.find((a) => !a.startsWith("--"));
if (subcommand === "login" || subcommand === "logout") {
  const { runLogin, runLogout } = await import("./cli/login.js");
  const { exitCode, message } = subcommand === "login" ? await runLogin() : runLogout();
  console.log(message);
  process.exit(exitCode);
}
if (subcommand === "manifest" || subcommand === "docs" || subcommand === "doctor") {
  const { buildManifest } = await import("./cli/manifest.js");
  if (subcommand === "doctor") {
    const { runDoctor, renderDoctor } = await import("./cli/doctor.js");
    const results = await runDoctor();
    console.log(args.includes("--json") ? JSON.stringify(results, null, 2) : renderDoctor(results));
    process.exit(results.some((r) => r.status === "warn") ? 1 : 0);
  }
  const manifest = await buildManifest(VERSION);
  if (subcommand === "manifest") {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    const { renderToolDoc, renderToolIndex } = await import("./cli/docs.js");
    const toolName = args[args.indexOf("docs") + 1];
    console.log(
      toolName && !toolName.startsWith("--")
        ? renderToolDoc(manifest, toolName)
        : renderToolIndex(manifest)
    );
  }
  process.exit(0);
}
// A word we don't know is a mistake, not a request to start a server. Falling
// through meant `figma-relai lgoin` — or any subcommand newer than the copy npx
// happened to fetch — booted stdio and sat there in total silence.
if (subcommand) {
  process.stderr.write(
    `Unknown command "${subcommand}" (figma-relai ${VERSION}).\n` +
      "  login · logout · doctor · docs [tool] · manifest\n" +
      "  no command at all starts the MCP server over stdio\n\n" +
      "If your AI client shows this command, npx may be running an older\n" +
      "published version — try: npx -y figma-relai@latest " +
      `${subcommand}\n`
  );
  process.exit(2);
}

async function main() {
  // Create MCP server
  const server = createServer();

  // Ask Figma whether the stored token is still alive before anyone lights a
  // lamp for it. Fire-and-forget: nothing here should wait on the network.
  void refreshTokenStatus();

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
  let identityProbed = false;
  const probeIdentityOnce = () => {
    if (identityProbed) return;
    identityProbed = true;
    void resolveFileIdentity((c, p2, t) => connection.sendCommand(c, p2, t)).catch(() => {
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
