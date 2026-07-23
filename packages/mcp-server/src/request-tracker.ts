import { logger } from "./logger.js";

// Pending request entry with resolve/reject callbacks and timeout tracking
export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

// Manages pending command requests with timeout and progress update support
export class RequestTracker {
  private pending = new Map<string, PendingRequest>();

  // Register a new pending request with timeout
  add(
    id: string,
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void,
    timeoutMs: number = 30000
  ): void {
    const timeout = setTimeout(() => {
      if (this.pending.has(id)) {
        this.pending.delete(id);
        logger.error(`Request ${id} timed out after ${timeoutMs / 1000}s`);
        reject(new Error("Request to Figma timed out"));
      }
    }, timeoutMs);

    this.pending.set(id, {
      resolve,
      reject,
      timeout,
      lastActivity: Date.now(),
    });
  }

  // Resolve a request with result
  resolve(id: string, result: unknown): boolean {
    const request = this.pending.get(id);
    if (!request) return false;

    clearTimeout(request.timeout);
    request.resolve(result);
    this.pending.delete(id);
    return true;
  }

  // Reject a request with error
  reject(id: string, error: Error): boolean {
    const request = this.pending.get(id);
    if (!request) return false;

    clearTimeout(request.timeout);
    request.reject(error);
    this.pending.delete(id);
    return true;
  }

  // Reset timeout on progress update to prevent timeout during long operations
  resetTimeout(id: string, extendedTimeoutMs: number = 60000): void {
    const request = this.pending.get(id);
    if (!request) return;

    request.lastActivity = Date.now();
    clearTimeout(request.timeout);
    request.timeout = setTimeout(() => {
      if (this.pending.has(id)) {
        this.pending.delete(id);
        logger.error(`Request ${id} timed out after extended inactivity`);
        request.reject(new Error("Request to Figma timed out"));
      }
    }, extendedTimeoutMs);
  }

  // Check if a request is pending
  has(id: string): boolean {
    return this.pending.has(id);
  }

  // Reject all pending requests (e.g., on connection close)
  rejectAll(reason: string): void {
    for (const [id, request] of this.pending.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error(reason));
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}
