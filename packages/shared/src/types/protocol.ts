// WebSocket message envelope types
import type { PeerMeta, PluginErrorPayload, ResultMeta, WsCallInfo } from "./call.js";

export interface WsJoinMessage {
  id: string;
  type: "join";
  room: string;
  // Who is joining — lets the relay report presence and room listings
  role?: "plugin" | "agent";
  meta?: PeerMeta;
  message: {
    id: string;
    command: "join";
    params: {
      room: string;
      commandId: string;
    };
  };
}

// Relay identity probe (client sends {type:"hello"}, relay responds)
export interface WsHelloMessage {
  type: "hello";
  server?: "figma-relai";
  version?: string;
  /**
   * What the relay host can do beyond the canvas. Presence — never the value:
   * `token` says a personal access token is resolvable in the server process,
   * so the panel can show the capability without the secret crossing the wire.
   * Absent when the relay runs standalone and cannot know.
   */
  features?: { token?: boolean };
}

// Peer presence broadcast to every room member on join/leave
export interface WsPresenceMessage {
  type: "presence";
  room: string;
  peers: Array<{ role: "plugin" | "agent" | "unknown"; meta?: PeerMeta }>;
}

// Room discovery for auto-pairing
export interface WsListRoomsMessage {
  type: "list_rooms";
  id: string;
}

export interface WsListRoomsResultMessage {
  type: "list_rooms_result";
  id: string;
  rooms: Array<{ room: string; hasPlugin: boolean; agentCount: number; fileName?: string }>;
}

export interface WsCommandMessage {
  id: string;
  type: "message";
  room: string;
  message: {
    id: string;
    command: string;
    params: Record<string, unknown>;
    // Per-call target and protocol; older plugins ignore it
    call?: WsCallInfo;
  };
}

export interface WsProgressMessage {
  type: "progress_update";
  id: string;
  room: string;
  message: {
    data: {
      type: "command_progress";
      commandId: string;
      commandType: string;
      // cancel_requested: the designer pressed Stop; the command's real
      // result (or error) still follows
      status: "started" | "in_progress" | "completed" | "error" | "cancel_requested";
      progress: number;
      totalItems: number;
      processedItems: number;
      currentChunk?: number;
      totalChunks?: number;
      chunkSize?: number;
      message: string;
      payload?: unknown;
      timestamp: number;
    };
  };
}

export interface WsBroadcastMessage {
  type: "broadcast" | "system";
  message: {
    id: string;
    result?: unknown;
    // Set on results from plugins on protocol 2 or later
    meta?: ResultMeta;
    // A plain string from the oldest plugins; an object since then
    error?: string | PluginErrorPayload;
  };
  room: string;
}

export type WsMessage =
  | WsJoinMessage
  | WsCommandMessage
  | WsProgressMessage
  | WsBroadcastMessage
  | WsHelloMessage
  | WsPresenceMessage
  | WsListRoomsMessage
  | WsListRoomsResultMessage;
