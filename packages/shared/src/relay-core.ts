// Transport-agnostic relay logic shared by the standalone Bun relay and the
// relay embedded in the MCP server (Node/ws). The transport layer only needs
// to call handleOpen/handleMessage/handleClose with a socket that can send().

export interface RelaySocket {
  send(data: string): void;
  close(): void;
}

export type PeerRole = "plugin" | "agent" | "unknown";

export interface PeerInfo {
  role: PeerRole;
  meta?: Record<string, unknown>;
}

export interface RoomSummary {
  room: string;
  hasPlugin: boolean;
  agentCount: number;
  /** File name reported by the plugin peer, when known */
  fileName?: string;
}

export interface RelayCoreOptions {
  version?: string;
  log?: (message: string) => void;
}

export class RelayCore<S extends RelaySocket = RelaySocket> {
  private rooms = new Map<string, Map<S, PeerInfo>>();
  private lastActivity = new Map<S, number>();
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private version: string;
  private log: (message: string) => void;

  constructor(options: RelayCoreOptions = {}) {
    this.version = options.version ?? "unknown";
    this.log = options.log ?? (() => {});
  }

  handleOpen(ws: S): void {
    this.lastActivity.set(ws, Date.now());
    this.send(ws, { type: "system", message: "Please join a room to start" });
  }

  handleMessage(ws: S, raw: string): void {
    this.lastActivity.set(ws, Date.now());

    let data: {
      type?: string;
      id?: string;
      room?: string;
      role?: string;
      meta?: Record<string, unknown>;
      message?: unknown;
    };
    try {
      data = JSON.parse(raw);
    } catch {
      this.send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (data.type) {
      case "hello":
        // Identity probe so clients can verify they reached a Relai relay
        this.send(ws, { type: "hello", server: "figma-relai", version: this.version });
        return;

      case "join": {
        const room = data.room;
        if (!room || typeof room !== "string") {
          this.send(ws, { type: "error", message: "Room name required" });
          return;
        }

        const role: PeerRole =
          data.role === "plugin" || data.role === "agent" ? data.role : "unknown";
        const peers = this.roomPeers(room);
        peers.set(ws, { role, meta: data.meta });
        this.log(`Client joined "${room}" as ${role} (${peers.size} clients)`);

        this.send(ws, { type: "system", message: `Joined room: ${room}`, room });
        // Response with the request id so the MCP server resolves its promise
        this.send(ws, {
          type: "system",
          message: { id: data.id, result: `Connected to room: ${room}` },
          room,
        });

        this.broadcastPresence(room);
        return;
      }

      case "list_rooms": {
        const rooms: RoomSummary[] = [];
        for (const [room, peers] of this.rooms) {
          if (peers.size === 0) continue;
          const pluginPeer = [...peers.values()].find((p) => p.role === "plugin");
          const fileName =
            typeof pluginPeer?.meta?.fileName === "string" ? pluginPeer.meta.fileName : undefined;
          rooms.push({
            room,
            hasPlugin: pluginPeer !== undefined,
            agentCount: [...peers.values()].filter((p) => p.role === "agent").length,
            ...(fileName ? { fileName } : {}),
          });
        }
        this.send(ws, { type: "list_rooms_result", id: data.id, rooms });
        return;
      }

      case "message": {
        const room = data.room;
        if (!room || typeof room !== "string") {
          this.send(ws, { type: "error", message: "Room name required" });
          return;
        }
        if (!this.rooms.get(room)?.has(ws)) {
          this.send(ws, { type: "error", message: "Must join room first" });
          return;
        }

        const payload = JSON.stringify({
          type: "broadcast",
          message: data.message,
          sender: "peer",
          room,
        });
        const count = this.broadcast(ws, room, payload);
        if (count === 0) this.log(`No peers in "${room}" to receive message`);
        return;
      }

      case "progress_update": {
        const room = data.room;
        if (room && typeof room === "string" && this.rooms.get(room)?.has(ws)) {
          this.broadcast(ws, room, raw);
        }
        return;
      }
    }
  }

  handleClose(ws: S): void {
    this.lastActivity.delete(ws);
    const affected: string[] = [];
    for (const [room, peers] of this.rooms) {
      if (peers.delete(ws)) affected.push(room);
      if (peers.size === 0) this.rooms.delete(room);
    }
    for (const room of affected) this.broadcastPresence(room);
  }

  // Periodically close connections with no activity (heartbeat)
  startStaleCleanup(staleTimeoutMs = 120000, checkIntervalMs = 30000): void {
    this.staleTimer = setInterval(() => {
      const now = Date.now();
      for (const [ws, lastTime] of this.lastActivity) {
        if (now - lastTime > staleTimeoutMs) {
          this.log("Closing stale connection");
          try {
            ws.close();
          } catch {
            // Already closed
          }
          this.handleClose(ws);
        }
      }
    }, checkIntervalMs);
  }

  stop(): void {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private roomPeers(room: string): Map<S, PeerInfo> {
    let peers = this.rooms.get(room);
    if (!peers) {
      peers = new Map();
      this.rooms.set(room, peers);
    }
    return peers;
  }

  // Presence goes to every member (including the newcomer) so both the plugin
  // UI and the MCP server always know who is in the room
  private broadcastPresence(room: string): void {
    const peers = this.rooms.get(room);
    if (!peers) return;
    const payload = JSON.stringify({
      type: "presence",
      room,
      peers: [...peers.values()].map((p) => ({ role: p.role, meta: p.meta })),
    });
    for (const ws of peers.keys()) {
      try {
        ws.send(payload);
      } catch {
        // Ignore send failures; close handler will clean up
      }
    }
  }

  private broadcast(sender: S, room: string, payload: string): number {
    const peers = this.rooms.get(room);
    if (!peers) return 0;
    let count = 0;
    for (const ws of peers.keys()) {
      if (ws === sender) continue;
      try {
        ws.send(payload);
        count++;
      } catch {
        // Ignore send failures; close handler will clean up
      }
    }
    return count;
  }

  private send(ws: S, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Ignore send failures
    }
  }
}
