import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult, textResult } from "./helpers.js";
import { loadToken, noteAuthFailure } from "../../credentials.js";
import {
  addressableKey,
  describeIdentity,
  resolveFileIdentity,
  type FileIdentity,
} from "./file-identity.js";

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
  /**
   * Four documented shapes (Vector / FrameOffset / Region / FrameOffsetRegion)
   * and at least one undocumented field (`stable_path`), so this is passed
   * through rather than mapped: dropping everything but node_id made a pin on
   * a component and a pin on empty canvas read identically, and hid the fact
   * that a region comment covers an area at all.
   */
  client_meta?: Record<string, unknown> & {
    node_id?: string;
    node_offset?: { x: number; y: number };
    x?: number;
    y?: number;
    region_width?: number;
    region_height?: number;
  };
}

function compactComment(c: RawComment) {
  const meta = c.client_meta;
  const isRegion = typeof meta?.region_width === "number" && typeof meta?.region_height === "number";
  return {
    id: c.id,
    message: c.message,
    author: c.user?.handle,
    created_at: c.created_at,
    ...(c.resolved_at ? { resolved: true } : {}),
    ...(c.parent_id ? { replyTo: c.parent_id } : {}),
    ...(meta?.node_id ? { nodeId: meta.node_id } : {}),
    ...(isRegion ? { region: { width: meta!.region_width, height: meta!.region_height } } : {}),
    ...(meta ? { pin: meta } : {}),
  };
}

/**
 * A pin carries a node id and an offset, which locates nothing on its own —
 * you cannot act on "12,40 inside some frame". One batched lookup turns the
 * ids into names, pages and canvas positions. Skipped without a plugin.
 */
async function anchorComments(
  sendCommand: SendCommandFn,
  comments: Array<ReturnType<typeof compactComment>>
): Promise<void> {
  const ids = [...new Set(comments.map((c) => c.nodeId).filter((v): v is string => !!v))];
  if (ids.length === 0) return;
  let info: Record<string, { name?: string; type?: string; page?: string; x?: number; y?: number }>;
  try {
    info = (await sendCommand("get_comment_anchors", { nodeIds: ids.slice(0, 100) })) as typeof info;
  } catch {
    return; // REST-only sessions still get the raw pin
  }
  for (const c of comments) {
    const hit = c.nodeId ? info?.[c.nodeId] : undefined;
    if (!hit) continue;
    const offset = (c.pin as { node_offset?: { x: number; y: number } } | undefined)?.node_offset;
    Object.assign(c, {
      anchor: {
        // A pin whose node IS a page is a pin on that page's empty canvas
        on: hit.type === "PAGE" ? "canvas" : "node",
        name: hit.name,
        page: hit.page,
        ...(hit.x !== undefined && offset
          ? { canvas: { x: Math.round(hit.x + offset.x), y: Math.round((hit.y ?? 0) + offset.y) } }
          : {}),
      },
    });
  }
}

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "manage_comments",
    "Read and write comments on the Figma file: list (with node anchors — great for 'apply the feedback in the comments' or polling for designer requests; filter with unresolved:true and since:<ISO date>), add (optionally pinned to a node), reply, delete. Comment-driven workflow: designers leave asks as comments in Figma; poll list (unresolved + since last check), do the work, then reply on the thread with what was done. Requires a FIGMA_TOKEN env var (personal access token with comment scopes, generated at figma.com Settings → Security); the canvas tools work without it. The file is resolved from the plugin automatically (via a published component key, and the branch you are on — comments live per branch); pass fileUrl if this file publishes nothing.",
    {
      action: z.enum(["list", "add", "reply", "delete"]),
      fileUrl: z.string().optional().describe("Figma file URL or key (auto-detected when omitted)"),
      message: z.string().optional().describe("Comment text (add/reply)"),
      commentId: z.string().optional().describe("Target comment (reply/delete)"),
      nodeId: z.string().optional().describe("add: pin the comment to this node"),
      x: z.number().optional().describe("add: canvas position (with y, when not pinning to a node)"),
      y: z.number().optional(),
      since: z
        .string()
        .optional()
        .describe("list: only comments created after this ISO 8601 timestamp"),
      unresolved: z.boolean().optional().describe("list: only unresolved threads"),
    },
    async ({ action, fileUrl, message, commentId, nodeId, x, y, since, unresolved }) => {
      const token = loadToken();
      if (!token) {
        return textResult(
          "Comments need a Figma personal access token. Generate one at figma.com → Settings → Security → Personal access tokens (enable comment scopes), then store it with `npx figma-relai login` (it is verified and written to ~/.figma-relai/credentials.json, mode 0600). An MCP config \"env\": { \"FIGMA_TOKEN\": \"figd_...\" } still works and takes precedence. Everything else works without it."
        );
      }

      try {
        // Resolve the file key: explicit input → the plugin's own file
        let fileKey = fileUrl ? parseFileKey(fileUrl) : null;
        if (fileUrl && !fileKey) {
          return textResult(`Could not extract a file key from "${fileUrl}" — pass a figma.com/design/... URL.`);
        }
        let identity: FileIdentity | null = null;
        if (!fileKey) {
          try {
            identity = await resolveFileIdentity(sendCommand);
            // Comments live per branch — addressing the parent file here is
            // how three pins on a branch read back as an empty list.
            fileKey = addressableKey(identity);
          } catch (err) {
            return textResult(
              `${(err as Error).message} Pass fileUrl with the figma.com URL of the file — or of the branch, since comments live per branch.`
            );
          }
        }
        if (!fileKey) {
          return textResult(
            "Could not determine which file to read. Pass fileUrl with the file's figma.com URL (copy it from the browser or Share dialog)."
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
          noteAuthFailure(res.status);
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok) {
            const reason =
              (json as { err?: string; message?: string }).err ??
              (json as { message?: string }).message ??
              "request failed";
            // Figma's own reason comes first; only add advice it did not give.
            const advice = /expired/i.test(reason)
              ? " — re-run `npx -y figma-relai@latest login`"
              : res.status === 403
                ? " — check the token's comment scopes and file access"
                : "";
            throw new Error(`Figma API ${res.status}: ${reason}${advice}`);
          }
          return json;
        };

        switch (action) {
          case "list": {
            const data = await request("GET", `/files/${fileKey}/comments`);
            let raw = (data.comments as RawComment[]) ?? [];
            if (unresolved) raw = raw.filter((c) => !c.resolved_at);
            if (since) {
              const cutoff = Date.parse(since);
              if (Number.isNaN(cutoff)) {
                return textResult(`since "${since}" is not a parseable ISO 8601 timestamp.`);
              }
              raw = raw.filter((c) => c.created_at && Date.parse(c.created_at) > cutoff);
            }
            const comments = raw.slice(0, 100).map(compactComment);
            await anchorComments(sendCommand, comments);
            return jsonResult({
              count: comments.length,
              ...(identity ? { file: describeIdentity(identity) } : {}),
              comments,
              checkedAt: new Date().toISOString(),
            });
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
