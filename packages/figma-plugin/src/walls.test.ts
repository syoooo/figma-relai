import { beforeEach, describe, expect, test } from "bun:test";
import type { LawNotice } from "@figma-relai/shared";
import {
  checkOnClose,
  checkpoint,
  collectNotices,
  commitFromPanel,
  currentWalls,
  initWalls,
  judgeAgentGuards,
  noteVoiceWrite,
  panelVerdict,
  persistSettings,
  persistOtherSettings,
  scriptEnded,
  scriptStarted,
  snapshotVoice,
  wallEnforcer,
  SETTINGS_KEY,
} from "./walls.js";
import { isScopeLocked } from "./write-guard.js";

// Just enough of the figma global for the walls: pages, the file's shared
// plugin data, clientStorage and the panel channel.
const KEY = "seed:abc";
const shared = new Map<string, string>();
const nodes = new Map<string, { id: string; name: string }>();
let store: Record<string, unknown> = {};
const posted: Array<Record<string, unknown>> = [];
const pages = [
  { id: "1:1", name: "Brand" },
  { id: "1:2", name: "Work" },
  { id: "1:3", name: "Legal" },
];
const fakeFigma = {
  root: {
    name: "file",
    children: pages,
    getSharedPluginData: (ns: string, key: string) => shared.get(`${ns}:${key}`) ?? "",
    setSharedPluginData: (ns: string, key: string, value: string) => void shared.set(`${ns}:${key}`, value),
  },
  currentPage: pages[1],
  getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
  clientStorage: {
    getAsync: async (key: string) => (key === SETTINGS_KEY ? structuredClone(store) : undefined),
    setAsync: async (key: string, value: unknown) => {
      if (key === SETTINGS_KEY) store = structuredClone(value) as Record<string, unknown>;
    },
  },
  ui: { postMessage: (m: Record<string, unknown>) => void posted.push(m) },
  notify: () => {},
};

const guards = (...ids: string[]) =>
  shared.set("relai:guards", ids.length ? JSON.stringify({ pages: ids }) : "");
const storedGuards = (): string[] => {
  const raw = shared.get("relai:guards");
  return raw ? (JSON.parse(raw).pages as string[]) : [];
};
const entry = () => (store.wallsByFile as Record<string, Record<string, unknown>>)[KEY];
const settle = () => persistOtherSettings({}); // resolves after every queued write

async function load(initial: Record<string, unknown>, ...guarded: string[]) {
  store = structuredClone(initial);
  guards(...guarded);
  nodes.clear();
  const out = await initWalls(KEY);
  await settle();
  return out;
}

const kinds = (notices: LawNotice[]) => notices.map((n) => `${n.kind}:${"key" in n ? n.key : ""}`);

beforeEach(() => {
  (globalThis as unknown as { figma: unknown }).figma = fakeFigma;
  shared.clear();
  posted.length = 0;
});

describe("loading the walls", () => {
  test("a file's own entry wins over the machine-wide default", async () => {
    await load({
      confirmLevel: "open",
      wallsByFile: { [KEY]: { confirmLevel: "bulk", allowCodeExec: false, scopeLock: null } },
    });
    expect(currentWalls()).toMatchObject({ confirmLevel: "bulk", allowCodeExec: false });
  });

  test("a file without an entry takes the default and gets an entry of its own", async () => {
    const { resolved } = await load({ confirmLevel: "all", allowCodeExec: false, locale: "ja" });
    expect(resolved.perFile).toBe(false);
    expect(entry()).toEqual({ confirmLevel: "all", allowCodeExec: false, scopeLock: null });
    expect(store.locale).toBe("ja");
  });

  test("the legacy machine-wide lock moves into the file whose node it names, then is dropped", async () => {
    store = { scopeLock: { ids: ["5:5"], names: ["Hero"] } };
    nodes.set("5:5", { id: "5:5", name: "Hero" });
    await initWalls(KEY);
    await settle();
    expect(currentWalls().scopeLock).toEqual({ ids: ["5:5"], names: ["Hero"] });
    expect(isScopeLocked()).toBe(true);
    expect(store.scopeLock).toBeUndefined();
    expect(entry().scopeLock).toEqual({ ids: ["5:5"], names: ["Hero"] });
  });

  test("another file's legacy lock is not inherited", async () => {
    await load({ scopeLock: { ids: ["5:5"], names: ["Hero"] } });
    expect(currentWalls().scopeLock).toBeNull();
    expect(isScopeLocked()).toBe(false);
    expect(store.scopeLock).toEqual({ ids: ["5:5"], names: ["Hero"] });
  });
});

