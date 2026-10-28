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
import "./handlers/file-identity.js";


import { dispatch, hasHandler, cancelCommand, clearCancelled, setGuardEnforcer } from "./dispatcher.js";
import { beginCommand, endCommand, pushEvent, drainEvents } from "./event-buffer.js";
import { needsApproval, scopeLockState, taxTier, collectNodeRefs, isWriteCommand } from "./write-guard.js";
import { sendProgressUpdate } from "./progress.js";
import { createApprovalGate } from "./approval-gate.js";
import {
  attachPrecedents,
  readMemory,
  recordGatePrecedent,
  recordPrecedent,
  removePrecedentById,
} from "./handlers/memory.js";
import { enforcePageGuards, guardsStatePayload, refreshGuardsUI, readGuards } from "./handlers/guards.js";
import { reconcileOnLoad, rulesetStatus, postRulesetState, type RestoreResult } from "./handlers/rulesets.js";
import { appendWriteLog, stampCheckup, getLastCheckup } from "./handlers/timeline.js";
import { pendingProposals } from "./handlers/proposals.js";
import { postFileIdentity } from "./handlers/file-identity.js";
import { createWindowControls, DEFAULT_WINDOW_SIZE } from "./window-controls.js";
import { checkExpectedFile, denialError, resultMeta, toErrorPayload, type Phase } from "./call-outcome.js";
import { buildIndex } from "./memory-core.js";
import {
  attachPreflight,
  batchApproval,
  cardPrecedents,
  isConfirmLevel,
  isDesignerOnlyMessage,
  lawRestoredWarning,
  MAX_BATCH_DEPTH,
  preflightPrecedents,
  wallsKey,
  type CommandRules,
  type PrecedentPreflight,
  type VoiceSnap,
} from "./wall-core.js";
import {
  checkOnClose,
  checkpoint,
  codeExecDisabled,
  collectNotices,
  commitFromPanel,
  currentWalls,
  initWalls,
  notePanelBoot,
  noteRelayState,
  noteVoiceWrite,
  panelLost,
  panelVerdict,
  persistOtherSettings,
  probePanel,
  scriptEnded,
  scriptStarted,
  snapshotVoice,
  wallEnforcer,
  type PanelWallPatch,
} from "./walls.js";
import {
  RelaiError,
  type LawNotice,
  type LawNoticeMessage,
  type RulesetOp,
  type WsCallInfo,
} from "@figma-relai/shared";

// Commands that count as a full check-up for the gentle reminder
const CHECKUP_COMMANDS = new Set(["audit_readiness", "audit_ghosts"]);

// Show the plugin UI
figma.showUI(__html__, { ...DEFAULT_WINDOW_SIZE, themeColors: true });
const handleWindowMessage = createWindowControls(figma.ui);

// Every dispatch, nested batch commands included, checks the walls against
// the plugin's own copy before the page-guard check runs
setGuardEnforcer(wallEnforcer(enforcePageGuards));

// Room identity is per FILE, not per install. clientStorage is shared by every
// file this plugin opens on the machine, so a single saved room name makes two
// open files fight over one address — and an agent's writes can land in the
// wrong document (three live incidents on 2026-08-12/13). figma.fileKey is
// undefined for most private plugins, so the file carries a private random
// seed; mixing in root.name splits branches and copies, which share pluginData.
function getFileId(): string {
  if (figma.fileKey) return figma.fileKey;
  let seed = figma.root.getPluginData("roomSeed");
  if (!seed) {
    seed = Math.random().toString(36).slice(2, 10);
    figma.root.setPluginData("roomSeed", seed);
  }
  return seed + ":" + figma.root.name;
}

// Settings fields that are walls: they reach storage only through walls.ts
const WALL_SETTING_FIELDS = new Set([
  "confirmLevel",
  "allowCodeExec",
  "scopeLock",
  "wallsByFile",
  "requireApproval",
  "confirmHighRisk",
]);

const postLaw = (notices: LawNotice[], commandId?: string, command?: string) => {
  if (notices.length === 0) return;
  const message: LawNoticeMessage = {
    type: "law-notice",
    ...(commandId !== undefined ? { commandId } : {}),
    ...(command !== undefined ? { command } : {}),
    notices,
  };
  figma.ui.postMessage(message);
};

