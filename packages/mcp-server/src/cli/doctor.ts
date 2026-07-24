import WebSocket from "ws";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadState } from "../state.js";

// figma-relai doctor — environment triage in one command. Each check reports
// ok/warn plus the one-line fix, so "it doesn't work" becomes actionable
// without reading the troubleshooting docs.

interface CheckResult {
  check: string;
  status: "ok" | "warn";
  detail: string;
  fix?: string;
}

const PORTS = [9055, 9056, 9057];
const PROBE_TIMEOUT_MS = 1500;

interface ProbeResult {
  port: number;
  state: "relai" | "foreign" | "closed";
  version?: string;
  rooms?: Array<{ room: string; hasPlugin: boolean; fileName?: string }>;
}

function probePort(port: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let settled = false;
    const done = (result: ProbeResult) => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(result);
      }
    };
    const timer = setTimeout(() => done({ port, state: "foreign" }), PROBE_TIMEOUT_MS);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "hello" }));
      ws.send(JSON.stringify({ type: "list_rooms", id: "doctor" }));
    });
    let version: string | undefined;
    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "hello" && msg.server === "figma-relai") {
          version = msg.version;
        }
        if (msg.type === "list_rooms_result") {
          clearTimeout(timer);
          done({ port, state: "relai", version, rooms: msg.rooms ?? [] });
        }
      } catch {
        // Non-JSON chatter = not our relay
      }
    });
    ws.on("error", () => {
      clearTimeout(timer);
      done({ port, state: "closed" });
    });
  });
}

export async function runDoctor(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  results.push(
    nodeMajor >= 18
      ? { check: "node", status: "ok", detail: `Node ${process.versions.node}` }
      : {
          check: "node",
          status: "warn",
          detail: `Node ${process.versions.node} is below 18`,
          fix: "Install Node 18+ (nvm install --lts)",
        }
  );

  const probes = await Promise.all(PORTS.map(probePort));
  const relay = probes.find((p) => p.state === "relai");
  const foreign = probes.filter((p) => p.state === "foreign");
  if (relay) {
    results.push({
      check: "relay",
      status: "ok",
      detail: `Relai relay v${relay.version ?? "?"} on port ${relay.port}`,
    });
    const pluginRooms = (relay.rooms ?? []).filter((r) => r.hasPlugin);
    results.push(
      pluginRooms.length > 0
        ? {
            check: "plugin",
            status: "ok",
            detail: `Figma plugin online: ${pluginRooms
              .map((r) => `"${r.fileName ?? r.room}"`)
              .join(", ")}`,
          }
        : {
            check: "plugin",
            status: "warn",
            detail: "Relay is up but no Figma plugin is connected",
            fix: "Open the Relai plugin inside your Figma file (it auto-connects)",
          }
    );
  } else {
    results.push({
      check: "relay",
      status: "warn",
      detail:
        foreign.length > 0
          ? `Ports ${foreign.map((p) => p.port).join(", ")} are occupied by something that is not a Relai relay`
          : "No relay on ports 9055–9057 — no MCP server is running",
      fix:
        foreign.length > 0
          ? "Free the port (lsof -i :9055) or let Relai fall back to 9056/9057"
          : "Start a conversation in your AI client with Relai registered (npx -y figma-relai)",
    });
    results.push({
      check: "plugin",
      status: "warn",
      detail: "Cannot see the plugin without a relay",
    });
  }

  const statePath = join(homedir(), ".figma-relai", "state.json");
  if (existsSync(statePath)) {
    const { room } = loadState();
    results.push({
      check: "state",
      status: "ok",
      detail: room ? `Saved room: ${room}` : "State file present (no room saved yet)",
    });
  } else {
    results.push({
      check: "state",
      status: "ok",
      detail: "No state file yet — will be created on first pairing",
    });
  }

  results.push(
    process.env.FIGMA_TOKEN
      ? { check: "token", status: "ok", detail: "FIGMA_TOKEN set — comments unlocked" }
      : {
          check: "token",
          status: "ok",
          detail: "FIGMA_TOKEN not set — everything works except comments",
          fix: "Optional: add a personal access token to the MCP config env to unlock manage_comments",
        }
  );

  return results;
}

export function renderDoctor(results: CheckResult[]): string {
  const lines = ["figma-relai doctor", ""];
  for (const r of results) {
    lines.push(`${r.status === "ok" ? "✓" : "!"} ${r.check.padEnd(7)} ${r.detail}`);
    if (r.fix) lines.push(`          → ${r.fix}`);
  }
  const warns = results.filter((r) => r.status === "warn").length;
  lines.push("", warns === 0 ? "All clear." : `${warns} thing(s) to look at.`);
  return lines.join("\n");
}
