// Support layer for execute_code: a figma proxy that tracks created nodes,
// the `relai.*` convenience helpers (correct-by-construction shortcuts for
// the most common Plugin API pitfalls), and a post-run lint for mistakes
// that don't throw. Lint rules stay zero-ambiguity — no false positives.

// Factory methods whose results we track for post-run linting
export const CREATE_METHODS = new Set([
  "createRectangle", "createFrame", "createComponent", "createComponentFromNode",
  "createText", "createEllipse", "createPolygon", "createStar", "createLine",
  "createVector", "createSection", "createNodeFromSvg", "createSticky",
  "createTable", "createConnector", "createCodeBlock", "createSlice",
  "combineAsVariants", "group",
]);

// Wrap the figma global so nodes created by the script (directly or through
// relai.*) are recorded for linting
export function makeFigmaProxy(figma: PluginAPI, onCreate: (node: unknown) => void): PluginAPI {
  return new Proxy(figma, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        if (CREATE_METHODS.has(String(prop))) {
          return (...args: unknown[]) => {
            const node = (value as (...a: unknown[]) => unknown).apply(target, args);
            onCreate(node);
            return node;
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  }) as PluginAPI;
}

// ── relai.* helpers ──────────────────────────────────────────────────

interface TextOpts {
  font?: FontName;
  size?: number;
  color?: RGB;
  name?: string;
  x?: number;
  y?: number;
}

// Batch property set that dodges two ordering traps: layoutMode is applied
// first, and width/height are routed through resize()
export function setProps<T>(node: T, props: Record<string, unknown>): T {
  if (props.layoutMode !== undefined) {
    (node as Record<string, unknown>).layoutMode = props.layoutMode;
  }
  if (props.width !== undefined || props.height !== undefined) {
    const target = node as unknown as { width: number; height: number; resize: (w: number, h: number) => void };
    target.resize(
      (props.width as number | undefined) ?? target.width,
      (props.height as number | undefined) ?? target.height
    );
  }
  for (const [key, value] of Object.entries(props)) {
    if (key === "layoutMode" || key === "width" || key === "height") continue;
    (node as Record<string, unknown>)[key] = value;
  }
  return node;
}

export function makeRelai(f: PluginAPI) {
  return {
    // Font-safe text creation: loads the font BEFORE writing characters
    async text(parent: BaseNode & ChildrenMixin | null, characters: string, opts: TextOpts = {}) {
      const font = opts.font ?? { family: "Inter", style: "Regular" };
      await f.loadFontAsync(font);
      const t = f.createText();
      t.fontName = font;
      t.characters = characters;
      if (opts.size !== undefined) t.fontSize = opts.size;
      if (opts.color) t.fills = [{ type: "SOLID", color: opts.color }];
      if (opts.name) t.name = opts.name;
      (parent ?? f.currentPage).appendChild(t);
      if (opts.x !== undefined) t.x = opts.x;
      if (opts.y !== undefined) t.y = opts.y;
      return t;
    },

    // Auto-layout frame with both axes hugging — the right default container
    autoLayout(direction: "HORIZONTAL" | "VERTICAL" = "HORIZONTAL", props: Record<string, unknown> = {}) {
      const frame = f.createFrame();
      frame.layoutMode = direction;
      frame.primaryAxisSizingMode = "AUTO";
      frame.counterAxisSizingMode = "AUTO";
      return setProps(frame, props);
    },

    // Ordering-safe batch set (layoutMode first, width/height via resize)
    set: setProps,

    // HUG that actually sticks — call AFTER appending children
    hug(node: SceneNode) {
      (node as FrameNode).layoutSizingHorizontal = "HUG";
      return node;
    },

    // Focus ring that renders: clipsContent + double spread shadows
    focusRing(node: SceneNode, color: RGB = { r: 0.08, g: 0.4, b: 0.92 }) {
      if ("clipsContent" in node) (node as FrameNode).clipsContent = true;
      (node as FrameNode).effects = [
        { type: "DROP_SHADOW", color: { r: 1, g: 1, b: 1, a: 1 }, offset: { x: 0, y: 0 }, radius: 0, spread: 2, visible: true, blendMode: "NORMAL" },
        { type: "DROP_SHADOW", color: { ...color, a: 1 }, offset: { x: 0, y: 0 }, radius: 0, spread: 4, visible: true, blendMode: "NORMAL" },
      ];
      return node;
    },

    // Content-based page lookup — survives designers renaming pages
    async page(predicate: (page: PageNode) => boolean) {
      for (const p of f.root.children) {
        await p.loadAsync();
        if (predicate(p)) return p;
      }
      return null;
    },
  };
}

// ── post-run lint: silent mistakes that never throw ─────────────────

export interface LintTarget {
  id?: string;
  name?: string;
  effects?: ReadonlyArray<{ type: string; spread?: number; visible?: boolean }>;
  clipsContent?: boolean;
}

export function lintCreatedNodes(nodes: readonly LintTarget[]): string[] {
  const warnings: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const hasSpread = (node.effects ?? []).some(
      (e) =>
        (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") &&
        (e.spread ?? 0) > 0 &&
        e.visible !== false
    );
    if (hasSpread && node.clipsContent === false) {
      warnings.push(
        `"${node.name}" (${node.id}) has spread shadows but clipsContent is false — the spread will not render. Set clipsContent = true (or use relai.focusRing).`
      );
    }
  }
  return warnings;
}
