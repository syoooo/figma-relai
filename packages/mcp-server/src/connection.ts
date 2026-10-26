import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.js";
import { RequestTracker } from "./request-tracker.js";
import {
  PROTOCOL_VERSION,
  RelaiError,
  inferLegacyCode,
  isErrorCode,
  type CallReceipt,
  type CommandProgressUpdate,
  type ErrorCode,
  type FigmaCommand,
  type Outcome,
  type PeerMeta,
  type PluginErrorPayload,
  type ResultMeta,
  type RetryClass,
  type RoomSummary,
  type WsCallInfo,
} from "@figma-relai/shared";

export interface FigmaConnectionOptions {
  // Room restored from persisted state; used to auto-pair on the first command
  initialRoom?: string | null;
  // Called whenever a room is joined so the caller can persist it
  onRoomChanged?: (room: string) => void;
  // Called before each reconnect attempt (e.g. to take over relay hosting)
  beforeReconnect?: () => Promise<void>;
  // Whether this process hosts the relay right now. Only used to explain a
  // dropped link; without it the explanation leaves hosting out.
  isHost?: () => boolean;
}

/**
 * Where one call should go. Neither field moves the session's default room
 * or touches the persisted state.
 * - `room`: send this call to that room's plugin instead of the default room.
 * - `expectFile`: refuse unless the target plugin's file name is exactly this
 *   (compared after NFC normalization).
 */
export interface CallTarget {
  room?: string;
  expectFile?: string;
}

/** One plugin command as it was sent and settled. */
export interface CommandReceipt extends CallReceipt {
  room: string;
  // The plugin's live file name when it reported one, else the name it joined with
  file?: string;
  partial?: boolean;
}

/** What join_room learned about the room it joined. */
export interface JoinReport {
  room: string;
  pluginPresent: boolean;
  file?: string;
  // The main file's name when the room's file is one of its branches. Known
  // only after the file's identity was resolved, so its absence proves nothing.
  branchOf?: string;
}

const LINK_DROPPED_BEFORE_ANSWER = "The link to the relay dropped";
const OUTCOMES: readonly string[] = ["applied", "not_applied", "unknown"];
const RETRY_CLASSES: readonly string[] = ["retryable", "read_canvas_first", "fix_input", "needs_human"];

// Receipts of commands that were sent and then failed, keyed by the error
const failureReceipts = new WeakMap<object, CommandReceipt>();

/**
 * The receipt of the command behind a failed sendCommandDetailed, or
 * undefined when the call failed before anything was sent.
 */
export function receiptOf(error: unknown): CommandReceipt | undefined {
  return typeof error === "object" && error !== null ? failureReceipts.get(error) : undefined;
}

// Flatten a plugin error (string or structured object) into one readable line
export function formatFigmaError(e: unknown): string {
  if (typeof e === "string") return e;
  const { message, command, nodeId, nodeType } = (e ?? {}) as Partial<PluginErrorPayload>;
  const prefix = command ? `[${command}] ` : "";
  const suffix = nodeId
    ? ` (node ${nodeId}${nodeType ? `, type ${nodeType}` : ""})`
    : "";
  return `${prefix}${message ?? JSON.stringify(e)}${suffix}`;
}

/**
 * Turn the plugin's error into a RelaiError with the same text. A plugin on
 * the call contract names its code; an older one is classified by wording,
 * and anything unrecognised counts as possibly applied.
 */
export function pluginError(payload: unknown): RelaiError {
  const message = formatFigmaError(payload);
  const p = (typeof payload === "object" && payload !== null ? payload : {}) as Partial<PluginErrorPayload>;
  if (isErrorCode(p.code)) {
    return new RelaiError(p.code, message, {
      outcome: OUTCOMES.includes(p.outcome as string) ? (p.outcome as Outcome) : undefined,
      retry: RETRY_CLASSES.includes(p.retry as string) ? (p.retry as RetryClass) : undefined,
      partial: p.partial === true,
    });
  }
  const legacy = inferLegacyCode(typeof payload === "string" ? payload : (p as PluginErrorPayload));
  return new RelaiError(legacy.code, message, { outcome: legacy.outcome, retry: legacy.retry });
}

