import type { ErrorCategory, ToolError, RecoveryOption } from "@figma-relai/shared";

// Build a structured error response for v2 tools
export function errorResult(
  category: ErrorCategory,
  message: string,
  recovery: RecoveryOption,
  extra?: {
    preconditions?: { required: string; current_state: string };
    partial_result?: unknown;
  }
) {
  const error: ToolError = {
    category,
    message,
    recovery,
  };
  if (extra?.preconditions) error.preconditions = extra.preconditions;
  if (extra?.partial_result !== undefined) error.partial_result = extra.partial_result;

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error }, null, 2) }],
  };
}

// Shortcut for common precondition failures
export function noSelectionError() {
  return errorResult(
    "precondition_failed",
    "No nodes selected in Figma",
    {
      suggestion: "Select nodes in Figma, or use search_nodes to find nodes by name/type",
      tool: "search_nodes",
    },
    { preconditions: { required: "At least 1 node selected", current_state: "Selection is empty" } }
  );
}

export function nodeNotFoundError(nodeId: string) {
  return errorResult(
    "invalid_input",
    `Node '${nodeId}' not found`,
    {
      suggestion: "The node may have been deleted or the ID is incorrect. Use search_nodes to find the correct node.",
      tool: "search_nodes",
    }
  );
}

export function typeMismatchError(nodeId: string, nodeName: string, nodeType: string, requiredTypes: string[]) {
  return errorResult(
    "type_mismatch",
    `Node '${nodeName}' (${nodeId}) is ${nodeType}, but this operation requires ${requiredTypes.join(" or ")}`,
    {
      suggestion: `Target a ${requiredTypes[0]} node instead, or check the parent node`,
      tool: "get_node_details",
      args: { nodeId },
    },
    { preconditions: { required: `Node type: ${requiredTypes.join(" | ")}`, current_state: `Node type: ${nodeType}` } }
  );
}

export function connectionError() {
  return errorResult(
    "connection_error",
    "Not connected to Figma plugin",
    {
      suggestion: "Call join_room first with the room name from the Figma plugin UI",
      tool: "join_room",
    },
    { preconditions: { required: "Connected to Figma plugin", current_state: "No active connection" } }
  );
}
