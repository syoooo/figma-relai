import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { listToolCatalog } from "./tools/index.js";
import { loadState } from "./state.js";
import { VERSION } from "./version.js";
import { bootRuntime } from "./runtime.js";

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
  const { server } = await bootRuntime({
    serverUrl,
    port,
    initialRoom:
      roomArg?.split("=")[1] ?? process.env.FIGMA_RELAI_ROOM ?? loadState().room ?? null,
    persistRoom: true,
    hostRelay: "auto",
    probeIdentity: true,
  });

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