// Load this file's walls (the one time storage is trusted), then send the
// panel what it restores: room, auto-connect, this file's walls, the law
const fileId = getFileId();
// getFileId() made sure the file has a seed or a fileKey, so there is a key
const fileWallsKey = wallsKey({ seed: figma.root.getPluginData("roomSeed"), fileKey: figma.fileKey })!;
initWalls(fileWallsKey).then(async ({ store, resolved }) => {
  // Heal the merge wound first: a linked file whose law was wiped gets it
  // back automatically when the ruleset's auto switch is on.
  let rulesetHealed: { name: string } | null = null;
  try {
    noteVoiceWrite();
    const recon = await reconcileOnLoad();
    if (recon.healed) rulesetHealed = { name: recon.name };
  } catch {
    // Reconciliation must never block the panel from opening
  }
  const lastCheckup = await getLastCheckup();
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(store)) {
    if (!WALL_SETTING_FIELDS.has(key)) settings[key] = value;
  }
  const walls = currentWalls();
  figma.ui.postMessage({
    type: "init-settings",
    settings: { ...settings, confirmLevel: walls.confirmLevel, allowCodeExec: walls.allowCodeExec },
    walls: { confirmLevel: walls.confirmLevel, allowCodeExec: walls.allowCodeExec, perFile: resolved.perFile },
    fileName: figma.root.name,
    fileId,
    hasConventions: figma.root.getSharedPluginData("relai", "conventions").length > 0,
    conventionsContent: figma.root.getSharedPluginData("relai", "conventions"),
    memory: readMemory(),
    guards: guardsStatePayload(),
    rulesetStatus: await rulesetStatus(),
    rulesetHealed,
    lastCheckup,
    scopeLock: scopeLockState(),
  });
  void postRulesetState();
  void postFileIdentity();
});

// ── Approval gate ───────────────────────────────────────────────────
// While a command waits for the designer, periodic progress keeps the MCP
// side's timeout alive; a card that ends without a yes becomes a coded error
// (denied, timed out, or stopped) and the command never runs.
const approvalGate = createApprovalGate({
  timeoutMs: 120000,
  keepaliveMs: 10000,
  post: (message) => figma.ui.postMessage(message),
  keepalive: (id, command, params) =>
    sendProgressUpdate({
      commandId: (params.commandId as string) ?? id,
      commandType: command,
      status: "in_progress",
      progress: 0,
      totalItems: 1,
      processedItems: 0,
      message: "Awaiting designer approval",
    }),
  // A typed reason becomes a decision precedent in file memory
  onSettled: ({ command, params, approved, reason }) => {
    if (!reason) return;
    noteVoiceWrite();
    void recordGatePrecedent(command, params, approved, reason);
  },
});

// ── What a command wraps ────────────────────────────────────────────

type Params = Record<string, unknown>;

// Only the counts of batchApproval are read here (nesting depth, scripts);
// whether the batch asks is write-guard.ts's needsApproval
const SHAPE_RULES: CommandRules = {
  isWrite: isWriteCommand,
  taxTier,
  needsApproval: () => false,
  bulkThreshold: Number.POSITIVE_INFINITY,
};

// Commands that write precedents, conventions or the ruleset link. When one
// runs in the same command as a script, Relai's own write is not blamed on it.
const VOICE_COMMAND = /precedent|convention|ruleset/;

function anyWrapped(command: string, params: Params, test: (command: string) => boolean, depth = 0): boolean {
  if (test(command)) return true;
  if (command !== "batch_execute" || !Array.isArray(params.commands) || depth >= MAX_BATCH_DEPTH) return false;
  return params.commands.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Params).command === "string" &&
      anyWrapped((item as Params).command as string, ((item as Params).params as Params) ?? {}, test, depth + 1)
  );
}

// The memory and convention commands surface no precedents of their own
const PRECEDENT_SKIP = new Set([
  "record_precedent",
  "list_precedents",
  "update_precedent",
  "remove_precedent",
  "get_conventions",
  "set_conventions",
]);

/** Precedents matched against the file as it is before the write. */
function preflight(command: string, params: Params): PrecedentPreflight | null {
  if (PRECEDENT_SKIP.has(command) || !isWriteCommand(command, params)) return null;
  try {
    return preflightPrecedents(buildIndex(readMemory()), command, params, {
      pageId: figma.currentPage.id,
      isWrite: isWriteCommand,
      nodeRefs: collectNodeRefs,
      skip: PRECEDENT_SKIP,
    });
  } catch {
    return null; // surfacing must never break the command itself
  }
}

