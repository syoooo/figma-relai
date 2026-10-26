// Shared helpers for the consolidated core tools
import { CALL_META_KEY, ERROR_DEFAULTS, RelaiError, type CallMeta } from "@figma-relai/shared";

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function jsonResult(value: unknown) {
  return textResult(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

/**
 * A failed tool result: isError set and the error code in the metadata. The
 * text still starts with "Error: " for callers that match on it. A coded
 * error (anything the call envelope or the request tracker threw) keeps its
 * code; any other error is the tool's own and reports tool_error. The call
 * envelope fills in the commands sent and the outcome.
 */
export function errorResult(error: unknown) {
  const code = error instanceof RelaiError ? error.code : "tool_error";
  const retry = error instanceof RelaiError ? error.retry : ERROR_DEFAULTS.tool_error.retry;
  const meta: CallMeta = { v: 1, error: { code, retry }, calls: [] };
  return {
    ...textResult(`Error: ${error instanceof Error ? error.message : String(error)}`),
    isError: true as const,
    _meta: { [CALL_META_KEY]: meta },
  };
}
