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

  // Not every model gets to see the image — a team allowlist can strip vision
  // and leave the assistant staring at a blob. The measurements it would have
  // read off the picture come back as text so the work can continue blind.
  return { imageData: uint8ArrayToBase64(bytes), ...describeForBlindReaders(node as SceneNode) };
});

/** Dimensions, structure and dominant colors — what a sighted reader takes from a glance. */
function describeForBlindReaders(node: SceneNode): Record<string, unknown> {
  const hex = (c: RGB) =>
    "#" +
    [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  const counts = new Map<string, number>();
  let scanned = 0;
  const visit = (n: SceneNode) => {
    if (scanned >= 200) return; // a glance, not a census
    scanned++;
    const fills = (n as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (const p of fills) {
        if (p.type !== "SOLID" || p.visible === false || (p.opacity ?? 1) === 0) continue;
        const key = hex(p.color);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    if ("children" in n) for (const c of (n as ChildrenMixin).children as SceneNode[]) visit(c);
  };
  try {
    visit(node);
  } catch {
    // A description is a courtesy; never let it cost the screenshot
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, n]) => `${c}×${n}`);
  return {
    node: { id: node.id, name: node.name, type: node.type },
    size: `${Math.round(node.width)}×${Math.round(node.height)}`,
    children: "children" in node ? (node as ChildrenMixin).children.length : 0,
    nodesScanned: scanned,
    dominantColors: colors,
  };
}
