import { describe, expect, test } from "bun:test";
import { createWindowControls } from "./window-controls.js";

function panel() {
  const sizes: Array<{ width: number; height: number }> = [];
  const messages: unknown[] = [];
  const handle = createWindowControls({
    resize: (width, height) => sizes.push({ width, height }),
    postMessage: (message) => messages.push(message),
  });
  return { handle, sizes, messages };
}

describe("plugin window controls", () => {
  test("restores the last expanded size across repeated minimize cycles", () => {
    const { handle, sizes, messages } = panel();
    handle({ type: "window-resize", width: 520, height: 640 });
    for (let i = 0; i < 2; i++) {
      handle({ type: "window-minimize", minimized: true });
      expect(sizes.at(-1)).toEqual({ width: 520, height: 64 });
      handle({ type: "window-minimize", minimized: false });
      expect(sizes.at(-1)).toEqual({ width: 520, height: 640 });
    }
    expect(messages.at(-1)).toEqual({ type: "window-state", width: 520, height: 640, minimized: false });
  });

  test("restores the default size when minimized before the first resize", () => {
    const { handle, sizes } = panel();
    handle({ type: "window-minimize", minimized: true });
    handle({ type: "window-minimize", minimized: false });
    expect(sizes.at(-1)).toEqual({ width: 380, height: 850 });
  });

  test("clamps to usable bounds and rounds fractional pixels", () => {
    const { handle, sizes } = panel();
    handle({ type: "window-resize", width: -100, height: 0 });
    handle({ type: "window-resize", width: 100000, height: 100000 });
    handle({ type: "window-resize", width: 400.4, height: 500.6 });
    expect(sizes).toEqual([
      { width: 320, height: 320 },
      { width: 960, height: 1200 },
      { width: 400, height: 501 },
    ]);
  });

  test("ignores malformed dimensions and minimize messages", () => {
    const { handle, sizes, messages } = panel();
    for (const value of [undefined, null, "400", NaN, Infinity, -Infinity]) {
      handle({ type: "window-resize", width: value, height: 500 });
      handle({ type: "window-resize", width: 400, height: value });
      handle({ type: "window-minimize", minimized: value });
    }
    expect(sizes).toEqual([]);
    expect(messages).toEqual([]);
  });

  test("ignores late drag events while minimized without losing the expanded size", () => {
    const { handle, sizes } = panel();
    handle({ type: "window-resize", width: 480, height: 700 });
    handle({ type: "window-minimize", minimized: true });
    handle({ type: "window-resize", width: 600, height: 64 });
    expect(sizes).toHaveLength(2);
    handle({ type: "window-minimize", minimized: false });
    expect(sizes.at(-1)).toEqual({ width: 480, height: 700 });
  });

  test("leaves settings and canvas messages to their existing handlers", () => {
    const { handle, sizes } = panel();
    for (const msg of [null, undefined, "window-resize", {}, { type: "save-settings" }, { type: "execute-command" }]) {
      expect(handle(msg)).toBe(false);
    }
    expect(sizes).toEqual([]);
  });
});
