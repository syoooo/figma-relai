// Response types from the Figma plugin

export interface FigmaResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface CommandProgressUpdate {
  type: "command_progress";
  commandId: string;
  commandType: string;
  status: "started" | "in_progress" | "completed" | "error";
  progress: number;
  totalItems: number;
  processedItems: number;
  currentChunk?: number;
  totalChunks?: number;
  chunkSize?: number;
  message: string;
  payload?: unknown;
  timestamp: number;
}
