import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { RelayCore } from "@figma-relai/shared";
import { logger } from "./logger.js";

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
      });
      const wss = new WebSocketServer({ server: httpServer });

      wss.on("connection", (ws) => {
        core.handleOpen(ws);
        ws.on("message", (data) => core.handleMessage(ws, data.toString()));
        ws.on("close", () => core.handleClose(ws));
        ws.on("error", () => {});
      });

      core.startStaleCleanup();
      logger.info(`Hosting embedded relay on 127.0.0.1:${port}`);

      resolve({
        close() {
          core.stop();
          wss.close();
          httpServer.close();
        },
      });
    });
  });
}
