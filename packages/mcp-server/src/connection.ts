import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.js";
import { RequestTracker } from "./request-tracker.js";
import type { FigmaCommand } from "@figma-relai/shared";
import type { CommandProgressUpdate, RoomSummary } from "@figma-relai/shared";

export interface FigmaConnectionOptions {
  // Room restored from persisted state; used to auto-pair on the first command
  initialRoom?: string | null;
  // Called whenever a room is joined so the caller can persist it
  onRoomChanged?: (room: string) => void;
  // Called before each reconnect attempt (e.g. to take over relay hosting)
  beforeReconnect?: () => Promise<void>;
}

// Error payload sent by the plugin: a plain string, or an object with context
interface PluginErrorPayload {
  message?: string;
  command?: string;
  nodeId?: string;
  nodeType?: string;
}

// Flatten a plugin error (string or structured object) into one readable line
export function formatFigmaError(e: unknown): string {
  if (typeof e === "string") return e;
  const { message, command, nodeId, nodeType } = (e ?? {}) as PluginErrorPayload;
  const prefix = command ? `[${command}] ` : "";
  const suffix = nodeId
    ? ` (node ${nodeId}${nodeType ? `, type ${nodeType}` : ""})`
    : "";
  return `${prefix}${message ?? JSON.stringify(e)}${suffix}`;
}

// Route a response message to its pending request. Error responses have no
// `result` field, so the error check must come first and resolution must key
// on field presence — falsy results (0, "", false) are valid.
export function routeResponse(
  response: { id?: string; result?: unknown; error?: unknown } | undefined,
  tracker: RequestTracker
): void {
  if (!response?.id || !tracker.has(response.id)) return;
  if (response.error !== undefined) {
    tracker.reject(response.id, new Error(formatFigmaError(response.error)));
  } else if ("result" in response) {
    tracker.resolve(response.id, response.result);
  }
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
          this.sendCommand("join", { room }).then(
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

          // Peer presence per room (is the plugin there?)
          if (json.type === "presence") {
            if (typeof json.room === "string" && Array.isArray(json.peers)) {
              this.presenceByRoom.set(
                json.room,
                json.peers.some((p: { role?: string }) => p.role === "plugin")
              );
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

            if (requestId && this.tracker.has(requestId)) {
              this.tracker.resetTimeout(requestId);
              logger.info(
                `Progress: ${progressData.commandType} ${progressData.progress}% - ${progressData.message}`
              );
            }
            return;
          }

          // Collect designer-activity events piggybacked on responses
          if (Array.isArray(json.message?.events)) {
            this.eventQueue.push(...json.message.events);
            if (this.eventQueue.length > 50) {
              this.eventQueue = this.eventQueue.slice(-50);
            }
          }

          // Handle regular responses
          routeResponse(json.message, this.tracker);
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

      ws.on("close", () => {
        logger.info("Disconnected from relay");
        this.ws = null;
        this.tracker.rejectAll("Connection closed");
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

  // Join a room for communication
  async joinRoom(roomName: string): Promise<void> {
    await this.sendCommand("join", { room: roomName });
    this.currentRoom = roomName;
    this.options.onRoomChanged?.(roomName);
    logger.info(`Joined room: ${roomName}`);
  }

  // Ask the relay which rooms exist and who is in them
  listRooms(): Promise<RoomSummary[]> {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      this.tracker.add(id, resolve as (value: unknown) => void, reject, 5000);
      this.ws!.send(JSON.stringify({ type: "list_rooms", id }));
    });
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
      return this.joinRoom(saved);
    }
    if (withPlugin.length === 1) {
      return this.joinRoom(withPlugin[0].room);
    }
    if (withPlugin.length === 0) {
      throw new Error(
        "No Figma plugin is connected. Open the Relai plugin in Figma (it connects automatically), then try again."
      );
    }
    throw new Error(
      `Multiple Figma plugins are connected (rooms: ${withPlugin
        .map((r) => r.room)
        .join(", ")}). Call join_room with the room shown in the plugin you want to control.`
    );
  }

  // Send a command to Figma plugin via the relay
  async sendCommand(
    command: FigmaCommand,
    params: unknown = {},
    timeoutMs: number = 30000
  ): Promise<unknown> {
    // Wait for connection if not connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.connect();
      } catch {
        // The relay host may have just exited (port-handoff race on rapid
        // server restarts): try to take over hosting, then dial once more.
        try {
          await this.options.beforeReconnect?.();
        } catch {
          // Takeover failure is fine; the retry below may reach another host
        }
        try {
          await this.connect();
        } catch {
          throw new Error(
            "Not connected to the relay. The MCP server hosts it automatically — if this persists, another app may be occupying the port."
          );
        }
      }
    }

    if (command !== "join") {
      await this.ensureRoom();
      // Presence said the room has no plugin — fail fast, not a 30s timeout
      if (this.currentRoom && this.presenceByRoom.get(this.currentRoom) === false) {
        throw new Error(
          "The Figma plugin is not open. Open the Relai plugin in Figma — it will reconnect to the same room automatically."
        );
      }
    }

    const result = await new Promise((resolve, reject) => {
      const id = uuidv4();
      const request = {
        id,
        type: command === "join" ? "join" : "message",
        room:
          command === "join"
            ? (params as { room: string }).room
            : this.currentRoom,
        ...(command === "join"
          ? { role: "agent", meta: { client: "figma-relai-mcp" } }
          : {}),
        message: {
          id,
          command,
          params: {
            ...(params as Record<string, unknown>),
            commandId: id,
          },
        },
      };

      this.tracker.add(id, resolve, reject, timeoutMs);

      logger.info(`Sending command: ${command}`);
      logger.debug(`Request: ${JSON.stringify(request)}`);
      this.ws!.send(JSON.stringify(request));
    });

    // Surface designer activity alongside object results so the AI sees it
    // without polling; get_events covers the remaining cases
    if (
      this.eventQueue.length > 0 &&
      result !== null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return { ...(result as Record<string, unknown>), designer_events: this.consumeEvents() };
    }
    return result;
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