/** An object result carries the wall notices as `law`, with a warning when something was put back. */
function withLaw(result: unknown, notices: LawNotice[]): unknown {
  if (notices.length === 0 || result === null || typeof result !== "object" || Array.isArray(result)) return result;
  const out: Params = { ...(result as Params), law: notices };
  const warning = lawRestoredWarning(notices);
  if (warning) out.warnings = [...(Array.isArray(out.warnings) ? out.warnings : []), warning];
  return out;
}

// Commands inside their handler, by request id, so a Stop can be
// acknowledged to the server only for a command that is still running
const runningCommands = new Map<string, string>();

// ── Messages from the panel ─────────────────────────────────────────
// Registered with figma.ui.on, not assigned to figma.ui.onmessage: a script
// run through execute_figma gets the same figma object and could otherwise
// call this handler directly and act as the designer.
const onPanelMessage = async (msg: any) => {
  if (handleWindowMessage(msg)) return;

  // The panel announces itself when it loads and reports its relay link, so
  // a panel replaced or cut off during a command can be noticed
  if (msg.type === "panel-hello") {
    notePanelBoot(msg.relayConnected === true);
    return;
  }
  if (msg.type === "relay-state") {
    noteRelayState(msg.connected === true);
    return;
  }

  // A script can replace the panel and post as it. While one runs, and for a
  // moment after, messages only the designer may send are not applied.
  if (isDesignerOnlyMessage(msg.type)) {
    const verdict = panelVerdict(msg.type);
    if (!verdict.accept) {
      postLaw([{ kind: "panel_message_refused", message: msg.type, reason: verdict.reason }]);
      return;
    }
  }

  if (msg.type === "save-settings") {
    const patch = (msg.settings ?? {}) as Params;
    const walls: PanelWallPatch = {};
    if (isConfirmLevel(patch.confirmLevel)) walls.confirmLevel = patch.confirmLevel;
    if (typeof patch.allowCodeExec === "boolean") walls.allowCodeExec = patch.allowCodeExec;
    commitFromPanel(walls);
    const others: Params = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!WALL_SETTING_FIELDS.has(key)) others[key] = value;
    }
    if (Object.keys(others).length > 0) await persistOtherSettings(others);
    return;
  }

  if (msg.type === "approval-response") {
    approvalGate.answer(
      msg.id as string,
      msg.approved === true,
      typeof msg.reason === "string" ? msg.reason : undefined
    );
    return;
  }

  if (msg.type === "memory-record") {
    try {
      noteVoiceWrite();
      await recordPrecedent({ text: msg.text, kind: msg.kind, source: "manual" });
    } catch (error) {
      figma.ui.postMessage({
        type: "memory-op-result",
        op: "record",
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (msg.type === "memory-remove") {
    try {
      noteVoiceWrite();
      removePrecedentById(msg.id as string);
    } catch {
      // Entry already gone — panel state refresh follows regardless
    }
    return;
  }

  if (msg.type === "guards-set") {
    commitFromPanel({ guards: Array.isArray(msg.pages) ? (msg.pages as string[]) : [] });
    return;
  }

  if (msg.type === "guards-refresh") {
    refreshGuardsUI();
    return;
  }

  if (msg.type === "ruleset-op") {
    // Panel ruleset actions route through the same handlers agents use; the
    // panel keeps the kit card open until the result arrives.
    const op = msg.op as RulesetOp;
    try {
      noteVoiceWrite();
      const name = typeof msg.name === "string" ? msg.name : undefined;
      let restored: RestoreResult | null = null;
      if (op === "save-from-file") await dispatch("save_ruleset", { name, fromFile: true });
      else if (op === "link") {
        const out = (await dispatch("link_ruleset", { name, restore: msg.restore === true })) as {
          restored: RestoreResult | null;
        };
        restored = out.restored;
      } else if (op === "unlink") await dispatch("unlink_ruleset", {});
      else if (op === "restore")
        restored = (await dispatch("restore_from_ruleset", { force: msg.force === true })) as RestoreResult;
      else if (op === "push") await dispatch("push_to_ruleset", {});
      else if (op === "delete") await dispatch("delete_ruleset", { name });
      else if (op === "set-auto") await dispatch("save_ruleset", { name, autoRestore: msg.autoRestore === true });
      else if (op === "export") {
        const out = (await dispatch("export_ruleset", { name })) as { name: string; markdown: string };
        figma.ui.postMessage({ type: "ruleset-export", name: out.name, markdown: out.markdown });
      } else if (op === "import") {
        await dispatch("import_ruleset", { markdown: msg.markdown });
      }
      const skipped = restored?.precedentsSkipped;
      figma.ui.postMessage({
        type: "ruleset-op-result",
        op,
        ok: true,
        ...(skipped ? { precedentsSkipped: { count: skipped.count, limit: skipped.limit } } : {}),
      });
    } catch (error) {
      // A refused push or restore carries why, for the kit card
      const refusal = (error as { refusal?: unknown } | null)?.refusal;
      figma.ui.postMessage({
        type: "ruleset-op-result",
        op,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        ...(refusal && typeof refusal === "object" ? { refusal } : {}),
      });
      void postRulesetState();
    }
    return;
  }

  if (msg.type === "memory-promote") {
    try {
      noteVoiceWrite();
      const out = (await dispatch("promote_precedent", { id: msg.id })) as { ruleset: string };
      figma.notify(`Promoted into ruleset "${out.ruleset}"`);
    } catch (error) {
      figma.ui.postMessage({
        type: "memory-op-result",
        op: "promote",
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        id: msg.id as string,
      });
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
      commitFromPanel({ guards: [...new Set([...readGuards().pages, ...proposal.pages.map((p) => p.id)])] });
      const names = proposal.pages.map((p) => p.name).join(", ");
      try {
        noteVoiceWrite();
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
      // With a selection, lock to it. With none, lock to the page the designer
      // is standing on — a PAGE cannot be selected in Figma, so this is the
      // only way to say "only this page". isInLockedScope already walks the
      // ancestor chain up to the page, so the check itself is unchanged.
      const sel = figma.currentPage.selection;
      const ids = sel.length > 0 ? sel.map((n) => n.id) : [figma.currentPage.id];
      const names =
        sel.length > 0 ? sel.slice(0, 3).map((n) => n.name) : [figma.currentPage.name];
      commitFromPanel({ scopeLock: { ids, names } });
    } else {
      commitFromPanel({ scopeLock: null });
    }
    figma.ui.postMessage({
      type: "scope-lock-state",
      ...scopeLockState(),
      page: figma.currentPage.selection.length === 0,
    });
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
    approvalGate.answer(msg.id as string, false, undefined, "stop");
    // A running command can only stop where its handler checks between
    // items, so tell the server the Stop arrived; the real result follows.
    const running = runningCommands.get(msg.id as string);
    if (running) {
      sendProgressUpdate({
        commandId: msg.id as string,
        commandType: running,
        status: "cancel_requested",
        progress: 0,
        totalItems: 0,
        processedItems: 0,
        message: "Stop requested by the designer; the command's own result follows",
      });
    }
    return;
  }

  if (msg.type === "execute-command") {
    const { id, command, params } = msg;
    const call = msg.call as WsCallInfo | undefined;
    // A malformed message without a string command is not a write; it is
    // refused below as an unknown command
    const write = typeof command === "string" && isWriteCommand(command, params || {});
    let phase: Phase = "preflight";

    // The file name rides failures too, so the server can name the file on
    // every receipt, not only on successes
    const refuse = (error: RelaiError) =>
      figma.ui.postMessage({
        type: "command-error",
        id,
        error: { ...toErrorPayload(error, { phase, write, command }), file: figma.root.name },
      });

    // What the walls did around this command, for the panel and the result
    const notices: LawNotice[] = [];
    const panelBefore = probePanel();
    const closeNotices = (): LawNotice[] => {
      notices.push(...collectNotices());
      const lost = panelLost(panelBefore);
      if (lost) notices.push(lost);
      postLaw(notices, id, typeof command === "string" ? command : undefined);
      return notices;
    };

    try {
      if (!hasHandler(command)) {
        refuse(
          new RelaiError(
            "unknown_command",
            `Unknown command: ${command}. The plugin may be older than the server; update the plugin.`
          )
        );
        return;
      }

      // Checked against the live file name, before the designer is asked
      const wrongFile = checkExpectedFile(call, figma.root.name);
      if (wrongFile) {
        refuse(wrongFile);
        return;
      }

      const shape = command === "batch_execute" ? batchApproval("open", params?.commands, SHAPE_RULES) : null;
      if (shape?.tooDeep) {
        refuse(
          new RelaiError(
            "invalid_params",
            `batch_execute nests deeper than ${MAX_BATCH_DEPTH} levels. Flatten the batch and send it again.`
          )
        );
        return;
      }

      // Storage against the plugin's copy, before anything is judged: a
      // write a script left behind on a timer is put back here
      notices.push(...(await checkpoint("entry")));

      const runsCode = command === "execute_code" || (shape?.codeRuns ?? 0) > 0;
      if (runsCode && !currentWalls().allowCodeExec) {
        refuse(codeExecDisabled());
        closeNotices();
        return;
      }

      const pre = preflight(command, params || {});

      if (needsApproval(currentWalls().confirmLevel, command, params ?? {})) {
        const verdict = await approvalGate.request(id, command, params ?? {}, cardPrecedents(pre));
        figma.ui.postMessage({
          type: "approval-settled",
          id,
          approved: verdict.verdict === "approved",
          cause: verdict.verdict === "approved" ? "designer" : verdict.cause,
        });
        if (verdict.verdict === "denied") {
          refuse(denialError(verdict.cause));
          closeNotices();
          return;
        }
      }

      // Handlers that size their result for the server (execute_code, and
      // batch_execute passing it on) read the protocol from here
      const protocol = typeof call?.protocol === "number" ? call.protocol : 1;
      const dispatchParams = protocol >= 2 ? { ...(params || {}), callProtocol: protocol } : params || {};

      phase = "handler";
      runningCommands.set(id, command);
      beginCommand();
      // Scripts: fingerprint the voice data before, check every wall after,
      // and treat the panel as possibly impersonated meanwhile
      let voicePre: VoiceSnap | null = null;
      if (runsCode) {
        voicePre = snapshotVoice();
        if (anyWrapped(command, params || {}, (c) => VOICE_COMMAND.test(c))) noteVoiceWrite();
        scriptStarted();
      }
      let result: unknown;
      try {
        result = await dispatch(command, dispatchParams);
      } finally {
        endCommand();
        runningCommands.delete(id);
        if (voicePre) {
          scriptEnded();
          notices.push(...(await checkpoint("after_code", voicePre)));
        }
      }
      phase = "after";
      clearCancelled(params?.commandId as string | undefined);

      // In-band surfacing: this file's own precedents ride the result. Those
      // matched before the write come first; a write that matched nothing
      // then is checked again against the file after it.
      result = attachPrecedents(command, params || {}, attachPreflight(result, pre));

      // Auto-evidence marker: big writes leave a flag in the feed + session
      // log so the batch is findable later (checkpoint/verify are the agent's
      // follow-up; the marker is the designer's breadcrumb).
      const touched =
        command === "batch_execute" && Array.isArray(params?.commands)
          ? (params.commands as unknown[]).length
          : collectNodeRefs(params || {}).length;
      if (write && touched >= 10) {
        pushEvent({ type: "bulk_write", ts: Date.now(), command, count: touched } as never);
        figma.ui.postMessage({ type: "evidence-marker", command, count: touched });
      }

      // Session timeline: every write lands in the per-machine ring buffer
      if (write) {
        void appendWriteLog(command, collectNodeRefs(params || {}), true, touched);
      }
      if (CHECKUP_COMMANDS.has(command)) void stampCheckup();

      const law = closeNotices();
      result = withLaw(result, law);
      const violations =
        result !== null && typeof result === "object" && Array.isArray((result as Params).violations)
          ? (result as Params).violations
          : undefined;

      // Piggyback designer activity that happened since the last command
      const events = drainEvents();
      figma.ui.postMessage({
        type: "command-result",
        id,
        result,
        meta: resultMeta(command, write, result, figma.root.name),
        ...(law.length > 0 ? { law } : {}),
        ...(violations ? { violations } : {}),
        ...(events.length > 0 ? { events } : {}),
      });
    } catch (error) {
      const payload = toErrorPayload(error, { phase, write, command });
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
      if (write) {
        void appendWriteLog(command, collectNodeRefs(params || {}), false);
      }
      closeNotices();
      // The activity feed records the failure; no toast on top of it
      figma.ui.postMessage({
        type: "command-error",
        id,
        error: { ...payload, nodeId, nodeType, file: figma.root.name },
      });
    }
  }
};
figma.ui.on("message", onPanelMessage);

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

// A script that cleared a no-go zone and then closed the plugin leaves it
// cleared unless it is put back here, synchronously
figma.on("close", () => {
  checkOnClose();
});
