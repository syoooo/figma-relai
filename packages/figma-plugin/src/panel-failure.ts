import type { PanelFailure } from "@figma-relai/shared";

/**
 * An error the designer can also meet in the panel. The message is what the
 * agent reads, in English; `failure` carries the same facts for the panel,
 * which words them in its own language.
 */
export class PanelFailureError extends Error {
  /** See wroteNothing(). Only a kit store that lost its write may have changed anything. */
  wroteNothing: boolean;

  constructor(
    message: string,
    readonly failure: PanelFailure
  ) {
    super(message);
    this.wroteNothing = failure.code !== "kit_not_kept";
  }
}

/**
 * Whether a handler threw before writing anything, so the call reports
 * `not_applied` instead of `unknown`. Refusals carry `wroteNothing: true`; a
 * handler that wrote something first sets it to false before rethrowing.
 */
export function wroteNothing(error: unknown): boolean {
  return error instanceof Error && (error as { wroteNothing?: unknown }).wroteNothing === true;
}

/** The `failure` field for a panel op result, when the error carries one. */
export function failureField(error: unknown): { failure?: PanelFailure } {
  return error instanceof PanelFailureError ? { failure: error.failure } : {};
}
