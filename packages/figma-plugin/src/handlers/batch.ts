import { registerHandler, dispatch, isCancelled } from "../dispatcher.js";
import { sendProgressUpdate, delay } from "../progress.js";
import { isWriteCommand } from "../write-guard.js";
import { classifyError, resultOutcome, SKIPPED_ITEM } from "../call-outcome.js";

// Each item reports its own outcome, so the caller can tell which commands
// ran, which failed, and which a Stop skipped.
registerHandler("batch_execute", async (params) => {
  const commands = params.commands as Array<{
    command: string;
    params?: Record<string, unknown>;
  }>;
  const commandId = params.commandId as string;

  const results = [];
  for (let i = 0; i < commands.length; i++) {
    const { command, params: cmdParams } = commands[i];
    if (isCancelled(commandId)) {
      results.push({
        command,
        success: false,
        error: "Cancelled by designer: skipped before it ran",
        ...SKIPPED_ITEM,
      });
      continue;
    }

    const itemParams = {
      ...cmdParams,
      commandId: `${commandId}_${i}`,
      // The server's protocol comes from the batch, never from an item
      callProtocol: params.callProtocol,
    };
    try {
      const result = await dispatch(command, itemParams);
      results.push({ command, success: true, result, ...resultOutcome(command, result) });
    } catch (error) {
      results.push({
        command,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ...classifyError(error, { phase: "handler", write: isWriteCommand(command, cmdParams ?? {}) }),
      });
    }

    sendProgressUpdate({
      commandId,
      commandType: "batch_execute",
      status: i < commands.length - 1 ? "in_progress" : "completed",
      progress: Math.round(((i + 1) / commands.length) * 100),
      totalItems: commands.length,
      processedItems: i + 1,
      message: `Executing command ${i + 1}/${commands.length}: ${command}`,
    });
    await delay();
  }

  return results;
});
