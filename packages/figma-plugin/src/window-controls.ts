export const DEFAULT_WINDOW_SIZE = { width: 380, height: 850 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 1200;
const MINIMIZED_HEIGHT = 64;

interface WindowUI {
  resize(width: number, height: number): void;
  postMessage(message: unknown): void;
}

/** Window controls are local UI actions; they never dispatch canvas commands. */
export function createWindowControls(ui: WindowUI): (message: unknown) => boolean {
  let width = DEFAULT_WINDOW_SIZE.width;
  let height = DEFAULT_WINDOW_SIZE.height;
  let minimized = false;

  function update(): void {
    const visibleHeight = minimized ? MINIMIZED_HEIGHT : height;
    ui.resize(width, visibleHeight);
    ui.postMessage({ type: "window-state", width, height: visibleHeight, minimized });
  }

  return (message) => {
    if (!message || typeof message !== "object") return false;
    const msg = message as Record<string, unknown>;
    if (msg.type === "window-resize") {
      if (minimized) return true;
      if (typeof msg.width !== "number" || !Number.isFinite(msg.width) ||
          typeof msg.height !== "number" || !Number.isFinite(msg.height)) return true;
      width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(msg.width)));
      height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(msg.height)));
      update();
      return true;
    }
    if (msg.type === "window-minimize") {
      if (typeof msg.minimized !== "boolean") return true;
      minimized = msg.minimized;
      update();
      return true;
    }
    return false;
  };
}
