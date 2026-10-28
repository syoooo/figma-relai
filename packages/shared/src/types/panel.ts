// Wall notices and the plugin ↔ panel messages that carry them.
//
// The plugin enforces the designer's walls (no-go zones, the confirmation
// dial, the scope lock, the code-execution toggle) and keeps the authoritative
// copy in its own closure. This file fixes the shapes it uses to tell the
// panel, and the agent, what the walls did. `LawNotice` and `Violation` also
// ride command results across the relay, so the server reads them too.
//
// Compatibility rules are those of call.ts: adding an optional field or a
// union member is not breaking; renaming or removing one is. The plugin and
// its panel ship in one bundle, so panel-only messages need no fallback for
// mixed versions, but fields that reach the server do.

// ── Shared vocabulary ───────────────────────────────────────────────

/** The confirmation dial. Each stop includes the ones before it. */
export type ConfirmLevel = "open" | "risk" | "bulk" | "all";

/** A page by id, with the name it had when the message was built. */
export interface PageRef {
  id: string;
  name: string;
}

/** Wall settings that live in plugin storage (no-go zones live in the file). */
export type WallField = "confirmLevel" | "allowCodeExec" | "scopeLock";

/**
 * File data that states what the designer said rather than what agents may
 * do: precedents, conventions, the conventions timestamp and the ruleset
 * link. Changes to these are reported, never reverted.
 */
export type VoiceKey = "memory" | "conventions" | "conventionsAt" | "rulesetLink";

/** A cheap fingerprint of a stored string: its length and FNV-1a hash. */
export interface Fingerprint {
  len: number; // string length in UTF-16 code units
  fnv: string; // 32-bit FNV-1a over the UTF-16 code units, 8 lowercase hex digits
}

/**
 * Who changed a wall the plugin then put back.
 * - `code`: found right after an `execute_figma` script finished, so the
 *   script (or something it started) did it.
 * - `unknown`: found at a later check (the next command, or closing the
 *   plugin): a delayed script write, another plugin, or a collaborator.
 */
export type LawChangeSource = "code" | "unknown";

/** Panel messages only the designer may send; refused while a script may be posing as the panel. */
export type DesignerOnlyMessageType =
  | "save-settings"
  | "approval-response"
  | "guards-set"
  | "proposal-response"
  | "scope-lock";

// ── Violations and notices ──────────────────────────────────────────

/**
 * Nodes a script reached across a wall. Scripts cannot be stopped up front,
 * so this is found after the script ran and the change is already in the
 * file. Found only among nodes Relai can see (ones it created and ids the
 * script returned).
 */
export interface Violation {
  kind: "guard" | "scope"; // guard: on a no-go page; scope: outside the scope lock
  count: number; // how many such nodes were found
  nodeIds: string[]; // up to 20 of them, in the order found
  pages?: PageRef[]; // guard only: the no-go pages those nodes sit on
}

/**
 * One thing the walls did that the designer should see and the agent should
 * know about. Sent to the panel in a `law-notice` message and attached to
 * command results as `law`.
 */
export type LawNotice =
  // Storage held a looser no-go list than the plugin's own copy; these pages
  // were written back. `pages` are the pages put back.
  | { kind: "law_restored"; key: "guards"; pages: PageRef[]; by: LawChangeSource }
  // This file's stored wall settings differed from the plugin's own copy and
  // were rewritten. `fields` are the ones that differed.
  | { kind: "law_restored"; key: "settings"; fields: WallField[]; by: LawChangeSource }
  // A script changed file data in the voice set; nothing was reverted.
  | { kind: "law_edited_by_code"; key: VoiceKey; before: Fingerprint; after: Fingerprint }
  // Storage held a stricter no-go list (pages added elsewhere, such as by a
  // collaborator); the plugin adopted it. `pages` are the pages adopted.
  | { kind: "law_tightened_outside"; key: "guards"; pages: PageRef[] }
  // This file's stored settings were stricter than the plugin's copy; the
  // plugin adopted them. The scope lock is never adopted from storage.
  | { kind: "law_tightened_outside"; key: "settings"; fields: Array<"confirmLevel" | "allowCodeExec"> }
  // A script reached nodes across a wall. The change stays; this names it.
  | { kind: "script_breach"; violations: Violation[] }
  // Across a command, the panel was reloaded or its relay link dropped. A
  // script can replace the panel; when that happens the command's outcome is
  // reported as unknown and the designer has to reopen the plugin.
  | { kind: "panel_lost"; panelReloaded: boolean; relayDropped: boolean }
  // A designer-only panel message arrived while a script was running or had
  // just finished, so it was not applied. The designer may repeat it.
  | {
      kind: "panel_message_refused";
      message: DesignerOnlyMessageType;
      reason: "script_running" | "script_cooldown";
    };

