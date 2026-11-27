import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LawNotice, PanelFailure } from "@figma-relai/shared";
import { DESIGNER_ONLY_MESSAGES, SCALE_KEYS, VOICE_KEYS } from "./wall-core.js";
import { describeScale } from "./write-guard.js";

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
      ...SCALE_KEYS.map((k) => `scale_${k}`),
      ...[...DESIGNER_ONLY_MESSAGES].map((m) => `msg_${m.replace(/-/g, "_")}`),
      ...["denied", "timeout", "stopped", "undelivered"].map((w) => `why_${w}`),
    ];
    const missing = families.filter((k) => !(k in I18N.en));
    expect(missing).toEqual([]);
  });

  test("the Japanese text has no long dash and does not call the AI an agent", () => {
    const fresh = Object.keys(I18N.ja).filter(
      (k) => /^(law_|breach_|panel_lost|refused_|field_|voice_|msg_|kit_|moment_healed|why_|approval_left|approval_timed_out|approval_hold|allow_exec_hint|fail_)/.test(k)
    );
    for (const k of fresh) {
      expect({ k, v: I18N.ja[k] }).toEqual({ k, v: expect.not.stringMatching(/[—―]|エージェント/) });
    }
  });

  test("the code-execution hint says scripts reach no-go pages and are reported", () => {
    expect(I18N.en.allow_exec_hint).toContain("no-go");
    expect(I18N.ja.allow_exec_hint).toContain("保護ページ");
    expect(I18N.zh.allow_exec_hint).toContain("保护页面");
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
      ["approveWaitSeconds", "answerApproval", "settleApproval", "answerProposal", "onPanelMessageRefused"],
      `var approvalQueue = [{ id: 'a' }, { id: 'b' }];
       var scriptHold = { running: false, approveAt: 0 };
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

describe("approve waits out a script; deny does not", () => {
  type Fn = (...args: any[]) => any;
  function card(locale = "ja") {
    const els: Record<string, any> = {
      approvalApprove: { disabled: false },
      approvalHold: { textContent: "" },
      approvalReason: { value: "" },
    };
    const posted: any[] = [];
    const api = lift<{ onScriptWindow: Fn; answerApproval: Fn; queue: Fn }>(
      ["approveWaitSeconds", "renderApproveHold", "onScriptWindow", "answerApproval"],
      `var approvalQueue = [{ id: 'a' }, { id: 'b' }];
       var approvalAnswered = [];
       var scriptHold = { running: false, approveAt: 0 };
       var scriptHoldTimer = null;
       function showNextApproval() {}`,
      `{ onScriptWindow: onScriptWindow, answerApproval: answerApproval,
         queue: function () { return approvalQueue.map(function (r) { return r.id; }); } }`,
      {
        document: { getElementById: (id: string) => els[id] },
        parent: { postMessage: (m: any) => posted.push(m.pluginMessage) },
        t: tFor(locale),
        setTimeout: () => 1,
        clearTimeout: () => {},
      }
    );
    return { ...api, els, posted };
  }

  test("right after a script, approve is held and the card says how long", () => {
    const c = card("ja");
    c.onScriptWindow({ type: "script-window", running: false, approveAt: Date.now() + 2500 });
    expect(c.els.approvalApprove.disabled).toBe(true);
    expect(c.els.approvalHold.textContent).toBe("スクリプトが終わった直後です。承認はあと3秒で押せます。");
  });

  test("while a script runs, approve is held without a count", () => {
    const c = card("en");
    c.onScriptWindow({ type: "script-window", running: true, approveAt: 0 });
    expect(c.els.approvalApprove.disabled).toBe(true);
    expect(c.els.approvalHold.textContent).toBe(I18N.en.approval_hold_running);
  });

  test("once the wait is over, approve is open and the line is gone", () => {
    const c = card();
    c.onScriptWindow({ type: "script-window", running: false, approveAt: Date.now() - 1 });
    expect(c.els.approvalApprove.disabled).toBe(false);
    expect(c.els.approvalHold.textContent).toBe("");
  });

  test("a press on a held approve sends nothing and leaves the card in place", () => {
    const c = card();
    c.onScriptWindow({ type: "script-window", running: false, approveAt: Date.now() + 2000 });
    c.answerApproval(true);
    expect(c.posted).toEqual([]);
    expect(c.queue()).toEqual(["a", "b"]);
  });

  test("deny goes through while approve is held", () => {
    const c = card();
    c.onScriptWindow({ type: "script-window", running: true, approveAt: 0 });
    c.answerApproval(false);
    expect(c.posted).toEqual([{ type: "approval-response", id: "a", approved: false, reason: "" }]);
    expect(c.queue()).toEqual(["b"]);
  });

  test("the panel listens for the plugin's script window", () => {
    expect(script).toMatch(/msg\.type === 'script-window'\) \{\s*onScriptWindow\(msg\);/);
    expect(html).toMatch(/id="approvalApprove"[^>]*aria-describedby="approvalHold"/);
  });
});

describe("kit card", () => {
  function card() {
    const posts: any[] = [];
    const shown: { body: string; actions: { label: string; fn: () => void; quiet?: boolean }[]; stacked?: boolean }[] = [];
    const box = new El();
    type Fn = (...args: any[]) => any;
    const api = lift<{ momentAct: Fn; onRulesetOpResult: Fn; state: Fn }>(
      ["fmtDate", "sentSep", "skippedText", "failureText", "opFailText", "kitRefusalText", "momentAct", "releaseMoment", "showMomentResult", "onRulesetOpResult"],
      `var locale = 'en';
       var momentHold = false, momentForceArmed = false, rsPending = null, rsRefusal = null, rsForceArmed = false;
       function rsPost(op, extra) { posts.push([op, extra || null]); }
       function showMomentCard(body, actions, stacked) { shown.push({ body: body, actions: actions, stacked: stacked }); }
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
    // Three choices do not fit side by side in the panel: one to a row
    expect(last.stacked).toBe(true);
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

describe("a failed panel action reads in the panel's language", () => {
  // One of each, so the compiler holds this list to the shared type
  const samples: { [C in PanelFailure["code"]]: Extract<PanelFailure, { code: C }> } = {
    precedent_too_long: { code: "precedent_too_long", chars: 300, limit: 280 },
    memory_full: { code: "memory_full", limit: 200 },
    memory_too_big: { code: "memory_too_big", limitKb: 64 },
    not_linked: { code: "not_linked" },
    kit_missing: { code: "kit_missing", kit: "Core" },
    precedent_missing: { code: "precedent_missing" },
    no_rules: { code: "no_rules" },
    rules_too_long: { code: "rules_too_long", chars: 20001, limit: 20000 },
    kit_limit: { code: "kit_limit", limit: 30 },
    kit_not_kept: { code: "kit_not_kept" },
    import_empty: { code: "import_empty" },
    import_no_name: { code: "import_no_name" },
  };
  const agentText = "Precedent text is 300 chars — keep it under 280 (one adjudication, one sentence).";

  function words(locale: string) {
    return lift<{ failureText: (f: PanelFailure) => string; opFailText: (m: unknown) => string }>(
      ["failureText", "opFailText"],
      "",
      "{ failureText: failureText, opFailText: opFailText }",
      { t: tFor(locale) }
    );
  }

  for (const locale of LOCALES) {
    test(`every failure reads as filled-in text (${locale})`, () => {
      const w = words(locale);
      for (const f of Object.values(samples)) {
        const text = w.failureText(f);
        expect({ code: f.code, text }).toEqual({ code: f.code, text: expect.not.stringMatching(/\{|fail_/) });
        if (locale !== "en") expect(text).not.toBe(words("en").failureText(f));
      }
    });
  }

  test("the facts land in the sentence", () => {
    const ja = words("ja");
    expect(ja.failureText(samples.precedent_too_long)).toContain("300");
    expect(ja.failureText(samples.precedent_too_long)).toContain("280");
    expect(ja.failureText(samples.kit_missing)).toContain("「Core」");
    expect(ja.failureText(samples.memory_too_big)).toContain("64KB");
  });

  test("a failure without one keeps the plugin's own text", () => {
    expect(words("ja").opFailText({ ok: false, message: "odd" })).toBe("odd");
    expect(words("ja").opFailText({ ok: false, failure: samples.precedent_too_long, message: agentText })).toBe(
      words("ja").failureText(samples.precedent_too_long)
    );
  });

  test("the precedent dialog shows it under the input or under the row", () => {
    const memErr = new El();
    const api = lift<{ onMemoryOpResult: (m: unknown) => void; rows: () => Record<string, string> }>(
      ["failureText", "opFailText", "setMemError", "onMemoryOpResult"],
      "var memRowErrors = {}; function renderMemory() {}",
      "{ onMemoryOpResult: onMemoryOpResult, rows: function () { return memRowErrors; } }",
      { t: tFor("ja"), document: { getElementById: () => memErr } }
    );
    api.onMemoryOpResult({ type: "memory-op-result", op: "record", ok: false, failure: samples.precedent_too_long, message: agentText });
    expect(memErr.textContent).toBe(words("ja").failureText(samples.precedent_too_long));
    api.onMemoryOpResult({ type: "memory-op-result", op: "promote", ok: false, failure: samples.not_linked, message: "x", id: "p1" });
    expect(api.rows()).toEqual({ p1: words("ja").failureText(samples.not_linked) });
  });

  test("the kit modal and the kit card show it too", () => {
    const shown: string[] = [];
    type Fn = (...args: any[]) => any;
    const api = lift<{ onRulesetOpResult: Fn; momentAct: Fn; refusal: () => any }>(
      ["failureText", "opFailText", "momentAct", "releaseMoment", "showMomentResult", "onRulesetOpResult"],
      `var locale = 'ja';
       var momentHold = false, momentForceArmed = false, rsPending = null, rsRefusal = null, rsForceArmed = false;
       function rsPost() {}
       function showMomentCard(body) { shown.push(body); }
       function hideMomentCard() {}
       function evalMoments() {}
       function renderRulesetModal() {}`,
      "{ onRulesetOpResult: onRulesetOpResult, momentAct: momentAct, refusal: function () { return rsRefusal; } }",
      { shown, t: tFor("ja"), document: { getElementById: () => new El(), createElement: () => new El() } }
    );
    const ja = words("ja");
    api.onRulesetOpResult({ type: "ruleset-op-result", op: "save-from-file", ok: false, failure: samples.rules_too_long, message: "x" });
    expect(api.refusal().message).toBe(ja.failureText(samples.rules_too_long));
    api.momentAct("push", null, "Core");
    api.onRulesetOpResult({ type: "ruleset-op-result", op: "push", ok: false, failure: samples.no_rules, message: "x" });
    expect(shown.at(-1)).toBe(ja.failureText(samples.no_rules));
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

describe("a card's way out", () => {
  // Deny, Dismiss and a file card's Not now share one secondary color. The
  // label is 10px bold, so each state it can be pressed in needs 4.5:1
  // (WCAG 1.4.3); a disabled one is exempt and keeps the disabled grey.
  const css = html.match(/<style>([\s\S]*?)<\/style>/)![1];
  const vars = Object.fromEntries([...css.matchAll(/--([\w-]+): (#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim()),
    body: m[2],
  }));
  const decl = (selector: string, prop: string): string | undefined => {
    const hits = rules.filter((r) => r.selectors.includes(selector));
    const values = hits.flatMap((r) => [...r.body.matchAll(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`, "g"))].map((m) => m[1].trim()));
    const value = values.at(-1);
    return value?.replace(/^var\(--([\w-]+)\)$/, (_, name) => vars[name]);
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const base = ".approval-actions .btn.deny";

  test("every card's quiet button is styled by the same rules", () => {
    const selectors = rules.flatMap((r) => r.selectors).filter((s) => s.includes(".deny"));
    expect(selectors.every((s) => s.startsWith(base))).toBe(true);
    expect(html).toContain(`<button class="btn deny" onclick="answerApproval(false)"`);
    expect(html).toContain(`<button class="btn deny" onclick="answerProposal(false)"`);
    expect(script).toContain(`b.className = 'btn' + (a.quiet ? ' deny' : '');`);
  });

  test("at rest, focused and hovered it reads at 4.5:1 or more", () => {
    const rest = decl(base, "color")!;
    expect(rest).toBe(vars.muted);
    expect(contrast(rest, vars.panel)).toBeGreaterThanOrEqual(4.5);
    // Focus changes only the outline
    expect(decl(".btn:focus-visible", "color")).toBeUndefined();
    expect(decl(`${base}:focus-visible`, "color")).toBeUndefined();
    const hover = decl(`${base}:hover`, "color")!;
    const hoverBg = decl(`${base}:hover`, "background")!;
    expect(contrast(hover, hoverBg)).toBeGreaterThanOrEqual(4.5);
  });

  test("its border is visible and a disabled one looks disabled", () => {
    expect(decl(base, "border-color")).toBe(vars.faint);
    expect(decl(`${base}:disabled`, "color")).toBe(vars.faint);
    expect(decl(`${base}:disabled:hover`, "color")).toBe(vars.faint);
    expect(decl(`${base}:disabled`, "border-color")).toBe(vars.line);
    expect(decl(`${base}:disabled`, "color")).not.toBe(decl(base, "color"));
  });
});

describe("labels the panel words", () => {
  const body = html.slice(html.indexOf("<body"), html.indexOf("<script>"));

  test("headings and accessible names come from the dictionary", () => {
    // Every heading span and card title with text of its own names a key,
    // and its markup text is the English
    let headings = 0;
    for (const m of body.matchAll(/<(span|div) class="(?:key|approval-title)"([^>]*)>([^<]*)</g)) {
      if (m[3] === "") continue;
      headings++;
      const key = m[2].match(/data-i18n="([a-z_0-9]+)"/)?.[1];
      expect(key, m[0]).toBeDefined();
      expect(m[3].replace("&rsaquo;", "\u203a")).toBe(I18N.en[key!]);
    }
    expect(headings).toBeGreaterThanOrEqual(12);
    expect(body).toContain('<span data-i18n="token_chip">ACCESS TOKEN</span>');
    // The window buttons get theirs from renderWindowControls
    for (const m of body.matchAll(/<[^>]*aria-label="([^"]*)"[^>]*>/g)) {
      if (/id="(?:minimizeBtn|resizeHandle)"/.test(m[0])) continue;
      const key = m[0].match(/data-i18n-aria="([a-z_0-9]+)"/)?.[1];
      expect(key, m[0]).toBeDefined();
      expect(m[1]).toBe(I18N.en[key!]);
    }
    for (const m of script.matchAll(/setAttribute\('aria-label', ([^)]*\)?)\)/g)) {
      expect(m[1], m[0]).toMatch(/^(t\(|button\.title|t\(el\.getAttribute)/);
    }
  });

  test("switching the language rewords accessible names and an open approval card", () => {
    const named = { key: "aria_close", label: "close" };
    const el = {
      getAttribute: (name: string) => (name === "data-i18n-aria" ? named.key : null),
      setAttribute: (name: string, value: string) => {
        if (name === "aria-label") named.label = value;
      },
    };
    const redrawn: number[] = [];
    const run = (queue: unknown[]) =>
      lift<() => void>(
        ["applyI18n"],
        `var locale = 'ja';
         var approvalQueue = queue;
         function renderMemory() {}
         function refreshStatusTexts() {}
         function renderClient() {}
         function renderWindowControls() {}
         function showNextApproval() { redrawn.push(approvalQueue.length); }`,
        "applyI18n",
        {
          queue,
          redrawn,
          t: tFor("ja"),
          document: {
            documentElement: {},
            querySelectorAll: (sel: string) => (sel === "[data-i18n-aria]" ? [el] : []),
            getElementById: () => new El(),
          },
        }
      )();
    run([]);
    expect(named.label).toBe(I18N.ja.aria_close);
    expect(redrawn).toEqual([]);
    // The card's scale line and "no description" line are worded when it is drawn
    run([{ id: "a1" }]);
    expect(redrawn).toEqual([1]);
  });

  test("the approval card's scale line reads as before in English and follows the panel's language", () => {
    const scaleText = (locale: string) =>
      lift<(parts: unknown) => string>(["scaleText"], "", "scaleText", { t: tFor(locale) });
    const en = scaleText("en");
    const batch = describeScale("batch_execute", {
      commands: [
        { command: "execute_code", params: { code: "" } },
        { command: "delete_variable", params: { variableId: "V:1" } },
        { command: "delete_style", params: { styleId: "S:1" } },
        { command: "flatten_node", params: { nodeId: "1:1" } },
      ],
    });
    expect(en(batch)).toBe("4 commands · contains execute_code · 2 ghost-risk · 1 irreversible");
    expect(en(describeScale("delete_node", { nodeId: "1:1" }))).toBe("1 node");
    expect(en(describeScale("delete_variable", { variableId: "V:1" }))).toBe("ghost-risk");
    expect(en(describeScale("set_instance_overrides", { targetNodeIds: ["a", "b"] }))).toBe("2 nodes");
    expect(en(describeScale("execute_code", {}))).toBe("");
    const ja = scaleText("ja");
    expect(ja([{ key: "nodes", n: 3 }])).toBe(I18N.ja.scale_nodes.replace("{n}", "3"));
    expect(ja(batch)).toBe("コマンド4件 · execute_codeを含む · 2件は削除後も参照が残る · 1件は元に戻せない");
    // What stays unseen is the deleted variable or style; the reference itself stays on the layer
    expect(ja([{ key: "ghost" }])).toBe("削除後も参照が残る");
    expect(scaleText("zh")([{ key: "ghost_n", n: 2 }])).toBe("其中2条删除后引用仍在");
  });

  test("the Japanese file card is titled as the file, not as a path, and does not say who deleted a kit", () => {
    expect(I18N.ja.moment_label).toBe("このファイル");
    expect(I18N.zh.moment_label).toBe("这个文件");
    // The kit may have been deleted from another file
    expect(I18N.ja.moment_kit_gone).toStartWith("ルールセット「{kit}」は削除されました。");
    // Counts in a row are parted with the same dot as the rest of the panel
    expect(I18N.ja.kit_meta).toBe("{chars}字 · メモ{seeds}件");
  });

  test("the Japanese and Chinese panels word their headings, accessible names and scale line", () => {
    const keys = Object.keys(I18N.en).filter((k) => /^(rules|memory|guards|guards_modal|token|kits|sessions|moment|status)_label$|^token_chip$|^aria_|^scale_/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(28);
    for (const locale of ["ja", "zh"] as const) {
      for (const k of keys) {
        // execute_code stays the tool's own name; the rest is no longer the English
        expect({ k, v: I18N[locale][k] }).toEqual({ k, v: expect.not.stringMatching(/^[A-Z\s›-]+$|\b(node|command|ghost|irreversible|unreadable|close|kit|precedent|Loading|Language|Approvals|client)\b/) });
      }
    }
  });
});
