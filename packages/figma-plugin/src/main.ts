// Relai Plugin - Main Entry Point
// Import all handlers to trigger registration
import "./handlers/document.js";
import "./handlers/node-read.js";
import "./handlers/node-create.js";
import "./handlers/node-modify.js";
import "./handlers/styling.js";
import "./handlers/effects.js";
import "./handlers/text.js";
import "./handlers/layout.js";
import "./handlers/components.js";
import "./handlers/variables.js";
import "./handlers/styles.js";
import "./handlers/export.js";
import "./handlers/page.js";
import "./handlers/structure.js";
import "./handlers/constraints.js";
import "./handlers/annotations.js";
import "./handlers/prototype.js";
import "./handlers/viewport.js";
import "./handlers/plugin-data.js";
import "./handlers/image-fill.js";
import "./handlers/library.js";
import "./handlers/batch.js";
import "./handlers/execute-code.js";

import { dispatch, hasHandler, cancelCommand, clearCancelled } from "./dispatcher.js";
import { beginCommand, endCommand, pushEvent, drainEvents } from "./event-buffer.js";

// Show the plugin UI
figma.showUI(__html__, { width: 380, height: 850, themeColors: true });

// Designer-facing settings persisted across plugin restarts
interface RelaiSettings {
  room?: string;
  autoConnect?: boolean;
  allowCodeExec?: boolean;
  locale?: "en" | "ja" | "zh";
  client?: "claude" | "codex" | "cursor";
}

const SETTINGS_KEY = "relai.settings";

async function loadSettings(): Promise<RelaiSettings> {
  try {
    return ((await figma.clientStorage.getAsync(SETTINGS_KEY)) as RelaiSettings) ?? {};
  } catch {
    return {};
  }
}

// Send persisted settings to the UI so it can restore the room + auto-connect
loadSettings().then((settings) => {
  figma.ui.postMessage({
    type: "init-settings",
    settings,
    fileName: figma.root.name,
  });
});

// Handle messages from the UI
figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "save-settings") {
    const current = await loadSettings();
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, {
        ...current,
        ...(msg.settings as RelaiSettings),
      });
    } catch {
      // Persistence is best-effort
    }
    return;
  }

  if (msg.type === "focus-node") {
    // Activity-feed click: select the node and bring it into view
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId as string);
      if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
    } catch {
      // Node may be gone; nothing to do
    }
    return;
  }

  if (msg.type === "cancel-command") {
    cancelCommand(msg.id as string);
    return;
  }

  if (msg.type === "execute-command") {
    const { id, command, params } = msg;

    try {
      if (!hasHandler(command)) {
        figma.ui.postMessage({
          type: "command-error",
          id,
          error: `Unknown command: ${command}`,
        });
        return;
      }

      beginCommand();
      let result: unknown;
      try {
        result = await dispatch(command, params || {});
      } finally {
        endCommand();
      }
      clearCancelled(params?.commandId as string | undefined);

      // Piggyback designer activity that happened since the last command
      const events = drainEvents();
      figma.ui.postMessage({
        type: "command-result",
        id,
        result,
        ...(events.length > 0 ? { events } : {}),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Attach node context so the AI can act on the error without re-reading
      const nodeId =
        typeof params?.nodeId === "string" ? params.nodeId : undefined;
      let nodeType: string | undefined;
      if (nodeId) {
        try {
          nodeType = (await figma.getNodeByIdAsync(nodeId))?.type;
        } catch {
          // best effort only
        }
      }
      clearCancelled(params?.commandId as string | undefined);
      figma.ui.postMessage({
        type: "command-error",
        id,
        error: { message: errorMessage, command, nodeId, nodeType },
      });
      figma.notify(`Error: ${errorMessage}`, { error: true });
    }
  }
};

// ── Designer activity listeners ─────────────────────────────────────
figma.on("selectionchange", () => {
  const sel = figma.currentPage.selection;
  pushEvent({
    type: "selection_change",
    ts: Date.now(),
    nodeIds: sel.map((n) => n.id),
    names: sel.slice(0, 5).map((n) => n.name),
  });
});

// nodechange is page-scoped (dynamic-page compatible); re-attach on page switch
let nodeChangePage: PageNode | null = null;
function watchCurrentPage(): void {
  if (nodeChangePage === figma.currentPage) return;
  nodeChangePage = figma.currentPage;
  figma.currentPage.on("nodechange", (event) => {
    const ids = [...new Set(event.nodeChanges.map((c) => c.id))];
    if (ids.length === 0) return;
    pushEvent({ type: "node_change", ts: Date.now(), nodeIds: ids.slice(0, 10) });
  });
}
watchCurrentPage();

figma.on("currentpagechange", () => {
  pushEvent({ type: "page_change", ts: Date.now(), pageName: figma.currentPage.name });
  watchCurrentPage();
});

figma.on("close", () => {
  // Cleanup on plugin close
});
