// Send progress updates back to the UI (and through to MCP server)

interface ProgressParams {
  commandId: string;
  commandType: string;
  status: "started" | "in_progress" | "completed" | "error";
  progress: number;
  totalItems: number;
  processedItems: number;
  message: string;
  currentChunk?: number;
  totalChunks?: number;
  chunkSize?: number;
  payload?: unknown;
}

export function sendProgressUpdate(params: ProgressParams): void {
  figma.ui.postMessage({
    type: "command_progress",
    ...params,
    timestamp: Date.now(),
  });
}

// Small delay to prevent UI freezing during chunked operations
export function delay(ms: number = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
