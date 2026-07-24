import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FIGMA_COMMANDS, PITFALLS } from "@figma-relai/shared";
import { createServer } from "../server.js";
import {
  registerAllTools,
  registerRoomTool,
  registerEventsTool,
  listToolCatalog,
} from "../tools/index.js";
import { registerPrompts } from "../prompts.js";

// The authoritative, machine-readable contract — in the Astryx sense.
// Nothing here is hand-written: tools and their JSON schemas come from a real
// in-process MCP handshake (exactly what agents receive from tools/list),
// categories from the registration table, commands and pitfalls from their
// runtime registries. It cannot drift from behavior by construction.

export interface Manifest {
  name: string;
  version: string;
  tools: Array<{
    name: string;
    category: string;
    description: string;
    inputSchema: unknown;
  }>;
  prompts: Array<{ name: string; description: string }>;
  pluginCommands: readonly string[];
  pitfalls: typeof PITFALLS;
}

export async function buildManifest(version: string): Promise<Manifest> {
  const server = createServer();
  registerRoomTool(server, async () => {
    throw new Error("manifest introspection — no relay");
  });
  registerEventsTool(server, () => [], () => []);
  registerPrompts(server);
  registerAllTools(server, async () => {
    throw new Error("manifest introspection — no plugin connection");
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "relai-manifest", version });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const categories = new Map(listToolCatalog().map((t) => [t.name, t.category]));
  const tools = (await client.listTools()).tools
    .map((t) => ({
      name: t.name,
      category: categories.get(t.name) ?? "other",
      description: t.description ?? "",
      inputSchema: t.inputSchema,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const prompts = (await client.listPrompts()).prompts.map((p) => ({
    name: p.name,
    description: p.description ?? "",
  }));

  await client.close();
  await server.close();

  return {
    name: "figma-relai",
    version,
    tools,
    prompts,
    pluginCommands: FIGMA_COMMANDS,
    pitfalls: PITFALLS,
  };
}
