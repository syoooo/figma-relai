// Support layer for execute_code: a figma proxy that tracks created nodes,
// the `relai.*` convenience helpers (correct-by-construction shortcuts for
// the most common Plugin API pitfalls), and a post-run lint for mistakes
// that don't throw. Lint rules stay zero-ambiguity — no false positives.

// NOTE: never wrap the `figma` global in a Proxy — its methods are
// non-configurable data properties, so any get trap that returns a wrapper
// violates the Proxy invariant and the sandbox throws
// "proxy: inconsistent get". Created-node tracking uses nodechange events
// instead (see event-buffer.ts).

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

export function makeRelai(f: PluginAPI, onCreate: (node: SceneNode) => void = () => {}) {
  return {
    // Font-safe text creation: loads the font BEFORE writing characters
    async text(parent: BaseNode & ChildrenMixin | null, characters: string, opts: TextOpts = {}) {
      const font = opts.font ?? { family: "Inter", style: "Regular" };
      await f.loadFontAsync(font);
      const t = f.createText();
      onCreate(t);
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
      onCreate(frame);
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

    // Small CSS-like search: relai.query("FRAME[name^=Card] TEXT") on the
    // current page, or relai.query(node, selector) to scope to a subtree
    query(scopeOrSelector: SceneNode | PageNode | string, maybeSelector?: string): SceneNode[] {
      const scope = typeof scopeOrSelector === "string" ? f.currentPage : scopeOrSelector;
      const selector = typeof scopeOrSelector === "string" ? scopeOrSelector : maybeSelector ?? "*";
      return queryNodes(scope as unknown as QueryNode, selector) as unknown as SceneNode[];
    },

    // Construction veil: shows the designer where the AI is still working.
    // relai.placeholder(frame) to show, relai.placeholder(frame, false) when done.
    placeholder(node: SceneNode, on = true) {
      const VEIL = "relai:placeholder";
      if (!("children" in node)) return node;
      const container = node as FrameNode;
      if (on) {
        if (container.children.some((c) => c.name === VEIL)) return node;
        const veil = f.createRectangle();
        veil.name = VEIL;
        veil.resize(Math.max(container.width, 1), Math.max(container.height, 1));
        veil.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.84, b: 0.8 }, opacity: 0.75 }];
        veil.locked = true;
        container.appendChild(veil);
        if ("layoutMode" in container && container.layoutMode !== "NONE") {
          veil.layoutPositioning = "ABSOLUTE";
        }
        veil.x = 0;
        veil.y = 0;
      } else {
        for (const c of [...container.children]) {
          if (c.name === VEIL) c.remove();
        }
      }
      return node;
    },
  };
}

// ── relai.query: a deliberately small CSS-like selector subset ───────
// Supported: TYPE (case-insensitive), *, [name=X] [name*=X] [name^=X]
// [name$=X], descendant (space), direct child (>), comma union.
// NOT supported (use findAll for these): pseudo-classes, dot-path attrs,
// sibling combinators.

export interface QueryNode {
  type: string;
  name: string;
  parent?: QueryNode | null;
  children?: readonly QueryNode[];
}

interface SimpleSelector {
  type: string | null; // null = any
  attrs: Array<{ op: "=" | "*=" | "^=" | "$="; value: string }>;
}

interface CompiledSelector {
  parts: SimpleSelector[];
  combinators: Array<" " | ">">; // between parts, length = parts.length - 1
}

function parseSimple(token: string): SimpleSelector {
  const attrs: SimpleSelector["attrs"] = [];
  let rest = token;
  let m: RegExpMatchArray | null;
  while ((m = rest.match(/\[name(\*=|\^=|\$=|=)([^\]]*)\]/))) {
    attrs.push({ op: m[1] as SimpleSelector["attrs"][number]["op"], value: m[2] });
    rest = rest.replace(m[0], "");
  }
  rest = rest.trim();
  const type = rest === "" || rest === "*" ? null : rest.toUpperCase();
  return { type, attrs };
}

// Whitespace/">" split that ignores separators inside [...] so attribute
// values may contain spaces; also handles "FRAME>TEXT" without spaces
function tokenize(alt: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  const flush = () => {
    if (current) tokens.push(current);
    current = "";
  };
  for (const ch of alt) {
    if (ch === "[") depth++;
    if (ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      flush();
      continue;
    }
    if (depth === 0 && ch === ">") {
      flush();
      tokens.push(">");
      continue;
    }
    current += ch;
  }
  flush();
  return tokens;
}

export function parseSelector(input: string): CompiledSelector[] {
  return input.split(",").map((alt) => {
    const tokens = tokenize(alt.trim());
    const parts: SimpleSelector[] = [];
    const combinators: Array<" " | ">"> = [];
    let pendingChild = false;
    for (const tok of tokens) {
      if (tok === ">") {
        pendingChild = true;
        continue;
      }
      if (parts.length > 0) combinators.push(pendingChild ? ">" : " ");
      pendingChild = false;
      parts.push(parseSimple(tok));
    }
    return { parts, combinators };
  });
}

function matchesSimple(node: QueryNode, s: SimpleSelector): boolean {
  if (s.type && node.type !== s.type) return false;
  for (const a of s.attrs) {
    const name = node.name ?? "";
    if (a.op === "=" && name !== a.value) return false;
    if (a.op === "*=" && !name.includes(a.value)) return false;
    if (a.op === "^=" && !name.startsWith(a.value)) return false;
    if (a.op === "$=" && !name.endsWith(a.value)) return false;
  }
  return true;
}

// Right-to-left matching, ancestry walk stops at (and excludes) the scope
function matchesCompiled(node: QueryNode, sel: CompiledSelector, scope: QueryNode): boolean {
  const { parts, combinators } = sel;
  if (!matchesSimple(node, parts[parts.length - 1])) return false;
  let current: QueryNode | null | undefined = node;
  for (let i = parts.length - 2; i >= 0; i--) {
    const comb = combinators[i];
    let ancestor: QueryNode | null | undefined = current?.parent;
    if (comb === ">") {
      // Direct parent must match (the scope itself may be that parent)
      if (!ancestor || !matchesSimple(ancestor, parts[i])) return false;
      current = ancestor;
    } else {
      let found: QueryNode | null = null;
      while (ancestor) {
        if (matchesSimple(ancestor, parts[i])) { found = ancestor; break; }
        if (ancestor === scope) break;
        ancestor = ancestor.parent;
      }
      if (!found) return false;
      current = found;
    }
  }
  return true;
}

export function queryNodes(scope: QueryNode, selector: string): QueryNode[] {
  // Alternatives with no parts (empty/garbage selectors) match nothing
  const compiled = parseSelector(selector).filter((sel) => sel.parts.length > 0);
  if (compiled.length === 0) return [];
  const out: QueryNode[] = [];
  const walk = (node: QueryNode) => {
    for (const child of node.children ?? []) {
      if (compiled.some((sel) => matchesCompiled(child, sel, scope)) && !out.includes(child)) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(scope);
  return out;
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
