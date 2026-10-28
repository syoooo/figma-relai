import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LawNotice } from "@figma-relai/shared";
import { DESIGNER_ONLY_MESSAGES, VOICE_KEYS } from "./wall-core.js";

// The panel's wall notices, approval countdown and kit refusals, lifted out
// of ui.html verbatim and run against stand-ins for the DOM and the plugin.
const html = readFileSync(join(import.meta.dir, "..", "ui.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
const i18nSource = script.match(/var I18N = (\{[\s\S]*?\n {4}\});/)![1];
const I18N = new Function(`return ${i18nSource};`)() as Record<string, Record<string, string>>;
const LOCALES = ["en", "ja", "zh"] as const;

function fn(name: string): string {
  const m = script.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {4}\\}`));
  if (!m) throw new Error(`ui.html has no function ${name}`);
  return m[0];
}

function lift<T>(names: string[], prelude: string, ret: string, args: Record<string, unknown>): T {
  const keys = Object.keys(args);
  const body = `${prelude}\n${names.map(fn).join("\n")}\nreturn ${ret};`;
  return new Function(...keys, body)(...keys.map((k) => args[k])) as T;
}

class El {
  className = "";
  textContent = "";
  innerHTML = "";
  value = "";
  children: El[] = [];
  classList = {
    add: (c: string) => {
      if (!this.classList.contains(c)) this.className = `${this.className} ${c}`.trim();
    },
    contains: (c: string) => this.className.split(/\s+/).includes(c),
  };
  constructor(className = "") {
    this.className = className;
  }
  appendChild(c: El) {
    this.children.push(c);
    return c;
  }
  querySelector(sel: string): El | null {
    const cls = sel.slice(1);
    for (const c of this.children) {
      if (c.classList.contains(cls)) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
  get texts(): string[] {
    return this.children.flatMap((c) => [c.textContent, ...c.texts]).filter(Boolean);
  }
}

const tFor = (locale: string) => (key: string) => I18N[locale]?.[key] || I18N.en[key] || key;

describe("panel text", () => {
  test("the three locales hold the same keys", () => {
    const en = Object.keys(I18N.en).sort();
    expect(Object.keys(I18N.ja).sort()).toEqual(en);
    expect(Object.keys(I18N.zh).sort()).toEqual(en);
  });

  test("every key chosen inside a t() call exists", () => {
    const keys = new Set<string>();
    for (const m of script.matchAll(/\bt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      // Literals compared against (`x === 'script_running'`) are values, not keys
      for (const lit of m[1].matchAll(/(?<!===\s*)'([a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)'/g)) keys.add(lit[1]);
    }
    expect(keys.size).toBeGreaterThan(40);
    const missing = [...keys].filter((k) => !(k in I18N.en));
    expect(missing).toEqual([]);
  });

  test("keys built from a wall vocabulary exist for every member", () => {
    const families = [
      ...["confirmLevel", "allowCodeExec", "scopeLock"].map((f) => `field_${f}`),
      ...VOICE_KEYS.map((k) => `voice_${k}`),
      ...[...DESIGNER_ONLY_MESSAGES].map((m) => `msg_${m.replace(/-/g, "_")}`),
      ...["denied", "timeout", "stopped", "undelivered"].map((w) => `why_${w}`),
    ];
    const missing = families.filter((k) => !(k in I18N.en));
    expect(missing).toEqual([]);
  });

  test("the Japanese text has no long dash and does not call the AI an agent", () => {
    const fresh = Object.keys(I18N.ja).filter(
      (k) => /^(law_|breach_|panel_lost|refused_|field_|voice_|msg_|kit_|moment_healed|why_|approval_left|approval_timed_out|allow_exec_hint)/.test(k)
    );
    for (const k of fresh) {
      expect({ k, v: I18N.ja[k] }).toEqual({ k, v: expect.not.stringMatching(/[—―]|エージェント/) });
    }
  });

  test("the code-execution hint says scripts reach no-go pages and are reported", () => {
    expect(I18N.en.allow_exec_hint).toContain("no-go");
    expect(I18N.ja.allow_exec_hint).toContain("立入禁止");
    expect(I18N.zh.allow_exec_hint).toContain("禁区");
    expect(html).toContain(`data-i18n="allow_exec_hint">${I18N.en.allow_exec_hint}<`);
  });
});

describe("wall notices", () => {
  const page = { id: "1:2", name: "Brand / Masters" };
  // One sample per notice kind; the Record makes a new kind fail to compile here.
  const samples: Record<LawNotice["kind"], LawNotice[]> = {
    law_restored: [
      { kind: "law_restored", key: "guards", pages: [page], by: "code" },
      { kind: "law_restored", key: "guards", pages: [page], by: "unknown" },
      { kind: "law_restored", key: "settings", fields: ["confirmLevel", "scopeLock"], by: "code" },
      { kind: "law_restored", key: "settings", fields: ["allowCodeExec"], by: "unknown" },
    ],
    law_edited_by_code: [
      { kind: "law_edited_by_code", key: "memory", before: { len: 1, fnv: "00000000" }, after: { len: 2, fnv: "11111111" } },
    ],
    law_tightened_outside: [
      { kind: "law_tightened_outside", key: "guards", pages: [page] },
      { kind: "law_tightened_outside", key: "settings", fields: ["confirmLevel"] },
    ],
    script_breach: [
      {
        kind: "script_breach",
        violations: [
          { kind: "guard", count: 3, nodeIds: ["1:3"], pages: [page] },
          { kind: "scope", count: 1, nodeIds: ["1:4"] },
        ],
      },
    ],
    panel_lost: [{ kind: "panel_lost", panelReloaded: true, relayDropped: false }],
    panel_message_refused: [
      { kind: "panel_message_refused", message: "save-settings", reason: "script_running" },
      { kind: "panel_message_refused", message: "approval-response", reason: "script_cooldown" },
    ],
  };

  for (const locale of LOCALES) {
    test(`every kind reads as filled-in text (${locale})`, () => {
      const noticeLines = lift<(n: LawNotice) => string[]>(
        ["pageList", "wordList", "breachText", "noticeLines"],
        "",
        "noticeLines",
        { t: tFor(locale) }
      );
      for (const n of Object.values(samples).flat()) {
        const lines = noticeLines(n);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line).not.toMatch(/[{}]|undefined|^\w+_\w+$/);
        }
      }
      const breach = noticeLines(samples.script_breach[0]);
      expect(breach).toHaveLength(2);
      expect(breach[0]).toContain("Brand / Masters");
      expect(breach[0]).toContain("3");
    });
  }

  test("pinned notice rows are left out of the feed trim", () => {
    expect(fn("feedTrim")).toContain(":not(.pinned)");
    expect(fn("lawNoticeRow")).toContain("wrap.classList.add('pinned')");
  });
});

function feedRow(cmd: string) {
  const el = new El("feed-entry");
  for (const c of ["t", "st running", "cmd", "dur"]) el.appendChild(new El(c));
  return { el, cmd, t0: Date.now(), status: "running" } as Record<string, any>;
}

function feed(rows: Record<string, ReturnType<typeof feedRow>>) {
  return lift<{ feedSettle: Function; feedBreach: Function }>(
    ["feedNote", "feedSettle", "pageList", "wordList", "breachText", "feedBreach"],
    "var runningCount = Object.keys(entries).length;",
    "{ feedSettle: feedSettle, feedBreach: feedBreach }",
    {
      entries: rows,
      document: { createElement: () => new El() },
      t: tFor("en"),
      updateStopBtn: () => {},
      ICON_LAW: "<law>",
    }
  );
}

describe("a script that crossed a wall", () => {
  const violations = [{ kind: "guard", count: 2, nodeIds: ["1:3"], pages: [{ id: "1:2", name: "Masters" }] }];

  test("its row settles vermilion with what it reached, not with a tick", () => {
    const rows = { a: feedRow("execute_figma") };
    const f = feed(rows);
    f.feedSettle("a", true);
    f.feedBreach("a", violations);
    expect(rows.a.el.classList.contains("law")).toBe(true);
    expect(rows.a.el.querySelector(".st")!.className).toBe("st shu");
    expect(rows.a.el.querySelector(".st")!.innerHTML).toBe("<law>");
    expect(rows.a.el.texts.join(" ")).toContain("Masters");
  });

  test("a notice that arrives before the result still wins over the tick", () => {
    const rows = { a: feedRow("execute_figma") };
    const f = feed(rows);
    f.feedBreach("a", violations);
    f.feedSettle("a", true);
    expect(rows.a.el.querySelector(".st")!.className).toBe("st shu");
    f.feedBreach("a", violations);
    expect(rows.a.el.texts.filter((s: string) => s.includes("Masters"))).toHaveLength(1);
  });

  test("no violations leaves a plain success", () => {
    const rows = { a: feedRow("execute_figma") };
    const f = feed(rows);
    f.feedSettle("a", true);
    f.feedBreach("a", undefined);
    expect(rows.a.el.querySelector(".st")!.className).toBe("st ok");
  });

  test("a designer-only refusal wears the law colour", () => {
    const rows = { a: feedRow("set_guards") };
    feed(rows).feedSettle("a", false, "Designer-only: …", "designer_only");
    expect(rows.a.el.classList.contains("law")).toBe(true);
  });
});

describe("approval countdown", () => {
  test("rounds up and stops at zero", () => {
    const left = lift<(d: number, n: number) => number>(["approvalSecondsLeft"], "", "approvalSecondsLeft", {});
    expect(left(120000, 0)).toBe(120);
    expect(left(1000, 1)).toBe(1);
    expect(left(1000, 5000)).toBe(0);
  });

  test("turns amber from 30 seconds down", () => {
    const el = new El("approval-left");
    const render = (deadline: number) =>
      lift<() => void>(["approvalSecondsLeft", "renderApprovalLeft"], "var APPROVAL_LOW_S = 30;", "renderApprovalLeft", {
        approvalQueue: [{ deadline }],
        document: { getElementById: () => el },
        t: tFor("ja"),
      })();
    render(Date.now() + 31500);
    expect(el.textContent).toBe("残り32秒");
    expect(el.className).toBe("approval-left");
    render(Date.now() + 29500);
    expect(el.className).toBe("approval-left low");
  });

  test("a timed-out card settles its row as timed out", () => {
    expect(script).toMatch(/msg\.cause === 'timeout'\) feedSettle\(msg\.id, false, t\('approval_timed_out'\)\)/);
  });
});

describe("a refused designer message", () => {
  function gate() {
    const posted: any[] = [];
    type Fn = (...args: any[]) => any;
    const api = lift<{ answerApproval: Fn; settleApproval: Fn; answerProposal: Fn; onPanelMessageRefused: Fn; setUndo: Fn; state: Fn }>(
      ["answerApproval", "settleApproval", "answerProposal", "onPanelMessageRefused"],
      `var approvalQueue = [{ id: 'a' }, { id: 'b' }];
       var approvalAnswered = [];
       var proposalQueue = [{ id: 'p' }];
       var lastProposalAnswered = null;
       var lastSettingsUndo = null;
       function showNextApproval() {}
       function showNextProposal() {}`,
      `{ answerApproval: answerApproval, settleApproval: settleApproval, answerProposal: answerProposal,
         onPanelMessageRefused: onPanelMessageRefused,
         setUndo: function (f) { lastSettingsUndo = f; },
         state: function () { return { queue: approvalQueue.map(function (r) { return r.id; }),
           answered: approvalAnswered.length, proposals: proposalQueue.length }; } }`,
      {
        parent: { postMessage: (m: any) => posted.push(m.pluginMessage) },
        document: { getElementById: () => ({ value: "", checked: true }) },
      }
    );
    return { ...api, posted };
  }

  test("puts an unsettled approval card back at the front", () => {
    const g = gate();
    g.answerApproval(true);
    expect(g.state().queue).toEqual(["b"]);
    g.onPanelMessageRefused("approval-response");
    expect(g.state().queue).toEqual(["a", "b"]);
  });

  test("forgets an answer once the plugin settles it", () => {
    const g = gate();
    g.answerApproval(false);
    g.settleApproval("a");
    g.onPanelMessageRefused("approval-response");
    expect(g.state().queue).toEqual(["b"]);
  });

  test("puts the proposal back and resyncs a refused no-go change", () => {
    const g = gate();
    g.answerProposal(true);
    expect(g.state().proposals).toBe(0);
    g.onPanelMessageRefused("proposal-response");
    expect(g.state().proposals).toBe(1);
    g.onPanelMessageRefused("guards-set");
    expect(g.posted.at(-1)).toEqual({ type: "guards-refresh" });
  });

  test("undoes a refused settings change once", () => {
    const g = gate();
    let undone = 0;
    g.setUndo(() => undone++);
    g.onPanelMessageRefused("save-settings");
    g.onPanelMessageRefused("save-settings");
    expect(undone).toBe(1);
  });
});

describe("kit card", () => {
  function card() {
    const posts: any[] = [];
    const shown: { body: string; actions: { label: string; fn: () => void; quiet?: boolean }[] }[] = [];
    const box = new El();
    type Fn = (...args: any[]) => any;
    const api = lift<{ momentAct: Fn; onRulesetOpResult: Fn; state: Fn }>(
      ["fmtDate", "sentSep", "skippedText", "kitRefusalText", "momentAct", "releaseMoment", "showMomentResult", "onRulesetOpResult"],
      `var locale = 'en';
       var momentHold = false, momentForceArmed = false, rsPending = null, rsRefusal = null, rsForceArmed = false;
       function rsPost(op, extra) { posts.push([op, extra || null]); }
       function showMomentCard(body, actions) { shown.push({ body: body, actions: actions }); }
       function hideMomentCard() {}
       function evalMoments() {}
       function renderRulesetModal() {}`,
      `{ momentAct: momentAct, onRulesetOpResult: onRulesetOpResult,
         state: function () { return { hold: momentHold, refusal: rsRefusal }; } }`,
      { posts, shown, document: { getElementById: () => box, createElement: () => new El() }, t: tFor("en") }
    );
    return { ...api, posts, shown, box };
  }
  const lease = {
    code: "kit_lease",
    kit: "Core",
    kitChars: 812,
    kitUpdatedAt: "2026-10-20T09:05:00.000Z",
    updatedBy: "Marketing site",
    fileChars: 640,
  };

  test("a refused push stays on the card and says who moved the kit", () => {
    const c = card();
    c.momentAct("push", null, "Core");
    expect(c.box.texts).toEqual([I18N.en.kit_waiting]);
    expect(c.state().hold).toBe(true);
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: false, refusal: lease, message: "refused" });
    const last = c.shown.at(-1)!;
    expect(last.body).toContain("Core");
    expect(last.body).toContain("Marketing site");
    expect(last.body).toContain("812");
    expect(last.body).toMatch(/2026-10-2\d \d\d:\d\d/);
    expect(last.actions.map((a) => a.label)).toEqual([
      I18N.en.kit_export_compare,
      I18N.en.kit_force,
      I18N.en.moment_later,
    ]);
    expect(c.state().hold).toBe(true);
  });

  test("overwriting someone else's push takes two clicks", () => {
    const c = card();
    c.momentAct("push", null, "Core");
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: false, refusal: lease, message: "refused" });
    c.shown.at(-1)!.actions[1].fn();
    expect(c.posts).toEqual([["push", null]]);
    expect(c.shown.at(-1)!.actions[1].label).toBe(I18N.en.kit_force_sure);
    c.shown.at(-1)!.actions[1].fn();
    expect(c.posts.at(-1)).toEqual(["push", { force: true }]);
  });

  test("export from the refusal downloads the kit and keeps the card", () => {
    const c = card();
    c.momentAct("push", null, "Core");
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: false, refusal: lease, message: "refused" });
    c.shown.at(-1)!.actions[0].fn();
    expect(c.posts.at(-1)).toEqual(["export", { name: "Core" }]);
    expect(c.state().hold).toBe(true);
  });

  test("a refused restore offers one overwrite", () => {
    const c = card();
    c.momentAct("restore", null, "Core");
    c.onRulesetOpResult({
      type: "ruleset-op-result",
      op: "restore",
      ok: false,
      refusal: { code: "kit_older", kit: "Core", kitChars: 10, kitUpdatedAt: "2026-10-01T00:00:00Z", fileChars: 99, fileUpdatedAt: "2026-10-27T00:00:00Z" },
      message: "refused",
    });
    const last = c.shown.at(-1)!;
    expect(last.body).toContain("99");
    last.actions[0].fn();
    expect(c.posts.at(-1)).toEqual(["restore", { force: true }]);
  });

  test("a success is shown in place, with the seeds left out", () => {
    const c = card();
    c.momentAct("restore", { force: true }, "Core");
    expect(c.posts).toEqual([["restore", { force: true }]]);
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "restore", ok: true, precedentsSkipped: { count: 4, limit: 50 } });
    const last = c.shown.at(-1)!;
    expect(last.body).toContain("Core");
    expect(last.body).toContain("4");
    expect(last.actions.map((a) => a.label)).toEqual([I18N.en.moment_ok]);
    last.actions[0].fn();
    expect(c.state().hold).toBe(false);
  });

  test("a failure of an action taken in the kit modal stays there, not on the card", () => {
    const c = card();
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: false, refusal: lease, message: "refused" });
    expect(c.shown).toHaveLength(0);
    expect(c.state().refusal.refusal.code).toBe("kit_lease");
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "link", ok: true });
    expect(c.state().refusal).not.toBeNull();
    c.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: true });
    expect(c.state().refusal).toBeNull();
  });

  test("pulling over newer rules keeps the automatic force", () => {
    expect(script).toContain("momentAct('restore', mineNewer ? { force: true } : null, s.linked)");
  });
});

describe("resize handle", () => {
  test("has no fill of its own", () => {
    const rule = html.match(/\.resize-handle \{[\s\S]*?\}/)![0];
    expect(rule).toContain("background: transparent");
  });
});

describe("panel liveness", () => {
  // main.ts reports panel_lost only after the panel has said hello, and only
  // when the hello count or the relay state changes across a command
  test("the panel says hello once when it loads", () => {
    expect(script.match(/type: 'panel-hello'/g)?.length).toBe(1);
  });

  test("the relay link is reported when it opens and when an opened link closes", () => {
    const open = script.match(/ws\.onopen = function \(\) \{[\s\S]*?\n {6}\};/)![0];
    const close = script.match(/ws\.onclose = function \(\) \{[\s\S]*?\n {6}\};/)![0];
    expect(open).toContain("postRelayState(true)");
    expect(close).toContain("if (opened) postRelayState(false)");
    const posted: unknown[] = [];
    lift<(c: boolean) => void>(["postRelayState"], "", "postRelayState", {
      parent: { postMessage: (m: unknown) => posted.push(m) },
    })(false);
    expect(posted).toEqual([{ pluginMessage: { type: "relay-state", connected: false } }]);
  });
});
