import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";
import { uint8ArrayToBase64 } from "../utils/base64.js";

registerHandler("export_node_as_image", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("exportAsync" in node)) throw new Error(`Node not found: ${params.nodeId}`);

  const format = (params.format as string) || "PNG";
  const scale = (params.scale as number) || 1;

  const bytes = await (node as SceneNode).exportAsync({
    format: format as "PNG" | "JPG" | "SVG" | "PDF",
    constraint: { type: "SCALE", value: scale },
  });

  return {
    format,
    imageData: uint8ArrayToBase64(bytes),
  };
});

registerHandler("create_image_from_url", async (params) => {
  const url = params.url as string;
  const image = await figma.createImageAsync(url);
  const node = figma.createRectangle();
  node.resize((params.width as number) || 200, (params.height as number) || 200);
  if (params.x !== undefined) node.x = params.x as number;
  if (params.y !== undefined) node.y = params.y as number;
  node.name = (params.name as string) || "Image";
  node.fills = [{
    type: "IMAGE",
    scaleMode: (params.scaleMode as "FILL" | "FIT" | "CROP" | "TILE") || "FILL",
    imageHash: image.hash,
  }];
  return { id: node.id, name: node.name };
});

registerHandler("get_screenshot", async (params) => {
  let node: BaseNode | null;
  if (params.nodeId) {
    node = await getNodeById(params.nodeId as string);
  } else {
    const selection = figma.currentPage.selection;
    node = selection.length > 0 ? selection[0] : figma.currentPage;
  }

  if (!node || !("exportAsync" in node)) throw new Error("No node to screenshot");

  const scale = (params.scale as number) || 1;
  const bytes = await (node as SceneNode).exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: scale },
  });

  return { imageData: uint8ArrayToBase64(bytes) };
});
