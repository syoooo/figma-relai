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
import "./handlers/memory.js";
import "./handlers/guards.js";
import "./handlers/audits-extra.js";
import "./handlers/rulesets.js";
import "./handlers/timeline.js";
import "./handlers/proposals.js";

import { dispatch, hasHandler, cancelCommand, clearCancelled } from "./dispatcher.js";
import { beginCommand, endCommand, pushEvent, drainEvents } from "./event-buffer.js";
import {
  needsApproval,
  describeScale,
  migrateConfirmLevel,
  setScopeLock,
  clearScopeLock,
  scopeLockState,
  type ApprovalMode,
  type ConfirmLevel,
} from "./write-guard.js";
import { sendProgressUpdate } from "./progress.js";
import {
  attachPrecedents,
  readMemory,
  recordGatePrecedent,
  recordPrecedent,
  removePrecedentById,
} from "./handlers/memory.js";
import { guardsStatePayload, refreshGuardsUI, setGuardedPages, readGuards } from "./handlers/guards.js";
import { collectNodeRefs, isWriteCommand } from "./write-guard.js";
import { reconcileOnLoad, rulesetStatus, postRulesetState } from "./handlers/rulesets.js";
import { appendWriteLog, stampCheckup, getLastCheckup } from "./handlers/timeline.js";
import { pendingProposals } from "./handlers/proposals.js";

// Commands that count as a full check-up for the gentle reminder
const CHECKUP_COMMANDS = new Set(["audit_readiness", "audit_ghosts"]);

// Show the plugin UI
figma.showUI(__html__, { width: 380, height: 850, themeColors: true });

// Designer-facing settings persisted across plugin restarts
interface RelaiSettings {
  room?: string;
  autoConnect?: boolean;
  allowCodeExec?: boolean;
  locale?: "en" | "ja" | "zh";
  client?: "claude" | "codex" | "cursor";
  requireApproval?: ApprovalMode; // legacy (pre-0.4)
  confirmHighRisk?: boolean; // legacy (pre-0.4)
  confirmLevel?: ConfirmLevel;
}

function effectiveConfirmLevel(s: RelaiSettings): ConfirmLevel {
  return s.confirmLevel ?? migrateConfirmLevel(s.requireApproval, s.confirmHighRisk);
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
loadSettings().then(async (settings) => {
  currentSettings = settings;
  // Heal the merge wound first: a linked file whose law was wiped gets it
  // back automatically when the ruleset's auto switch is on.
  let rulesetHealed: string | null = null;
  try {
    const recon = await reconcileOnLoad();
    if (recon.healed) rulesetHealed = recon.name;
  } catch {
    // Reconciliation must never block the panel from opening
  }
  const lastCheckup = await getLastCheckup();
  figma.ui.postMessage({
    type: "init-settings",
    settings,
    fileName: figma.root.name,
    hasConventions: figma.root.getSharedPluginData("relai", "conventions").length > 0,
    conventionsContent: figma.root.getSharedPluginData("relai", "conventions"),
    memory: readMemory(),
    guards: guardsStatePayload(),
    rulesetStatus: await rulesetStatus(),
    rulesetHealed,
    lastCheckup,
  });
  void postRulesetState();
});

// ── Approval gate ───────────────────────────────────────────────────
// While a command waits for the designer, periodic progress keeps the MCP
// side's timeout alive; deny resolves into the cancelled-error envelope.
const pendingApprovals = new Map<string, (approved: boolean, reason?: string) => void>();
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
    const settle = (approved: boolean, reason?: string) => {
      clearInterval(keepalive);
      clearTimeout(timeout);
      pendingApprovals.delete(id);
      // A typed reason becomes a decision precedent in file memory
      if (reason && reason.trim().length > 0) {
        void recordGatePrecedent(command, params, approved, reason.trim());
      }
      resolve(approved);
    };
    pendingApprovals.set(id, settle);
    figma.ui.postMessage({
      type: "approval-request",
      id,
      command,
      scale: describeScale(command, params),
      intent: describeIntent(command, params),
    });
  });
}

