import { pitfallHint } from "@figma-relai/shared";
import { registerHandler } from "../dispatcher.js";
import { serializeNode } from "../utils/node-helpers.js";

// The execute_figma escape hatch: runs AI-authored JavaScript against the
// Plugin API. Gated by the designer's "Allow code execution" plugin setting.

const MAX_RESULT_CHARS = 50000;

function looksLikeNode(value: unknown): value is SceneNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SceneNode).id === "string" &&
    typeof (value as SceneNode).type === "string" &&
    "parent" in (value as object)
  );
}

// Make an arbitrary return value JSON-safe: nodes become budgeted summaries,
// symbols (figma.mixed) become "mixed", functions are dropped
function serializeResult(value: unknown): unknown {
  if (looksLikeNode(value)) return serializeNode(value);
  if (Array.isArray(value)) return value.map(serializeResult);
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "symbol") return "mixed";
        if (typeof v === "function") return undefined;
        if (looksLikeNode(v)) return serializeNode(v);
        return v;
      }) ?? "null"
    );
  } catch {
    return String(value);
  }
}

registerHandler("execute_code", async (params) => {
  const settings =
    ((await figma.clientStorage.getAsync("relai.settings")) as
      | { allowCodeExec?: boolean }
      | undefined) ?? {};
  if (settings.allowCodeExec === false) {
    throw new Error(
      'Code execution is disabled. The designer can enable it with the "Allow code execution" toggle in the Relai plugin.'
    );
  }

  const code = params.code as string;
  const logs: string[] = [];
  const capturedConsole = {
    log: (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
    warn: (...args: unknown[]) => capturedConsole.log("[warn]", ...args),
    error: (...args: unknown[]) => capturedConsole.log("[error]", ...args),
  };

  // Wrap in an async function so the code can use await and return values
  const fn = new Function(
    "figma",
    "console",
    `"use strict"; return (async () => { ${code}\n })();`
  );
  let value: unknown;
  try {
    value = await fn(figma, capturedConsole);
  } catch (error) {
    // Known Plugin API pitfalls get their remedy appended so the AI can
    // self-correct in one round-trip (registry: shared/src/pitfalls.ts)
    const message = error instanceof Error ? error.message : String(error);
    const hint = pitfallHint(message);
    throw new Error(hint ? `${message} — Hint: ${hint}` : message);
  }

  let result = serializeResult(value);
  let truncated = false;
  const asText = JSON.stringify(result);
  if (asText && asText.length > MAX_RESULT_CHARS) {
    result = `${asText.slice(0, MAX_RESULT_CHARS)}… [truncated ${asText.length - MAX_RESULT_CHARS} chars — return a smaller value]`;
    truncated = true;
  }

  return { result, logs, ...(truncated ? { truncated } : {}) };
});
