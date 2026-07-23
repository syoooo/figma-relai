import { registerHandler, isCancelled } from "../dispatcher.js";
import { getNodeById, serializeNode } from "../utils/node-helpers.js";
import { resolveNode, assertSupports } from "../utils/preconditions.js";
import { loadNodeFonts, loadFont } from "../utils/font-loader.js";
import { sendProgressUpdate, delay } from "../progress.js";

registerHandler("scan_text_nodes", async (params) => {
  const parentNode = await resolveNode(params.nodeId as string);
  assertSupports(parentNode, "findAll");

  const textNodes = (parentNode as FrameNode).findAll((n) => n.type === "TEXT") as TextNode[];
  const commandId = params.commandId as string;
  const results = [];
  const chunkSize = 10;

  for (let i = 0; i < textNodes.length; i++) {
    results.push({
      id: textNodes[i].id,
      name: textNodes[i].name,
      characters: textNodes[i].characters,
    });

    if (i % chunkSize === 0) {
      sendProgressUpdate({
        commandId,
        commandType: "scan_text_nodes",
        status: "in_progress",
        progress: Math.round((i / textNodes.length) * 100),
        totalItems: textNodes.length,
        processedItems: i,
        message: `Scanning text nodes: ${i}/${textNodes.length}`,
      });
      await delay();
    }
  }

  return results;
});

registerHandler("set_text_content", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: ["TEXT"] });
  const textNode = node as TextNode;
  await loadNodeFonts(textNode);
  textNode.characters = params.text as string;
  return { id: textNode.id, name: textNode.name, text: textNode.characters };
});

registerHandler("set_multiple_text_contents", async (params) => {
  const texts = params.text as Array<{ nodeId: string; text: string }>;
  const commandId = params.commandId as string;
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    if (isCancelled(commandId)) {
      results.push({
        nodeId: texts[i].nodeId,
        success: false,
        error: `Cancelled by designer (${texts.length - i} items skipped)`,
      });
      break;
    }
    const { nodeId, text } = texts[i];
    try {
      const node = await getNodeById(nodeId);
      if (node && node.type === "TEXT") {
        const textNode = node as TextNode;
        await loadNodeFonts(textNode);
        textNode.characters = text;
        results.push({ nodeId, success: true });
      } else {
        results.push({ nodeId, success: false, error: "Not a text node" });
      }
    } catch (err) {
      results.push({ nodeId, success: false, error: String(err) });
    }

    sendProgressUpdate({
      commandId,
      commandType: "set_multiple_text_contents",
      status: i < texts.length - 1 ? "in_progress" : "completed",
      progress: Math.round(((i + 1) / texts.length) * 100),
      totalItems: texts.length,
      processedItems: i + 1,
      message: `Updating text: ${i + 1}/${texts.length}`,
    });
    await delay(50);
  }

  return results;
});

registerHandler("set_text_style_range", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: ["TEXT"] });
  const textNode = node as TextNode;
  const start = params.start as number;
  const end = params.end as number;
  const len = textNode.characters.length;
  if (start < 0 || end > len || start >= end) {
    throw new Error(
      `Invalid range [${start}, ${end}) for "${textNode.name}" (${textNode.id}): ` +
        `text has ${len} characters and end must be greater than start.`
    );
  }

  await loadNodeFonts(textNode);

  if (params.fontSize !== undefined) {
    textNode.setRangeFontSize(start, end, params.fontSize as number);
  }
  if (params.letterSpacing !== undefined) {
    textNode.setRangeLetterSpacing(start, end, {
      value: params.letterSpacing as number,
      unit: "PIXELS",
    });
  }
  if (params.lineHeight !== undefined) {
    textNode.setRangeLineHeight(start, end, {
      value: params.lineHeight as number,
      unit: "PIXELS",
    });
  }

  return { id: textNode.id, name: textNode.name };
});
