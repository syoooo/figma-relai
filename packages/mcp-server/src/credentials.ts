import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stateDir } from "./state.js";
import { join } from "node:path";

// A Figma personal access token is account-wide and long-lived, so it never
// travels the relay socket — the plugin has no business holding it. It lives
// either in the MCP config env or in a 0600 file this process owns, and both
// are read here so every consumer resolves it the same way.

export type TokenSource = "env" | "file" | null;

interface CredentialsFile {
  token?: string;
  savedAt?: string;
}

export function credentialsPath(): string {
  return join(stateDir(), "credentials.json");
}

function readFile(): CredentialsFile {
  try {
    return JSON.parse(readFileSync(credentialsPath(), "utf8")) as CredentialsFile;
  } catch {
    return {};
  }
}

/** env wins over the stored file so a per-project override stays possible. */
export function loadToken(): string | undefined {
  const fromEnv = process.env.FIGMA_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = readFile().token?.trim();
  return fromFile || undefined;
}

export function tokenSource(): TokenSource {
  if (process.env.FIGMA_TOKEN?.trim()) return "env";
  if (readFile().token?.trim()) return "file";
  return null;
}

export function saveToken(token: string): string {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Directory permissions are best-effort (Windows, exotic filesystems)
  }
  const path = credentialsPath();
  // Create with the restrictive mode rather than widening then narrowing:
  // an 0644 window, however brief, is a window.
  writeFileSync(path, JSON.stringify({ token, savedAt: new Date().toISOString() }, null, 2) + "\n", {
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Pre-existing file may keep its mode on some platforms; reported by doctor
  }
  return path;
}

export function clearToken(): boolean {
  try {
    rmSync(credentialsPath());
    return true;
  } catch {
    return false;
  }
}

/** Confirms the token is live and tells the caller whose it is. */
export async function verifyToken(
  token: string
): Promise<{ ok: true; handle: string; email?: string } | { ok: false; reason: string }> {
  try {
    const res = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": token },
    });
    if (res.status === 403 || res.status === 401) {
      return { ok: false, reason: "Figma rejected the token (401/403) — check it was copied whole." };
    }
    if (!res.ok) {
      return { ok: false, reason: `Figma answered ${res.status} ${res.statusText}.` };
    }
    const me = (await res.json()) as { handle?: string; email?: string };
    return { ok: true, handle: me.handle ?? "(unknown)", email: me.email };
  } catch (err) {
    return { ok: false, reason: `Could not reach api.figma.com: ${(err as Error).message}` };
  }
}

// ── Live status ─────────────────────────────────────────────────────
// The panel used to light green on presence alone, so an expired token read
// as healthy while every REST call failed. Validity is checked once at
// startup and again whenever a call comes back 401/403, then cached — the
// relay announces features synchronously and cannot await.

export interface TokenStatus {
  present: boolean;
  /** null = not checked yet (never claim health we have not verified) */
  valid: boolean | null;
  handle?: string;
  reason?: string;
}

let cached: TokenStatus = { present: false, valid: null };
let inFlight: Promise<TokenStatus> | null = null;

export function tokenStatus(): TokenStatus {
  return { ...cached, present: tokenSource() !== null };
}

export async function refreshTokenStatus(): Promise<TokenStatus> {
  if (inFlight) return inFlight;
  const token = loadToken();
  if (!token) {
    cached = { present: false, valid: null };
    return cached;
  }
  inFlight = verifyToken(token)
    .then((res) => {
      cached = res.ok
        ? { present: true, valid: true, handle: res.handle }
        : { present: true, valid: false, reason: res.reason };
      return cached;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Call when Figma answers 401/403 — the lamp should go red the moment it dies. */
export function noteAuthFailure(status: number): void {
  if (status !== 401 && status !== 403) return;
  cached = { present: tokenSource() !== null, valid: false, reason: `Figma answered ${status}.` };
  void refreshTokenStatus();
}
