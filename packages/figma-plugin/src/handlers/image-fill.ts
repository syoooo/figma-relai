import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";
import { base64ToUint8Array } from "../utils/base64.js";

registerHandler("set_image_fill", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node || !("fills" in node)) throw new Error(`Node not found: ${params.nodeId}`);

  const imageData = params.imageData as string;
  const bytes = base64ToUint8Array(imageData);
  const image = figma.createImage(bytes);

  const scaleMode = (params.scaleMode as string) || "FILL";
  (node as GeometryMixin).fills = [
    {
      type: "IMAGE",
      scaleMode: scaleMode as "FILL" | "FIT" | "CROP" | "TILE",
      imageHash: image.hash,
    },
  ];

  return { id: (node as SceneNode).id, name: (node as SceneNode).name };
});