describe("panel changes", () => {
  test("change the copy at once and storage after, as this file's entry and the new default", async () => {
    await load({});
    commitFromPanel({ confirmLevel: "bulk" });
    expect(currentWalls().confirmLevel).toBe("bulk");
    await settle();
    expect(entry().confirmLevel).toBe("bulk");
    expect(store.confirmLevel).toBe("bulk");
  });

  test("two quick changes leave the last one stored", async () => {
    await load({});
    commitFromPanel({ confirmLevel: "all" });
    commitFromPanel({ allowCodeExec: false });
    await settle();
    expect(entry()).toMatchObject({ confirmLevel: "all", allowCodeExec: false });
  });

  test("other settings are merged in the same queue and keep other files' entries", async () => {
    await load({ wallsByFile: { "seed:other": { confirmLevel: "open", allowCodeExec: true, scopeLock: null } } });
    commitFromPanel({ confirmLevel: "risk" });
    void persistOtherSettings({ locale: "zh" });
    await settle();
    expect(store.locale).toBe("zh");
    expect((store.wallsByFile as Record<string, unknown>)["seed:other"]).toBeDefined();
    expect(entry().confirmLevel).toBe("risk");
  });

  test("no-go zones go to the file synchronously", async () => {
    await load({});
    commitFromPanel({ guards: ["1:1", "9:9"] });
    expect(storedGuards()).toEqual(["1:1"]);
    expect(currentWalls().guards).toEqual(["1:1"]);
  });
});

describe("checks against storage", () => {
  test("settings a script rewrote are put back and blamed on the script", async () => {
    await load({ wallsByFile: { [KEY]: { confirmLevel: "risk", allowCodeExec: false, scopeLock: null } } });
    store = { ...store, wallsByFile: { [KEY]: { confirmLevel: "open", allowCodeExec: true, scopeLock: null } } };
    const notices = await checkpoint("after_code", snapshotVoice());
    expect(notices).toContainEqual({
      kind: "law_restored",
      key: "settings",
      fields: ["confirmLevel", "allowCodeExec"],
      by: "code",
    });
    await settle();
    expect(entry()).toMatchObject({ confirmLevel: "risk", allowCodeExec: false });
    expect(currentWalls().confirmLevel).toBe("risk");
  });

  test("a cleared no-go list is written back; found later it is not blamed on code", async () => {
    await load({}, "1:1", "1:3");
    guards();
    const notices = await checkpoint("entry");
    expect(storedGuards()).toEqual(["1:1", "1:3"]);
    expect(notices).toEqual([
      {
        kind: "law_restored",
        key: "guards",
        pages: [
          { id: "1:1", name: "Brand" },
          { id: "1:3", name: "Legal" },
        ],
        by: "unknown",
      },
    ]);
  });

  test("a zone the designer lifts while a script runs stays lifted; the script's clear is undone", async () => {
    await load({}, "1:1", "1:3");
    commitFromPanel({ guards: ["1:3"] });
    guards();
    await checkpoint("after_code");
    expect(storedGuards()).toEqual(["1:3"]);
  });

  test("a dial the designer raises while a script runs never rolls back", async () => {
    await load({ wallsByFile: { [KEY]: { confirmLevel: "risk", allowCodeExec: true, scopeLock: null } } });
    commitFromPanel({ confirmLevel: "bulk" });
    // Storage has not caught up yet: rewritten, not reported
    const notices = await checkpoint("after_code");
    expect(kinds(notices)).not.toContain("law_restored:settings");
    await settle();
    expect(entry().confirmLevel).toBe("bulk");
    expect(currentWalls().confirmLevel).toBe("bulk");
  });

  test("stricter values found in storage are adopted", async () => {
    await load({ wallsByFile: { [KEY]: { confirmLevel: "risk", allowCodeExec: true, scopeLock: null } } }, "1:1");
    guards("1:1", "1:2");
    store = { ...store, wallsByFile: { [KEY]: { confirmLevel: "all", allowCodeExec: false, scopeLock: null } } };
    const notices = await checkpoint("entry");
    expect(kinds(notices)).toEqual(["law_tightened_outside:guards", "law_tightened_outside:settings"]);
    expect(currentWalls()).toMatchObject({ confirmLevel: "all", allowCodeExec: false, guards: ["1:1", "1:2"] });
  });

  test("nothing to say when storage matches", async () => {
    await load({}, "1:1");
    expect(await checkpoint("entry")).toEqual([]);
  });

  test("closing puts a cleared no-go list back", async () => {
    await load({}, "1:1");
    guards();
    checkOnClose();
    expect(storedGuards()).toEqual(["1:1"]);
  });
});

