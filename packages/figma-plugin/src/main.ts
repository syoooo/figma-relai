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
import "./handlers/design-system.js";
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
import "./handlers/audit.js";
import "./handlers/batch.js";
import "./handlers/execute-code.js";

import { dispatch, hasHandler, cancelCommand, clearCancelled } from "./dispatcher.js";
import { beginCommand, endCommand, pushEvent, drainEvents } from "./event-buffer.js";
import {
  needsApproval,
  describeScale,
  setScopeLock,
  clearScopeLock,
  scopeLockState,
  type ApprovalMode,
} from "./write-guard.js";
import { sendProgressUpdate } from "./progress.js";

// Show the plugin UI
figma.showUI(__html__, { width: 380, height: 850, themeColors: true });

// Designer-facing settings persisted across plugin restarts
interface RelaiSettings {
  room?: string;
  autoConnect?: boolean;
  allowCodeExec?: boolean;
  locale?: "en" | "ja" | "zh";
  client?: "claude" | "codex" | "cursor";
  requireApproval?: ApprovalMode;
}

const SETTINGS_KEY = "relai.settings";

// Cached so the approval gate can read the current mode synchronously
let currentSettings: RelaiSettings = {};

async function loadSettings(): Promise<RelaiSettings> {
  try {
    return ((await figma.clientStorage.getAsync(SETTINGS_KEY)) as RelaiSettings) ?? {};
  } catch {
    return {};
  }
}

// Send persisted settings to the UI so it can restore the room + auto-connect
loadSettings().then((settings) => {
  currentSettings = settings;
  figma.ui.postMessage({
    type: "init-settings",
    settings,
    fileName: figma.root.name,
    hasConventions: figma.root.getSharedPluginData("relai", "conventions").length > 0,
    conventionsContent: figma.root.getSharedPluginData("relai", "conventions"),
  });
});

// ── Approval gate ───────────────────────────────────────────────────
// While a command waits for the designer, periodic progress keeps the MCP
// side's timeout alive; deny resolves into the cancelled-error envelope.
const pendingApprovals = new Map<string, (approved: boolean) => void>();
const APPROVAL_TIMEOUT_MS = 120000;

function requestApproval(
  id: string,
  command: string,
  params: Record<string, unknown>
): Promise<boolean> {
  return new Promise((resolve) => {
    const keepalive = setInterval(() => {
      sendProgressUpdate({
        commandId: (params.commandId as string) ?? id,
        commandType: command,
        status: "in_progress",
        progress: 0,
        totalItems: 1,
        processedItems: 0,
        message: "Awaiting designer approval",
      });
    }, 10000);
    const timeout = setTimeout(() => settle(false), APPROVAL_TIMEOUT_MS);
    const settle = (approved: boolean) => {
      clearInterval(keepalive);
      clearTimeout(timeout);
      pendingApprovals.delete(id);
      resolve(approved);
    };
    pendingApprovals.set(id, settle);
    figma.ui.postMessage({
      type: "approval-request",
      id,
      command,
      scale: describeScale(command, params),
    });
  });
}

// Handle messages from the UI
figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "save-settings") {
    const current = await loadSettings();
    currentSettings = { ...current, ...(msg.settings as RelaiSettings) };
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, currentSettings);
    } catch {
      // Persistence is best-effort
    }
    return;
  }

  if (msg.type === "approval-response") {
    pendingApprovals.get(msg.id as string)?.(msg.approved === true);
    return;
  }

  if (msg.type === "scope-lock") {
    if (msg.on) {
      const sel = figma.currentPage.selection;
      if (sel.length === 0) {
        figma.ui.postMessage({ type: "scope-lock-state", on: false, names: [], empty: true });
        return;
      }
      setScopeLock(
        sel.map((n) => n.id),
        sel.slice(0, 3).map((n) => n.name)
      );
    } else {
      clearScopeLock();
    }
    figma.ui.postMessage({ type: "scope-lock-state", ...scopeLockState() });
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
    // Stop also answers any approval card still waiting on this command
    pendingApprovals.get(msg.id as string)?.(false);
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

      if (needsApproval(currentSettings.requireApproval ?? "off", command, params ?? {})) {
        const approved = await requestApproval(id, command, params ?? {});
        figma.ui.postMessage({ type: "approval-settled", id, approved });
        if (!approved) {
          figma.ui.postMessage({
            type: "command-error",
            id,
            error: { message: "Denied by designer", command, cancelled: true },
          });
          return;
        }
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