// Route a response message to its pending request. Error responses have no
// `result` field, so the error check must come first and resolution must key
// on field presence — falsy results (0, "", false) are valid.
export function routeResponse(
  response: { id?: string; result?: unknown; error?: unknown; meta?: ResultMeta } | undefined,
  tracker: RequestTracker,
  onMeta?: (id: string, meta: ResultMeta) => void
): void {
  if (!response?.id || !tracker.has(response.id)) return;
  if (response.error !== undefined) {
    tracker.reject(response.id, pluginError(response.error));
  } else if ("result" in response) {
    if (response.meta && onMeta) onMeta(response.id, response.meta);
    tracker.resolve(response.id, response.result, response.meta);
  }
}

// Two file names name the same file when they match after NFC normalization
function sameFile(a: string, b: string): boolean {
  return a.normalize("NFC") === b.normalize("NFC");
}

function describeRoom(room: string, file: string | undefined): string {
  return file ? `"${file}" (room ${room})` : `room ${room}`;
}

/**
 * Given the room that went quiet and who the relay says is live, decide where
 * to re-pair. Pure so the decision can be tested without a relay.
 */
export function chooseRepairRoom(
  staleRoom: string | null,
  rooms: RoomSummary[]
):
  | { room: string; error?: undefined; code?: undefined }
  | { room?: undefined; error: string; code: ErrorCode } {
  const withPlugin = rooms.filter((r) => r.hasPlugin && r.room !== staleRoom);
  if (withPlugin.length === 1) return { room: withPlugin[0].room };
  if (withPlugin.length === 0) {
    return {
      code: "plugin_absent",
      error:
        "The Figma plugin is not open. Open the Relai plugin in Figma — it will reconnect automatically.",
    };
  }
  return {
    code: "room_ambiguous",
    error: `The plugin left room ${staleRoom} and several are now connected: ${withPlugin
      .map((r) => describeRoom(r.room, r.fileName))
      .join(", ")}. Call join_room with the one you want.`,
  };
}

// Manages WebSocket connection to the relay server
export class FigmaConnection {
  private ws: WebSocket | null = null;
  private currentRoom: string | null = null;
  private tracker = new RequestTracker();
  private wsUrl: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private connectPromise: Promise<void> | null = null;
  private commandHandler: ((command: string, params: unknown) => void) | null = null;
  private options: FigmaConnectionOptions;
  private relayVerified = false;
  // Presence recorded per room: join-time broadcasts can arrive before
  // currentRoom is updated, so keying by room avoids the ordering race
  private presenceByRoom = new Map<string, boolean>();
  // The last metadata each room's plugin joined with (file name, protocol).
  // Kept after the plugin leaves, so a re-pair can tell whether the plugin
  // came back on the same file.
  private pluginMetaByRoom = new Map<string, PeerMeta>();
  // File identities the plugin reported in each room, for join_room's branchOf
  private identityByRoom = new Map<string, { fileName: string; branchName?: string }>();
  // Rooms the current socket has joined at the relay. Cleared on close: the
  // relay forgets them, and a room a single call names is joined again on use.
  private joinedRooms = new Set<string>();
  // Plugin commands on the wire, so a dropped link can be reported per call
  private inflight = new Set<string>();
  private resultMetaById = new Map<string, ResultMeta>();
  // Did the caller NAME this room, or did we pick it for them? A room the
  // caller aimed at is never traded for a different one — they may be waiting
  // for that file to open, and silently following the only live plugin would
  // send their writes into somebody else's file.
  private roomWasChosenByCaller = false;
  // Designer activity piggybacked on plugin responses (selection changes etc.)
  private eventQueue: unknown[] = [];

  constructor(
    serverUrl: string = "localhost",
    port: number = 9055,
    options: FigmaConnectionOptions = {}
  ) {
    const protocol = serverUrl === "localhost" ? "ws" : "wss";
    this.wsUrl =
      serverUrl === "localhost"
        ? `${protocol}://${serverUrl}:${port}`
        : `${protocol}://${serverUrl}`;
    this.options = options;
  }

