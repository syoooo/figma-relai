import type { SendCommandFn } from "../../tool-registry.js";
import { loadToken, noteAuthFailure } from "../../credentials.js";

// Resolving "which file am I looking at" without the private plugin API.
//
// figma.fileKey is gated to private organisation plugins, so a Community
// plugin never learns its own key. The way round it uses only things a
// published file already exposes:
//
//   1. a published component's key   → /v1/component_sets|components/{key}
//   2. that answers with file_key    → the MAIN file, never the branch,
//                                      because components publish from main
//   3. /v1/files/{main}?branch_data=true lists the branches
//   4. match figma.root.name against them → the branch this document is
//
// Step 3 is not optional bookkeeping: comments live per branch, so without it
// manage_comments reads the parent file and reports an empty list while the
// designer is looking at three pins.

export interface FileIdentity {
  fileKey: string;
  fileName: string;
  branchKey?: string;
  branchName?: string;
}

interface Candidate {
  key: string;
  name: string;
  kind: "set" | "component";
}

/** The key to address this document by — the branch when on one. */
export function addressableKey(identity: FileIdentity): string {
  return identity.branchKey ?? identity.fileKey;
}

export function describeIdentity(identity: FileIdentity): string {
  return identity.branchName
    ? `${identity.fileName} (branch "${identity.branchName}")`
    : identity.fileName;
}

async function figmaApi(
  token: string,
  path: string
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": token },
  });
  noteAuthFailure(res.status);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export class FileIdentityError extends Error {}

/**
 * Cached answer first, then the probe. Anything resolved is handed back to the
 * plugin, which keeps it in clientStorage — the designer's file has no
 * business carrying an environment fact through a merge.
 */
export async function resolveFileIdentity(sendCommand: SendCommandFn): Promise<FileIdentity> {
  const probe = (await sendCommand("get_file_identity", {})) as {
    cached?: boolean;
    rootName?: string;
    identity?: FileIdentity;
    candidates?: Candidate[];
  };
  if (probe?.identity?.fileKey) return probe.identity;

  const rootName = probe?.rootName ?? "";
  const candidates = probe?.candidates ?? [];
  if (candidates.length === 0) {
    throw new FileIdentityError(
      "This file publishes no components, so its key cannot be resolved from the plugin (figma.fileKey is private-plugin-only). Pass fileUrl."
    );
  }

  const token = loadToken();
  if (!token) {
    throw new FileIdentityError(
      "Resolving the file key needs a Figma token — store one with `npx -y figma-relai@latest login`, or pass fileUrl."
    );
  }

  let main: { fileKey: string; fileName: string; via: string } | null = null;
  const statuses: number[] = [];
  for (const c of candidates) {
    // A set's key resolves only under /component_sets and a component's only
    // under /components, so try the likely one first and fall back.
    const paths = c.kind === "set" ? ["/component_sets/", "/components/"] : ["/components/", "/component_sets/"];
    for (const p of paths) {
      const res = await figmaApi(token, `${p}${c.key}`);
      statuses.push(res.status);
      const meta = (res.json.meta ?? {}) as Record<string, unknown>;
      if (res.ok && typeof meta.file_key === "string") {
        main = {
          fileKey: meta.file_key,
          fileName: (meta.file_name as string) ?? rootName,
          via: c.key,
        };
        break;
      }
    }
    if (main) break;
  }

  if (!main) {
    const denied = statuses.length > 0 && statuses.every((s) => s === 401 || s === 403);
    throw new FileIdentityError(
      denied
        ? "Figma rejected the token on every probe (401/403) — it is expired or lacks the file content read scope. Re-run `npx -y figma-relai@latest login`."
        : "None of this file's published component keys resolved. Pass fileUrl."
    );
  }

  const identity: FileIdentity = { fileKey: main.fileKey, fileName: main.fileName };

  // A branch reports its own name as figma.root.name, so a mismatch with the
  // main file's name is the signal to go looking for it.
  if (rootName && rootName !== main.fileName) {
    const res = await figmaApi(token, `/files/${main.fileKey}?branch_data=true&depth=1`);
    const branches = (res.json.branches as Array<{ key?: string; name?: string }>) ?? [];
    const hit = branches.find((b) => b.name === rootName);
    if (hit?.key) {
      identity.branchKey = hit.key;
      identity.branchName = hit.name;
    }
    if (typeof res.json.name === "string") identity.fileName = res.json.name;
  }

  try {
    await sendCommand("set_file_identity", { identity, componentKey: main.via });
  } catch {
    // Caching is a convenience; a failure here must not fail the caller
  }
  return identity;
}
