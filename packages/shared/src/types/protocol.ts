// WebSocket message envelope types

export interface WsJoinMessage {
  id: string;
  type: "join";
  room: string;
  // Who is joining — lets the relay report presence and room listings
  role?: "plugin" | "agent";
  meta?: Record<string, unknown>;
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
}

// Peer presence broadcast to every room member on join/leave
export interface WsPresenceMessage {
  type: "presence";
  room: string;
  peers: Array<{ role: "plugin" | "agent" | "unknown"; meta?: Record<string, unknown> }>;
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
      status: "started" | "in_progress" | "completed" | "error";
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
    error?: string;
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
