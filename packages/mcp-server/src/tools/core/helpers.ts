// Shared helpers for the consolidated core tools

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function jsonResult(value: unknown) {
  return textResult(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export function errorResult(error: unknown) {
  return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
