#!/usr/bin/env bun

// Standalone relay for advanced setups (e.g. relay on another machine).
// Normal installs don't need this: the MCP server embeds the same relay logic
// and hosts it on port 9055 automatically.

import { RelayCore } from "@figma-relai/shared";
import type { ServerWebSocket } from "bun";

const PORT = parseInt(process.env.PORT || "9055");
// Loopback only by default — the relay has no auth, so exposing it on the
// network lets anyone who guesses a room name join the session. Set
// HOST=0.0.0.0 explicitly if remote clients must connect.
const HOST = process.env.HOST || "127.0.0.1";

const core = new RelayCore<ServerWebSocket<unknown>>({
  version: "0.2.1",
  log: (msg) => console.log(msg),
});

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(req, server) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const success = server.upgrade(req, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
    if (success) return;

    return new Response("Relai WebSocket Relay", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  },

  websocket: {
    open(ws: ServerWebSocket<unknown>) {
      console.log("Client connected");
      core.handleOpen(ws);
    },
    message(ws: ServerWebSocket<unknown>, message: string | Buffer) {
      core.handleMessage(ws, message.toString());
    },
    close(ws: ServerWebSocket<unknown>) {
      console.log("Client disconnected");
      core.handleClose(ws);
    },
  },
});

core.startStaleCleanup();

console.log(`Relai WebSocket relay running on ${HOST}:${server.port}`);
