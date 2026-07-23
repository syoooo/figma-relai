import type {
  ToolResponse,
  ToolWarning,
  RecommendedTool,
  PartialFailure,
} from "@figma-relai/shared";

// Build a standard v2 tool success response
export function standardResult<T>(opts: {
  summary: string;
  data: T;
  warnings?: ToolWarning[];
  recommended_next?: RecommendedTool[];
  partial_failures?: PartialFailure[];
}) {
  const response: ToolResponse<T> = {
    summary: opts.summary,
    data: opts.data,
  };
  if (opts.warnings?.length) response.warnings = opts.warnings;
  if (opts.recommended_next?.length) response.recommended_next = opts.recommended_next;
  if (opts.partial_failures?.length) response.partial_failures = opts.partial_failures;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
  };
}

// Simple text result (for compatibility with v1 tools)
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
