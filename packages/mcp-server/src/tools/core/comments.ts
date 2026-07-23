import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult, textResult } from "./helpers.js";

// Comments live behind Figma's REST API (the Plugin API cannot see them), so
// this tool needs a personal access token. Without FIGMA_TOKEN it stays
// discoverable but explains how to unlock itself.

const API = "https://api.figma.com/v1";

// figma.com/file/KEY/... and figma.com/design/KEY/... both carry the file key
export function parseFileKey(input: string): string | null {
  const url = input.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{15,}$/.test(input)) return input;
  return null;
}

interface RawComment {
  id: string;
  message: string;
  user?: { handle?: string };
  created_at?: string;
  resolved_at?: string | null;
  parent_id?: string;
  client_meta?: { node_id?: string; node_offset?: { x: number; y: number }; x?: number; y?: number };
}

function compactComment(c: RawComment) {
  return {
    id: c.id,
    message: c.message,
    author: c.user?.handle,
    created_at: c.created_at,
    ...(c.resolved_at ? { resolved: true } : {}),
    ...(c.parent_id ? { replyTo: c.parent_id } : {}),
    ...(c.client_meta?.node_id ? { nodeId: c.client_meta.node_id } : {}),
  };
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_comments",
    "Read and write comments on the Figma file: list (with node anchors — great for 'apply the feedback in the comments'), add (optionally pinned to a node), reply, delete. Requires a FIGMA_TOKEN env var (personal access token with comment scopes, generated at figma.com Settings → Security); the canvas tools work without it. The file is auto-detected from the open plugin when possible — otherwise pass fileUrl.",
    {
      action: z.enum(["list", "add", "reply", "delete"]),
      fileUrl: z.string().optional().describe("Figma file URL or key (auto-detected when omitted)"),
      message: z.string().optional().describe("Comment text (add/reply)"),
      commentId: z.string().optional().describe("Target comment (reply/delete)"),
      nodeId: z.string().optional().describe("add: pin the comment to this node"),
      x: z.number().optional().describe("add: canvas position (with y, when not pinning to a node)"),
      y: z.number().optional(),
    },
    async ({ action, fileUrl, message, commentId, nodeId, x, y }) => {
      const token = process.env.FIGMA_TOKEN;
      if (!token) {
        return textResult(
          "Comments need a Figma personal access token. Generate one at figma.com → Settings → Security → Personal access tokens (enable comment scopes), then add it to the MCP config: \"env\": { \"FIGMA_TOKEN\": \"figd_...\" } and restart. Everything else works without it."
        );
      }

      try {
        // Resolve the file key: explicit input → the plugin's own file
        let fileKey = fileUrl ? parseFileKey(fileUrl) : null;
        if (fileUrl && !fileKey) {
          return textResult(`Could not extract a file key from "${fileUrl}" — pass a figma.com/design/... URL.`);
        }
        if (!fileKey) {
          const info = (await sendCommand("get_file_info", {})) as { fileKey?: string | null };
          fileKey = info?.fileKey ?? null;
        }
        if (!fileKey) {
          return textResult(
            "Figma doesn't expose this file's key to the plugin. Pass fileUrl with the file's figma.com URL (copy it from the browser or Share dialog)."
          );
        }

        const request = async (method: string, path: string, body?: unknown) => {
          const res = await fetch(`${API}${path}`, {
            method,
            headers: {
              "X-Figma-Token": token,
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok) {
            throw new Error(
              `Figma API ${res.status}: ${(json as { err?: string; message?: string }).err ?? (json as { message?: string }).message ?? "request failed"}` +
                (res.status === 403 ? " — check the token's comment scopes and file access" : "")
            );
          }
          return json;
        };

        switch (action) {
          case "list": {
            const data = await request("GET", `/files/${fileKey}/comments`);
            const comments = ((data.comments as RawComment[]) ?? []).slice(0, 100).map(compactComment);
            return jsonResult({ count: comments.length, comments });
          }
          case "add": {
            if (!message) return textResult("add requires message.");
            const client_meta = nodeId
              ? { node_id: nodeId, node_offset: { x: x ?? 0, y: y ?? 0 } }
              : x !== undefined && y !== undefined
                ? { x, y }
                : undefined;
            const data = await request("POST", `/files/${fileKey}/comments`, {
              message,
              ...(client_meta ? { client_meta } : {}),
            });
            return jsonResult(compactComment(data as unknown as RawComment));
          }
          case "reply": {
            if (!message || !commentId) return textResult("reply requires commentId and message.");
            const data = await request("POST", `/files/${fileKey}/comments`, {
              message,
              comment_id: commentId,
            });
            return jsonResult(compactComment(data as unknown as RawComment));
          }
          case "delete": {
            if (!commentId) return textResult("delete requires commentId.");
            await request("DELETE", `/files/${fileKey}/comments/${commentId}`);
            return textResult(`Comment ${commentId} deleted.`);
          }
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