  // Connect to WebSocket relay server
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.info("Already connected to relay");
      return Promise.resolve();
    }

    // If already connecting, return existing promise
    if (this.connectPromise) {
      return this.connectPromise;
    }

    logger.info(`Connecting to relay at ${this.wsUrl}...`);

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      const cleanup = () => {
        this.connectPromise = null;
      };

      ws.on("open", () => {
        logger.info("Connected to relay server");
        this.shouldReconnect = true;
        cleanup();
        resolve();

        // Verify we reached a Relai relay (and not some other port 9055 app)
        this.relayVerified = false;
        try {
          ws.send(JSON.stringify({ type: "hello" }));
        } catch {
          // Send failure surfaces via close/error handlers
        }
        setTimeout(() => {
          if (!this.relayVerified && this.ws === ws) {
            logger.warn(
              "Connected endpoint did not identify as a figma-relai relay — is another app using the port?"
            );
          }
        }, 1500);

        // Rejoin the previous room after a relay restart / reconnect so the
        // AI doesn't land in a silent "must join a room" dead state
        if (this.currentRoom) {
          const room = this.currentRoom;
          this.relayJoin(room).then(
            () => logger.info(`Rejoined room: ${room}`),
            (err) =>
              logger.warn(
                `Failed to rejoin room ${room}: ${err instanceof Error ? err.message : String(err)}`
              )
          );
        }
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const json = JSON.parse(data.toString());

          // Relay identity probe response
          if (json.type === "hello" && json.server === "figma-relai") {
            this.relayVerified = true;
            logger.debug(`Relay verified (version ${json.version})`);
            return;
          }

          // Peer presence per room (is the plugin there, and on which file?)
          if (json.type === "presence") {
            if (typeof json.room === "string" && Array.isArray(json.peers)) {
              const plugin = json.peers.find((p: { role?: string }) => p.role === "plugin") as
                | { meta?: PeerMeta }
                | undefined;
              this.presenceByRoom.set(json.room, plugin !== undefined);
              if (plugin?.meta) this.pluginMetaByRoom.set(json.room, plugin.meta);
            }
            return;
          }

          // Room listing response (auto-pairing)
          if (json.type === "list_rooms_result" && json.id) {
            this.tracker.resolve(json.id, json.rooms ?? []);
            return;
          }

          // Handle incoming commands (from plugin UI broadcasts)
          if (json.type === "broadcast" && json.message?.command) {
            this.commandHandler?.(json.message.command, json.message.params);
            return;
          }

          // Handle progress updates
          if (json.type === "progress_update") {
            const progressData = json.message?.data as CommandProgressUpdate;
            const requestId = json.id || "";

            if (requestId && this.tracker.has(requestId) && progressData?.status === "cancel_requested") {
              // Both the panel and the plugin report a Stop; the first one
              // starts the grace period and the second changes nothing
              this.tracker.markCancelRequested(requestId);
              logger.info(`Stop requested for ${progressData.commandType}; waiting for its result`);
            } else if (requestId && this.tracker.has(requestId)) {
              this.tracker.resetTimeout(requestId);
              logger.info(
                `Progress: ${progressData.commandType} ${progressData.progress}% - ${progressData.message}`
              );
            }
            return;
          }

          // Collect designer-activity events piggybacked on responses — only
          // on responses to this process's own requests. This socket can sit
          // in several rooms, and other clients' results are broadcast to it
          // too; their events belong to someone else's session.
          if (
            Array.isArray(json.message?.events) &&
            typeof json.message.id === "string" &&
            this.tracker.has(json.message.id)
          ) {
            this.eventQueue.push(...json.message.events);
            if (this.eventQueue.length > 50) {
              this.eventQueue = this.eventQueue.slice(-50);
            }
          }

          // Handle regular responses
          routeResponse(json.message, this.tracker, (id, meta) => this.resultMetaById.set(id, meta));
        } catch (error) {
          logger.error(
            `Error parsing message: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      });

      ws.on("error", (error) => {
        logger.error(`WebSocket error: ${error.message}`);
        cleanup();
        reject(error);
      });

      ws.on("close", (code: number) => {
        logger.info(`Disconnected from relay (close code ${code})`);
        this.ws = null;
        this.joinedRooms.clear();
        // Presence comes back with the rejoin; a plugin that left while the
        // link was down must not still read as present
        this.presenceByRoom.clear();
        // A command that was already on the wire may have run to completion in
        // Figma before the socket dropped — so say so instead of implying it
        // failed. Retrying a write on the caller's behalf could apply it twice.
        const hosting = this.options.isHost?.();
        const takeover =
          hosting === false
            ? " If the client that hosted the relay exited, this process takes over hosting in about 2 seconds."
            : "";
        for (const id of this.inflight) {
          this.tracker.reject(
            id,
            new RelaiError(
              "link_dropped",
              `The link to Figma dropped (close code ${code}) while this command was in flight — it may already have applied. ` +
                `Re-read the file before retrying (the server reconnects on its own within a few seconds).${takeover}`
            )
          );
        }
        this.inflight.clear();
        // What is left are requests the relay itself answers (joins, room
        // listings); nothing in Figma depends on them
        this.tracker.rejectAll(`${LINK_DROPPED_BEFORE_ANSWER} (close code ${code}) before it answered.`);
        cleanup();

        // Only auto-reconnect if not manually disconnected. beforeReconnect
        // lets the host process try to re-bind the relay port first (host
        // takeover when the previous hosting MCP server exited).
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(async () => {
            try {
              await this.options.beforeReconnect?.();
            } catch {
              // Takeover failure is fine; we may connect to another host
            }
            this.connect().catch(() => {});
          }, 2000);
        }
      });
    });

    return this.connectPromise;
  }

  // Disconnect and stop reconnection
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Connect if needed. The relay host may have just exited (port-handoff race
  // on rapid server restarts): try to take over hosting, then dial once more.
  private async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    try {
      await this.connect();
    } catch {
      try {
        await this.options.beforeReconnect?.();
      } catch {
        // Takeover failure is fine; the retry below may reach another host
      }
      try {
        await this.connect();
      } catch {
        throw new RelaiError(
          "not_connected",
          "Not connected to the relay. The MCP server hosts it automatically — if this persists, another app may be occupying the port."
        );
      }
    }
  }

  // A request the relay answers itself (join, list_rooms). Its failures change
  // nothing in Figma, so a timeout or a dropped link reads as an unresponsive relay.
  private relayRequest<T>(id: string, payload: Record<string, unknown>, timeoutMs: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.tracker.add(id, resolve as (value: unknown) => void, (err: unknown) => {
        const dropped = err instanceof Error && err.message.startsWith(LINK_DROPPED_BEFORE_ANSWER);
        reject(
          new RelaiError(
            "relay_unresponsive",
            dropped
              ? `${err.message} Nothing changed in Figma.`
              : `The relay did not answer ${what} in time. Nothing changed in Figma.`
          )
        );
      }, timeoutMs, "relay_unresponsive");
      try {
        this.ws!.send(JSON.stringify(payload));
      } catch (err) {
        this.tracker.reject(id, err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // Join a room at the relay without making it the default room
  private async relayJoin(room: string): Promise<void> {
    const id = uuidv4();
    await this.relayRequest(
      id,
      {
        id,
        type: "join",
        room,
        role: "agent",
        meta: { client: "figma-relai-mcp" },
        message: { id, command: "join", params: { room, commandId: id } },
      },
      30000,
      `the join to room ${room}`
    );
    this.joinedRooms.add(room);
  }

  // Make a room the session's default and persist it
  private async moveTo(room: string, chosenByCaller: boolean): Promise<void> {
    await this.ensureConnected();
    this.roomWasChosenByCaller = chosenByCaller;
    await this.relayJoin(room);
    this.currentRoom = room;
    this.options.onRoomChanged?.(room);
    logger.info(`Joined room: ${room}`);
  }

  // Join a room as the session's default and report which file is there
  async joinRoom(roomName: string, chosenByCaller = true): Promise<JoinReport> {
    await this.moveTo(roomName, chosenByCaller);
    return this.roomReport(roomName);
  }

  private async roomReport(room: string): Promise<JoinReport> {
    // The relay's listing is the truth; presence for a room joined a moment
    // ago may still be on its way. A failed listing doesn't undo the join.
    const rooms = await this.listRooms().catch(() => null);
    const live = rooms?.find((r) => r.room === room);
    const pluginPresent = rooms ? live?.hasPlugin === true : this.presenceByRoom.get(room) === true;
    const file = pluginPresent ? live?.fileName || this.knownFile(room) : undefined;
    const identity = this.identityByRoom.get(room);
    const branchOf =
      file && identity?.branchName && sameFile(identity.branchName, file) ? identity.fileName : undefined;
    return { room, pluginPresent, ...(file ? { file } : {}), ...(branchOf ? { branchOf } : {}) };
  }

  // The file name a room's plugin last joined with, if it reported one
  private knownFile(room: string | null): string | undefined {
    if (!room) return undefined;
    const name = this.pluginMetaByRoom.get(room)?.fileName;
    return typeof name === "string" && name !== "" ? name : undefined;
  }

  // Ask the relay which rooms exist and who is in them
  async listRooms(): Promise<RoomSummary[]> {
    await this.ensureConnected();
    const id = uuidv4();
    return this.relayRequest<RoomSummary[]>(id, { type: "list_rooms", id }, 5000, "the room listing");
  }

  // Auto-pair with the plugin so join_room is only needed for disambiguation:
  // prefer the persisted room if its plugin is present, otherwise join the
  // single plugin room, otherwise explain exactly what to do.
  private async ensureRoom(): Promise<void> {
    if (this.currentRoom) return;

    const rooms = await this.listRooms();
    const withPlugin = rooms.filter((r) => r.hasPlugin);
    const saved = this.options.initialRoom;

    if (saved && withPlugin.some((r) => r.room === saved)) {
      return this.moveTo(saved, false);
    }
    if (withPlugin.length === 1) {
      return this.moveTo(withPlugin[0].room, false);
    }
    if (withPlugin.length === 0) {
      throw new RelaiError(
        "plugin_absent",
        "No Figma plugin is connected. Open the Relai plugin in Figma (it connects automatically), then try again."
      );
    }
    throw new RelaiError(
      "room_ambiguous",
      `Multiple Figma plugins are connected: ${withPlugin
        .map((r) => describeRoom(r.room, r.fileName))
        .join(", ")}. Call join_room with the room of the file you want to control.`
    );
  }

  /**
   * Poll the presence map briefly, then ASK.
   *
   * Presence is only ever written by a pushed `presence` event, so a plugin
   * that closes and reopens can leave the cache stuck on false: the close set
   * it, and the reopen's event never landed. Polling a cache that nothing is
   * refreshing just burns the timeout and then reports "the plugin is not
   * open" about a plugin sitting right there — while list_rooms, which asks
   * the relay instead of trusting the cache, happily lists it.
   */
  private async waitForPlugin(ms: number): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      if (!this.currentRoom || this.presenceByRoom.get(this.currentRoom) !== false) return;
    }
    if (!this.currentRoom) return;
    try {
      const rooms = await this.listRooms();
      const live = rooms.find((r) => r.room === this.currentRoom);
      if (live?.hasPlugin) this.presenceByRoom.set(this.currentRoom, true);
    } catch {
      // Unreachable relay is the caller's problem, not this cache's
    }
  }

  /**
   * The paired room went quiet. Ask the relay who is actually there and, if
   * exactly one plugin is connected, move to it.
   *
   * A plugin that is closed and reopened — or a file switched to one of its
   * branches — comes back under a NEW room name. ensureRoom() only picks a
   * room when there is none, so without this the session stays pinned to the
   * dead room and every command reports "the plugin is not open" while
   * join_room cheerfully lists the live one.
   *
   * Returns the move so the caller can tell whether the file changed with it.
   */
  private async repairPairing(): Promise<{ from: string | null; to: string; fromFile?: string; toFile?: string }> {
    const stale = this.currentRoom;
    const fromFile = this.knownFile(stale);
    let rooms: RoomSummary[] = [];
    try {
      rooms = await this.listRooms();
    } catch {
      throw new RelaiError(
        "plugin_absent",
        "The Figma plugin is not open, and the relay could not be asked which rooms are live. Open the Relai plugin in Figma and try again."
      );
    }
    const choice = chooseRepairRoom(stale, rooms);
    if (choice.room === undefined) throw new RelaiError(choice.code, choice.error);
    await this.moveTo(choice.room, false);
    logger.info(`Re-paired: ${stale} → ${choice.room} (plugin moved rooms)`);
    const toFile = rooms.find((r) => r.room === choice.room)?.fileName || this.knownFile(choice.room);
    return { from: stale, to: choice.room, fromFile, toFile };
  }

  // Pick the session's default room, following the plugin if it moved
  private async defaultRoom(target: CallTarget): Promise<string> {
    await this.ensureRoom();
    // Presence said the room has no plugin — fail fast, not a 30s timeout.
    // But a session that starts while Figma is still dialling would fail on
    // its very first question, so give the plugin a moment to appear before
    // believing the answer. Waiting costs seconds only when it is genuinely
    // absent; failing early costs the user their first command every time.
    if (this.currentRoom && this.presenceByRoom.get(this.currentRoom) === false) {
      await this.waitForPlugin(2500);
    }
    if (this.currentRoom && this.presenceByRoom.get(this.currentRoom) === false) {
      // The plugin may not be gone — it may have MOVED. Reopening it, or
      // switching to a branch (a different file), gives it a fresh room,
      // and ensureRoom() never looks again once currentRoom is set. Re-pair
      // rather than reporting "not open" about a plugin sitting right there.
      //
      // Only for a room WE picked. When the caller named it they are aiming
      // at one file, and quietly moving them to whichever plugin happens to
      // be live would land their writes in the wrong document.
      if (this.roomWasChosenByCaller) {
        throw new RelaiError(
          "plugin_absent",
          `No Figma plugin is in room ${this.currentRoom}. Open the file you want in Figma and run the plugin, or call join_room without a room to see which are live.`
        );
      }
      const move = await this.repairPairing();
      // Following the plugin is silent only while it stays on the same file.
      // A different file (a branch, another document) is where wrong-file
      // writes come from, so the first call after such a move is refused —
      // unless it already names the new file.
      const sameAsBefore = move.fromFile && move.toFile && sameFile(move.fromFile, move.toFile);
      const confirmed = target.expectFile && move.toFile && sameFile(target.expectFile, move.toFile);
      if (!sameAsBefore && !confirmed) {
        throw new RelaiError(
          "room_changed",
          `The plugin moved from ${describeRoom(move.from ?? "(none)", move.fromFile)} to ${describeRoom(move.to, move.toFile)}, ` +
            "which is not the same file. Nothing was sent. Send the call again to continue in that file, or pass expect_file with its name."
        );
      }
    }
    // Right after a reconnect the rejoin may still be on its way
    if (!this.joinedRooms.has(this.currentRoom!)) await this.relayJoin(this.currentRoom!);
    return this.currentRoom!;
  }

  // A room a single call named: join it if needed, never re-pair away from it
  private async namedRoom(room: string): Promise<string> {
    if (!this.joinedRooms.has(room)) await this.relayJoin(room);
    if (this.presenceByRoom.get(room) !== true) {
      // Presence for a room joined a moment ago may still be on its way
      const live = (await this.listRooms()).find((r) => r.room === room);
      if (!live?.hasPlugin) {
        throw new RelaiError(
          "plugin_absent",
          `No Figma plugin is in room ${room}. Nothing was sent. Open that file's plugin, or call join_room without a room to see which are live.`
        );
      }
      this.presenceByRoom.set(room, true);
      if (live.fileName && !this.knownFile(room)) this.pluginMetaByRoom.set(room, { fileName: live.fileName });
    }
    return room;
  }

  // Refuse before sending when the room's file is not the expected one
  private async checkFile(room: string, expectFile: string): Promise<void> {
    let rooms: RoomSummary[] | null = null;
    let file = this.knownFile(room);
    if (!file) {
      rooms = await this.listRooms();
      file = rooms.find((r) => r.room === room)?.fileName || undefined;
    }
    if (!file) {
      throw new RelaiError(
        "cannot_verify_file",
        `The plugin in room ${room} did not report its file name, so expect_file "${expectFile}" cannot be checked. Nothing was sent.`
      );
    }
    if (sameFile(file, expectFile)) return;
    rooms ??= await this.listRooms().catch(() => []);
    const matches = rooms.filter((r) => r.hasPlugin && r.fileName && sameFile(r.fileName, expectFile));
    throw new RelaiError(
      "wrong_file",
      `Room ${room} is on "${file}", not "${expectFile}". Nothing was sent. ` +
        (matches.length > 0
          ? `"${expectFile}" is open in room ${matches.map((r) => r.room).join(", ")}; pass that as room.`
          : `No connected plugin is on "${expectFile}"; call join_room without a room to see which are live.`)
    );
  }

  // Send a command to Figma plugin via the relay
  async sendCommand(
    command: FigmaCommand,
    params: unknown = {},
    timeoutMs: number = 30000
  ): Promise<unknown> {
    if (command === "join") {
      await this.ensureConnected();
      await this.relayJoin((params as { room: string }).room);
      return `Connected to room: ${(params as { room: string }).room}`;
    }
    return (await this.sendCommandDetailed(command, params, timeoutMs)).result;
  }

  /**
   * Send a command and report how it settled. A failure throws a RelaiError;
   * when the command had been sent, receiptOf(error) returns its receipt.
   */
  async sendCommandDetailed(
    command: FigmaCommand,
    params: unknown = {},
    timeoutMs: number = 30000,
    target: CallTarget = {}
  ): Promise<{ result: unknown; receipt: CommandReceipt }> {
    await this.ensureConnected();

    const room = target.room ? await this.namedRoom(target.room) : await this.defaultRoom(target);
    if (target.expectFile !== undefined) await this.checkFile(room, target.expectFile);

    // The plugin rechecks the file against its live name, but only a plugin
    // on the call contract knows to; an older one would ignore the field
    const peerProtocol = this.pluginMetaByRoom.get(room)?.protocol;
    const call: WsCallInfo = {
      protocol: PROTOCOL_VERSION,
      ...(target.expectFile !== undefined && typeof peerProtocol === "number" && peerProtocol >= PROTOCOL_VERSION
        ? { expectFile: target.expectFile }
        : {}),
    };

    const id = uuidv4();
    const request = {
      id,
      type: "message",
      room,
      message: {
        id,
        command,
        params: {
          ...(params as Record<string, unknown>),
          commandId: id,
        },
        call,
      },
    };

    let result: unknown;
    try {
      result = await new Promise((resolve, reject) => {
        this.tracker.add(id, resolve, reject, timeoutMs);
        this.inflight.add(id);
        logger.info(`Sending command: ${command}`);
        logger.debug(`Request: ${JSON.stringify(request)}`);
        try {
          this.ws!.send(JSON.stringify(request));
        } catch (sendError) {
          // The command never left this process, so nothing ran
          this.tracker.reject(
            id,
            new RelaiError(
              "not_connected",
              `The command could not be sent to the relay (${sendError instanceof Error ? sendError.message : String(sendError)}). Nothing changed in Figma.`
            )
          );
        }
      });
    } catch (err) {
      // Anything that is not already coded is the tracker giving up on a
      // command that was sent, so it may have run
      const error =
        err instanceof RelaiError
          ? err
          : new RelaiError("timeout", err instanceof Error ? err.message : String(err));
      failureReceipts.set(error, {
        id,
        command,
        room,
        outcome: error.outcome,
        code: error.code,
        ...(error.partial ? { partial: true } : {}),
        ...(this.knownFile(room) ? { file: this.knownFile(room) } : {}),
      });
      throw error;
    } finally {
      this.inflight.delete(id);
    }

    const meta = this.resultMetaById.get(id);
    this.resultMetaById.delete(id);
    this.noteIdentity(room, command, result);
    const file = meta?.file || this.knownFile(room);
    const receipt: CommandReceipt = {
      id,
      command,
      room,
      outcome: meta?.outcome ?? "applied",
      ...(meta ? { write: meta.write } : {}),
      ...(meta?.partial ? { partial: true } : {}),
      ...(file ? { file } : {}),
    };

    // Surface designer activity alongside object results so the AI sees it
    // without polling; get_events covers the remaining cases
    if (
      this.eventQueue.length > 0 &&
      result !== null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      result = { ...(result as Record<string, unknown>), designer_events: this.consumeEvents() };
    }
    return { result, receipt };
  }

  // Remember the file identity a plugin reported, so join_room can say which
  // main file a branch belongs to without asking again
  private noteIdentity(room: string, command: string, result: unknown): void {
    if (command !== "get_file_identity" && command !== "set_file_identity") return;
    const identity = (result as { identity?: { fileName?: unknown; branchName?: unknown } } | null)?.identity;
    if (typeof identity?.fileName !== "string") return;
    this.identityByRoom.set(room, {
      fileName: identity.fileName,
      ...(typeof identity.branchName === "string" ? { branchName: identity.branchName } : {}),
    });
  }

  // Drain buffered designer-activity events
  consumeEvents(): unknown[] {
    const drained = this.eventQueue;
    this.eventQueue = [];
    return drained;
  }

  // Set handler for incoming commands from other room members (e.g. plugin UI)
  setCommandHandler(handler: (command: string, params: unknown) => void): void {
    this.commandHandler = handler;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get room(): string | null {
    return this.currentRoom;
  }
}
