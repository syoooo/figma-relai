import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../tool-registry.js";
import { z } from "zod";

// Consolidated core tools (~30). Each maps declarative input onto the plugin's
// granular command vocabulary — the plugin side is unchanged, so the
// precondition checks and structured errors keep working underneath.
import * as create from "./core/create.js";
import * as properties from "./core/properties.js";
import * as structure from "./core/structure.js";
import * as text from "./core/text.js";
import * as components from "./core/components.js";
import * as variables from "./core/variables.js";
import * as styles from "./core/styles.js";
import * as pages from "./core/pages.js";
import * as navigate from "./core/navigate.js";
import * as assets from "./core/assets.js";
import * as library from "./core/library.js";
import * as annotate from "./core/annotate.js";
import * as read from "./core/read.js";
import * as execute from "./core/execute.js";
import * as batch from "./batch.js";

// v2 semantic layer: context, analysis, verification
import * as v2Context from "./v2/context.js";
import * as v2Analysis from "./v2/analysis.js";
import * as v2Verification from "./v2/verification.js";

const moduleCategories: [ToolModuleLike, string][] = [
  [v2Context, "context"],
  [v2Analysis, "analysis"],
  [v2Verification, "verification"],
  [read, "read"],
  [create, "create"],
  [properties, "edit"],
  [structure, "edit"],
  [text, "edit"],
  [components, "components"],
  [variables, "design-system"],
  [styles, "design-system"],
  [library, "design-system"],
  [pages, "document"],
  [navigate, "document"],
  [assets, "assets"],
  [annotate, "annotations"],
  [batch, "advanced"],
  [execute, "advanced"],
];

interface ToolModuleLike {
  register(server: McpServer, sendCommand: SendCommandFn): void;
}

// Register the join_room tool separately since it uses joinRoom directly.
// Pairing is automatic when exactly one plugin is connected; this tool exists
// for disambiguation when several Figma files run the plugin at once.
export function registerRoomTool(
  server: McpServer,
  joinRoom: (room: string) => Promise<void>
): void {
  server.tool(
    "join_room",
    "Connect to a specific Figma plugin instance by room name. Usually unnecessary — pairing is automatic when one plugin is connected. Use only when an error reports multiple plugins/rooms; the room name is shown in each plugin's UI.",
    {
      room: z.string().describe("Room name shown in the Figma plugin"),
    },
    async ({ room }) => {
      try {
        if (!room) {
          return {
            content: [{ type: "text" as const, text: "Please provide a room name." }],
          };
        }
        await joinRoom(room);
        return {
          content: [
            { type: "text" as const, text: `Successfully joined room: ${room}` },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error joining room: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

// Designer-activity polling tool; events also piggyback on command results
// as a designer_events field
export function registerEventsTool(
  server: McpServer,
  consumeEvents: () => unknown[]
): void {
  server.tool(
    "get_events",
    "What has the designer done since the last command? Returns buffered selection/node/page-change events (also included as designer_events on command results). Useful after idle periods or before acting on 'the selection'.",
    {},
    { readOnlyHint: true },
    async () => {
      const events = consumeEvents();
      return {
        content: [
          {
            type: "text" as const,
            text:
              events.length === 0
                ? "No designer activity since the last check."
                : JSON.stringify(events, null, 2),
          },
        ],
      };
    }
  );
}

// Register all tool modules
export function registerAllTools(
  server: McpServer,
  sendCommand: SendCommandFn
): void {
  for (const [mod] of moduleCategories) {
    mod.register(server, sendCommand);
  }
}

// Build-time tool inventory for the plugin UI (node dist/index.js --list-tools)
export function listToolCatalog(): Array<{ name: string; category: string }> {
  const catalog: Array<{ name: string; category: string }> = [
    { name: "join_room", category: "advanced" },
    { name: "get_events", category: "context" },
  ];
  for (const [mod, category] of moduleCategories) {
    const collector = {
      tool: (name: string) => {
        catalog.push({ name, category });
      },
    } as unknown as McpServer;
    // Handlers never run; registration only records names
    mod.register(collector, async () => undefined);
  }
  return catalog;
}