describe("voice data around a script", () => {
  test("a script's write to precedents is reported, not reverted", async () => {
    await load({});
    shared.set("relai:memory", "[]");
    const pre = snapshotVoice();
    shared.set("relai:memory", '[{"id":"x"}]');
    const notices = await checkpoint("after_code", pre);
    expect(kinds(notices)).toEqual(["law_edited_by_code:memory"]);
    expect(shared.get("relai:memory")).toBe('[{"id":"x"}]');
  });

  test("Relai's own write during the script is not blamed", async () => {
    await load({});
    const pre = snapshotVoice();
    noteVoiceWrite();
    shared.set("relai:conventions", "# law");
    expect(await checkpoint("after_code", pre)).toEqual([]);
  });
});

describe("agent no-go zones", () => {
  test("an agent may add a zone and lift one it added, but not the designer's", async () => {
    await load({}, "1:1");
    expect(judgeAgentGuards({ add: ["1:2"] })).toEqual(["1:1", "1:2"]);
    expect(judgeAgentGuards({ remove: ["1:2"] })).toEqual(["1:1"]);
    expect(() => judgeAgentGuards({ pages: [] })).toThrow(/^Designer-only: lifting the AI no-go zone on "Brand"/);
    expect(currentWalls().guards).toEqual(["1:1"]);
  });

  test("a zone the designer touched in the panel is the designer's", async () => {
    await load({});
    judgeAgentGuards({ add: ["1:2"] });
    commitFromPanel({ guards: [] });
    commitFromPanel({ guards: ["1:2"] });
    expect(() => judgeAgentGuards({ remove: ["1:2"] })).toThrow(/Designer-only/);
  });

  test("a request with no list is invalid", async () => {
    await load({});
    expect(() => judgeAgentGuards({})).toThrow(/set_guards needs add or remove/);
  });
});

describe("the dispatch check", () => {
  const passed: string[] = [];
  const enforce = wallEnforcer(async (command) => void passed.push(command));

  test("code execution follows the copy, not what a script stored", async () => {
    await load({ wallsByFile: { [KEY]: { confirmLevel: "risk", allowCodeExec: false, scopeLock: null } } });
    store = { ...store, allowCodeExec: true, wallsByFile: {} };
    await expect(enforce("execute_code", { code: "1" })).rejects.toThrow(/Code execution is disabled/);
  });

  test("a zone cleared earlier in a batch is back before the next command", async () => {
    await load({}, "1:1");
    passed.length = 0;
    guards();
    scriptStarted();
    await enforce("set_fill", { nodeId: "2:2" });
    scriptEnded();
    expect(storedGuards()).toEqual(["1:1"]);
    expect(passed).toEqual(["set_fill"]);
    expect(kinds(collectNotices())).toEqual(["law_restored:guards"]);
    expect(collectNotices()).toEqual([]);
  });

  test("set_guards lifting the designer's zone is refused before its handler", async () => {
    await load({}, "1:1");
    passed.length = 0;
    await expect(enforce("set_guards", { pages: [] })).rejects.toMatchObject({ code: "designer_only" });
    expect(passed).toEqual([]);
  });
});

describe("panel messages while a script runs", () => {
  test("designer-only messages wait out the script and 3 s after it", () => {
    scriptStarted();
    expect(panelVerdict("guards-set", 0)).toEqual({ accept: false, reason: "script_running" });
    expect(panelVerdict("focus-node", 0)).toEqual({ accept: true });
    scriptEnded(1000);
    expect(panelVerdict("save-settings", 2000)).toEqual({ accept: false, reason: "script_cooldown" });
    expect(panelVerdict("save-settings", 4000)).toEqual({ accept: true });
  });
});

test("persistSettings writes the copy as it is when the write runs", async () => {
  await load({});
  const first = persistSettings(true);
  commitFromPanel({ confirmLevel: "all" });
  await first;
  await settle();
  expect(entry().confirmLevel).toBe("all");
});
