import type { PanelFailure } from "@figma-relai/shared";

/**
 * An error the designer can also meet in the panel. The message is what the
 * agent reads, in English; `failure` carries the same facts for the panel,
 * which words them in its own language.
 */
export class PanelFailureError extends Error {
  constructor(
    message: string,
    readonly failure: PanelFailure
  ) {
    super(message);
  }
}

/** The `failure` field for a panel op result, when the error carries one. */
export function failureField(error: unknown): { failure?: PanelFailure } {
  return error instanceof PanelFailureError ? { failure: error.failure } : {};
}