// The approval card leads with the agent's stated intent, not the command
// name — a designer can't judge "execute_code", they can judge "rebuild the
// pricing table from library components".
function describeIntent(command: string, params: Record<string, unknown>): string {
  if (typeof params.description === "string" && params.description.trim()) {
    return params.description.trim();
  }
  if (command === "batch_execute" && Array.isArray(params.commands)) {
    const names = (params.commands as Array<{ command?: string }>)
      .map((c) => c.command)
      .filter(Boolean);
    const head = names.slice(0, 3).join(", ");
    return `${names.length} commands: ${head}${names.length > 3 ? ", …" : ""}`;
  }
  return "";
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
    pendingApprovals.get(msg.id as string)?.(
      msg.approved === true,
      typeof msg.reason === "string" ? msg.reason : undefined
    );
    return;
  }

  if (msg.type === "memory-record") {
    try {
      await recordPrecedent({ text: msg.text, kind: msg.kind, source: "manual" });
    } catch (error) {
      figma.notify(error instanceof Error ? error.message : String(error), { error: true });
    }
    return;
  }

  if (msg.type === "memory-remove") {
    try {
      removePrecedentById(msg.id as string);
    } catch {
      // Entry already gone — panel state refresh follows regardless
    }
    return;
  }

  if (msg.type === "guards-set") {
    setGuardedPages(Array.isArray(msg.pages) ? (msg.pages as string[]) : []);
    return;
  }

  if (msg.type === "guards-refresh") {
    refreshGuardsUI();
    return;
  }

  if (msg.type === "ruleset-op") {
    // Panel ruleset actions route through the same handlers agents use.
    try {
      const op = msg.op as string;
      const name = typeof msg.name === "string" ? msg.name : undefined;
      if (op === "save-from-file") await dispatch("save_ruleset", { name, fromFile: true });
      else if (op === "link") await dispatch("link_ruleset", { name, restore: msg.restore === true });
      else if (op === "unlink") await dispatch("unlink_ruleset", {});
      else if (op === "restore") await dispatch("restore_from_ruleset", {});
      else if (op === "push") await dispatch("push_to_ruleset", {});
      else if (op === "delete") await dispatch("delete_ruleset", { name });
      else if (op === "set-auto") await dispatch("save_ruleset", { name, autoRestore: msg.autoRestore === true });
      else if (op === "export") {
        const out = (await dispatch("export_ruleset", { name })) as { name: string; markdown: string };
        figma.ui.postMessage({ type: "ruleset-export", name: out.name, markdown: out.markdown });
      } else if (op === "import") {
        await dispatch("import_ruleset", { markdown: msg.markdown });
      }
    } catch (error) {
      figma.notify(error instanceof Error ? error.message : String(error), { error: true });
      void postRulesetState();
    }
    return;
  }

  if (msg.type === "memory-promote") {
    try {
      const out = (await dispatch("promote_precedent", { id: msg.id })) as { ruleset: string };
      figma.notify(`Promoted into ruleset "${out.ruleset}"`);
    } catch (error) {
      figma.notify(error instanceof Error ? error.message : String(error), { error: true });
    }
    return;
  }

  if (msg.type === "history-fetch") {
    try {
      const out = await dispatch("list_write_log", { limit: 200 });
      figma.ui.postMessage({ type: "history-state", ...(out as Record<string, unknown>) });
    } catch {
      figma.ui.postMessage({ type: "history-state", entries: [], total: 0 });
    }
    return;
  }

  if (msg.type === "proposal-response") {
    const proposal = pendingProposals.get(msg.id as string);
    pendingProposals.delete(msg.id as string);
    if (proposal && msg.accepted === true) {
      const current = readGuards().pages;
      setGuardedPages([...new Set([...current, ...proposal.pages.map((p) => p.id)])]);
      const names = proposal.pages.map((p) => p.name).join(", ");
      try {
        await recordPrecedent({
          kind: "decision",
          text: `enabled page guard for ${names} — ${proposal.reason}`,
          refs: { pages: proposal.pages.map((p) => p.id) },
          source: "manual",
        });
      } catch {
        // The guard itself is on; a full memory must not undo the accept
      }
      figma.notify(`No-go zone enabled: ${names}`);
    }
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

      if (needsApproval(effectiveConfirmLevel(currentSettings), command, params ?? {})) {
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

      // In-band surfacing: this file's own precedents ride the result the
      // moment a write touches something they reference.
      result = attachPrecedents(command, params || {}, result);

      // Auto-evidence marker: big writes leave a flag in the feed + session
      // log so the batch is findable later (checkpoint/verify are the agent's
      // follow-up; the marker is the designer's breadcrumb).
      const touched =
        command === "batch_execute" && Array.isArray(params?.commands)
          ? (params.commands as unknown[]).length
          : collectNodeRefs(params || {}).length;
      if (isWriteCommand(command, params || {}) && touched >= 10) {
        pushEvent({ type: "bulk_write", ts: Date.now(), command, count: touched } as never);
        figma.ui.postMessage({ type: "evidence-marker", command, count: touched });
      }

      // Session timeline: every write lands in the per-machine ring buffer
      if (isWriteCommand(command, params || {})) {
        void appendWriteLog(command, collectNodeRefs(params || {}), true, touched);
      }
      if (CHECKUP_COMMANDS.has(command)) void stampCheckup();

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
      if (isWriteCommand(command, params || {})) {
        void appendWriteLog(command, collectNodeRefs(params || {}), false);
      }
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
  refreshGuardsUI(); // page list may have changed (create/rename/delete)
});

figma.on("close", () => {
  // Cleanup on plugin close
});
