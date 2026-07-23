// Structured error model for v2 tools

export type ErrorCategory =
  | "precondition_failed"
  | "invalid_input"
  | "type_mismatch"
  | "partial_failure"
  | "state_changed"
  | "capability_limit"
  | "connection_error";

export interface RecoveryOption {
  suggestion: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export interface ToolError {
  category: ErrorCategory;
  message: string;
  preconditions?: {
    required: string;
    current_state: string;
  };
  recovery: RecoveryOption;
  partial_result?: unknown;
}
