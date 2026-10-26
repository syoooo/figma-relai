import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { RelayCore, isAllowedOrigin } from "@figma-relai/shared";
import { logger } from "./logger.js";
import { tokenStatus } from "./credentials.js";

export interface EmbeddedRelay {
  close(): void;
}

// Host the relay in-process on 127.0.0.1:port. Returns null if the port is
// already taken — another MCP server instance (e.g. Cursor and Claude Code
// open at once) is hosting, and this process should just connect as a client.
export function startEmbeddedRelay(
  port: number,
  version: string
): Promise<EmbeddedRelay | null> {
  return new Promise((resolve) => {
    const httpServer = createServer();

    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(null);
      } else {
        logger.warn(`Embedded relay failed to start: ${err.message}`);
        resolve(null);
      }
    });

    httpServer.listen(port, "127.0.0.1", () => {
      const core = new RelayCore<WebSocket>({
        version,
        log: (msg) => logger.debug(`[relay] ${msg}`),
        // Status, not presence — the token itself never leaves this process.
        features: () => ({ token: tokenStatus() }),
      });
      const wss = new WebSocketServer({
        server: httpServer,
        // Refuse web pages before the handshake completes; see isAllowedOrigin
        verifyClient: ({ origin }, done) => {
          if (isAllowedOrigin(origin)) return done(true);
          logger.warn(`[relay] refused a connection from origin ${origin}`);
          done(false, 403, "Origin not allowed");
        },
      });

      wss.on("connection", (ws) => {
        core.handleOpen(ws);
        (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
        ws.on("pong", () => {
          (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
        });
        ws.on("message", (data) => core.handleMessage(ws, data.toString()));
        ws.on("close", (code, reason) => {
          logger.debug(`[relay] socket closed code=${code} reason=${reason?.toString?.() ?? ""}`);
          core.handleClose(ws);
        });
        ws.on("error", () => {});
      });

      // Protocol-level keepalive: the browser answers pings in its network
      // stack, so even a plugin whose JS thread is pinned by a long findAll
      // stays alive — while a genuinely dead socket (tab gone, iframe killed)
      // gets reaped instead of lingering half-open. Generous cadence: a peer
      // is only terminated after missing two full intervals.
      const PING_MS = 30000;
      const pinger = setInterval(() => {
        for (const ws of wss.clients) {
          const w = ws as WebSocket & { isAlive?: boolean };
          if (w.isAlive === false) {
            logger.debug("[relay] terminating unresponsive socket (missed ping)");
            w.terminate();
            continue;
          }
          w.isAlive = false;
          try {
            w.ping();
          } catch {
            // terminate on next sweep
          }
        }
      }, PING_MS);

      core.startStaleCleanup();
      logger.info(`Hosting embedded relay on 127.0.0.1:${port}`);

      resolve({
        close() {
          clearInterval(pinger);
          core.stop();
          wss.close();
          httpServer.close();
        },
      });
    });
  });
}
