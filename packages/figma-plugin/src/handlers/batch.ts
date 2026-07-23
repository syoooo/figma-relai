import { registerHandler, dispatch, isCancelled } from "../dispatcher.js";
import { sendProgressUpdate, delay } from "../progress.js";

registerHandler("batch_execute", async (params) => {
  const commands = params.commands as Array<{
    command: string;
    params?: Record<string, unknown>;
  }>;
  const commandId = params.commandId as string;

  const results = [];
  for (let i = 0; i < commands.length; i++) {
    if (isCancelled(commandId)) {
      results.push({
        command: commands[i].command,
        success: false,
        error: `Cancelled by designer (${commands.length - i} commands skipped)`,
      });
      break;
    }
    const { command, params: cmdParams } = commands[i];

    try {
      const result = await dispatch(command, {
        ...cmdParams,
        commandId: `${commandId}_${i}`,
      });
      results.push({ command, success: true, result });
    } catch (error) {
      results.push({
        command,
        success: false,
        error: error instanceof Error ? error.message : String(error),
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