/** Fields a command result may carry about the walls (they also cross the relay). */
export interface WallResultFields {
  law?: LawNotice[]; // what the walls did around this command; absent when nothing
  violations?: Violation[]; // execute_figma: nodes the script reached across a wall
  precedentsMatched?: "before_write"; // present when `precedents` were matched against the file before the write
}

// ── Plugin → panel ──────────────────────────────────────────────────

/**
 * A wall notice for the activity feed. Notices stay in the feed until the
 * designer dismisses them; they are not toasts.
 */
export interface LawNoticeMessage {
  type: "law-notice";
  commandId?: string; // the command the notices belong to; absent for checks outside a command (closing, loading)
  command?: string; // that command's name
  notices: LawNotice[]; // never empty
}

/** Why an approval card closed without the designer approving it. */
export type ApprovalCause = "designer" | "timeout" | "stop";

/** Shows an approval card that counts down to its timeout. */
export interface ApprovalRequestMessage {
  type: "approval-request";
  id: string; // the command's request id
  command: string;
  scale: string; // the card's scale line (node count, batch size, why it asks)
  intent: string; // the agent's stated intent, or "" when it gave none
  timeoutMs: number; // how long the card waits before it is denied automatically
  deadline: number; // Date.now() in the plugin when the card times out (plugin and panel share the machine's clock)
  precedents?: string[]; // up to 2 precedent texts the command matched before the write, each at most 160 characters
}

/** An approval card closed. */
export interface ApprovalSettledMessage {
  type: "approval-settled";
  id: string;
  approved: boolean;
  cause: ApprovalCause; // what closed it; `designer` for both approve and deny from the card
}

/** The command's result arrives with what the panel needs to style its feed row. */
export interface CommandResultWallFields {
  violations?: Violation[]; // the row settles as a law row, not a plain success
  law?: LawNotice[]; // same notices as the result's `law`; the row links to the law-notice entry
}

/** This file's walls as the plugin resolved them. */
export interface PanelWalls {
  confirmLevel: ConfirmLevel;
  allowCodeExec: boolean;
  // true when this file has its own entry; false when the values are the
  // default carried over from the last file the designer changed them in
  perFile: boolean;
}

/** The ruleset was restored automatically when the plugin opened (a merge had wiped the file's law). */
export interface RulesetHealed {
  name: string; // the ruleset (kit) name
  kitUpdatedAt?: string; // ISO date of the kit that was restored; absent when the kit has none
  precedentsSkipped?: { count: number; limit: number }; // seed precedents left out because file memory was full
}

/**
 * Fields of the `init-settings` message added for walls and notices. The
 * message's other fields are unchanged. `settings.confirmLevel` and
 * `settings.allowCodeExec` carry the same values as `walls`, so a panel that
 * reads them still shows this file's walls.
 */
export interface InitSettingsWallFields {
  walls: PanelWalls;
  rulesetHealed: RulesetHealed | null; // was the healed kit's name as a string, or null
}

/** Why a kit push or restore was refused; shown in place on the kit card. */
export type KitRefusal =
  // The kit moved since this file last synced: pushing would overwrite someone else's push
  | {
      code: "kit_lease";
      kit: string;
      kitChars: number;
      kitUpdatedAt: string; // ISO timestamp
      updatedBy?: string; // file name of the last writer, when the kit recorded one
      fileChars: number;
    }
  // The file's conventions are newer than the kit: restoring would lose them
  | {
      code: "kit_older";
      kit: string;
      kitChars: number;
      kitUpdatedAt: string;
      fileChars: number;
      fileUpdatedAt: string;
    };

export type RulesetOp =
  | "save-from-file"
  | "link"
  | "unlink"
  | "restore"
  | "push"
  | "delete"
  | "set-auto"
  | "export"
  | "import";

/** The result of a ruleset action the panel started; the kit card waits for it before closing. */
export type RulesetOpResultMessage =
  | {
      type: "ruleset-op-result";
      op: RulesetOp;
      ok: true;
      precedentsSkipped?: { count: number; limit: number }; // link or restore left seed precedents out
    }
  | {
      type: "ruleset-op-result";
      op: RulesetOp;
      ok: false;
      refusal?: KitRefusal; // present when the kit guard refused; otherwise only `message`
      message: string; // the handler's error text, unchanged
    };

/** A precedent action from the memory dialog failed; shown inline under its input or row. */
export interface MemoryOpResultMessage {
  type: "memory-op-result";
  op: "record" | "promote";
  ok: false;
  message: string;
  id?: string; // promote: the precedent the error belongs to
}

/**
 * Why a write-log entry did not run, for the history view. Stored in plugin
 * storage across versions; older entries have none.
 * - `denied`: the designer declined the approval card.
 * - `timeout`: nobody answered the card in time.
 * - `stopped`: Stop was pressed.
 * - `undelivered`: it ran, but the result could not reach the agent.
 */
export type WriteLogWhy = "denied" | "timeout" | "stopped" | "undelivered";
