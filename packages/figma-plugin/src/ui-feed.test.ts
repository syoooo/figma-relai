import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The activity feed's Stop and settle logic, run against a small stand-in for
// the DOM. The functions are lifted out of ui.html verbatim.
const html = readFileSync(join(import.meta.dir, "..", "ui.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)![1];

function fn(name: string): string {
  const m = script.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {4}\\}`));
  if (!m) throw new Error(`ui.html has no function ${name}`);
  return m[0];
}

class El {
  className = "";
  textContent = "";
  innerHTML = "";
  children: El[] = [];
  parentNode: El | null = null;
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
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  removeChild(c: El) {
    this.children = this.children.filter((x) => x !== c);
    c.parentNode = null;
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

function row(cmd: string) {
  const el = new El("feed-entry");
  for (const c of ["t", "st running", "cmd", "dur"]) el.appendChild(new El(c));
  return { el, cmd, t0: Date.now(), status: "running" };
}

function feed(rows: Record<string, ReturnType<typeof row>>, open = true) {
  const sent: any[] = [];
  const posted: any[] = [];
  const ws = open ? { readyState: 1, send: (s: string) => sent.push(JSON.parse(s)) } : null;
  const run = new Function(
    "entries",
    "ws",
    "WebSocket",
    "roomName",
    "parent",
    "document",
    "t",
    "updateStopBtn",
    "setStopArmed",
    `var runningCount = Object.keys(entries).length;
     var armTimer = null, goTimer = null, busyAt = 0;
     ${fn("feedNote")}
     ${fn("feedSettle")}
     ${fn("stopAll")}
     return { stopAll: stopAll, feedSettle: feedSettle, running: function () { return runningCount; } };`
  );
  const api = run(
    rows,
    ws,
    { OPEN: 1 },
    "room-1",
    { postMessage: (m: any) => posted.push(m.pluginMessage) },
    { createElement: () => new El() },
    (key: string) => `<${key}>`,
    () => {},
    () => {}
  );
  return { ...api, sent, posted };
}

describe("Stop", () => {
  test("asks the plugin and tells the server, without answering for the plugin", () => {
    const rows = { a: row("set_properties") };
    const f = feed(rows);
    f.stopAll();
    expect(f.posted).toEqual([{ type: "cancel-command", id: "a" }]);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].type).toBe("progress_update");
    expect(f.sent[0].message.data).toMatchObject({
      type: "command_progress",
      commandId: "a",
      commandType: "set_properties",
      status: "cancel_requested",
    });
    expect(JSON.stringify(f.sent)).not.toContain("error");
    expect(rows.a.status).toBe("cancelling");
    expect(rows.a.el.texts).toContain("<cancel_requested>");
    expect(f.running()).toBe(0);
  });

  test("the stopAll source sends no error frame", () => {
    expect(fn("stopAll")).not.toContain("error:");
    expect(script).not.toContain("Cancelled by designer");
  });

  test("a result that arrives after Stop settles the row once, as too late", () => {
    const rows = { a: row("execute_figma"), b: row("set_text") };
    const f = feed(rows);
    f.stopAll();
    f.feedSettle("a", true);
    expect(rows.a.status).toBe("ok");
    expect(rows.a.el.texts).toContain("<cancel_too_late>");
    expect(rows.a.el.texts).not.toContain("<cancel_requested>");
    expect(f.running()).toBe(0);
    f.feedSettle("a", false, "late duplicate");
    expect(rows.a.status).toBe("ok");
  });

  test("an error after Stop shows the plugin's own message", () => {
    const rows = { a: row("batch_execute") };
    const f = feed(rows);
    f.stopAll();
    f.feedSettle("a", false, "Cancelled before it started");
    expect(rows.a.status).toBe("err");
    expect(rows.a.el.texts).toContain("Cancelled before it started");
    expect(rows.a.el.texts).not.toContain("<cancel_too_late>");
  });

  test("without a relay link it still asks the plugin", () => {
    const rows = { a: row("set_properties") };
    const f = feed(rows, false);
    f.stopAll();
    expect(f.posted).toEqual([{ type: "cancel-command", id: "a" }]);
    expect(rows.a.status).toBe("cancelling");
  });
});

describe("feed text", () => {
  test("every literal t() key exists in all three locales", () => {
    const keys = [...new Set([...script.matchAll(/\bt\('([a-z_0-9]+)'\)/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of ["en", "ja", "zh"]) {
      const dict = script.match(new RegExp(`${locale}: \\{([\\s\\S]*?)\\n      \\}`))![1];
      const missing = keys.filter((key) => !dict.includes(`${key}:`));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });
});
