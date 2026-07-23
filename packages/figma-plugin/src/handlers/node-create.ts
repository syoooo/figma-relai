import { registerHandler } from "../dispatcher.js";
import { appendToParent, getNodeById, serializeNode } from "../utils/node-helpers.js";
import { solidPaint, toFigmaRGB } from "../utils/color.js";
import { loadFont } from "../utils/font-loader.js";

registerHandler("create_rectangle", async (params) => {
  const rect = figma.createRectangle();
  rect.x = params.x as number;
  rect.y = params.y as number;
  rect.resize(params.width as number, params.height as number);
  rect.name = (params.name as string) || "Rectangle";
  await appendToParent(rect, params.parentId as string | undefined);
  return { id: rect.id, name: rect.name };
});

registerHandler("create_frame", async (params) => {
  const frame = figma.createFrame();
  frame.x = params.x as number;
  frame.y = params.y as number;
  frame.resize(params.width as number, params.height as number);
  frame.name = (params.name as string) || "Frame";

  // Fill color
  if (params.fillColor) {
    const c = params.fillColor as { r: number; g: number; b: number; a?: number };
    frame.fills = [solidPaint(c)];
  }

  // Stroke
  if (params.strokeColor) {
    const c = params.strokeColor as { r: number; g: number; b: number; a?: number };
    frame.strokes = [solidPaint(c)];
    if (params.strokeWeight) frame.strokeWeight = params.strokeWeight as number;
  }

  // Auto-layout
  if (params.layoutMode && params.layoutMode !== "NONE") {
    frame.layoutMode = params.layoutMode as "HORIZONTAL" | "VERTICAL";
    if (params.layoutWrap) frame.layoutWrap = params.layoutWrap as "NO_WRAP" | "WRAP";
    if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop as number;
    if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight as number;
    if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom as number;
    if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft as number;
    if (params.primaryAxisAlignItems) {
      frame.primaryAxisAlignItems = params.primaryAxisAlignItems as
        | "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
    }
    if (params.counterAxisAlignItems) {
      frame.counterAxisAlignItems = params.counterAxisAlignItems as
        | "MIN" | "MAX" | "CENTER" | "BASELINE";
    }
    if (params.layoutSizingHorizontal) {
      frame.layoutSizingHorizontal = params.layoutSizingHorizontal as "FIXED" | "HUG" | "FILL";
    }
    if (params.layoutSizingVertical) {
      frame.layoutSizingVertical = params.layoutSizingVertical as "FIXED" | "HUG" | "FILL";
    }
    if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing as number;
  }

  await appendToParent(frame, params.parentId as string | undefined);
  return { id: frame.id, name: frame.name };
});

registerHandler("create_text", async (params) => {
  const text = figma.createText();
  const fontWeight = (params.fontWeight as number) || 400;
  const weightToStyle: Record<number, string> = {
    100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular",
    500: "Medium", 600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black",
  };
  const style = weightToStyle[fontWeight] || "Regular";
  const loaded = await loadFont("Inter", style);
  if (!loaded) throw new Error(`Cannot load font "Inter ${style}" or any fallback`);
  text.fontName = loaded;

  text.x = params.x as number;
  text.y = params.y as number;
  text.characters = params.text as string;
  text.fontSize = (params.fontSize as number) || 14;
  text.name = (params.name as string) || "Text";

  if (params.fontColor) {
    const c = params.fontColor as { r: number; g: number; b: number; a?: number };
    text.fills = [solidPaint(c)];
  }

  await appendToParent(text, params.parentId as string | undefined);
  return { id: text.id, name: text.name };
});

registerHandler("create_ellipse", async (params) => {
  const ellipse = figma.createEllipse();
  ellipse.x = params.x as number;
  ellipse.y = params.y as number;
  ellipse.resize(params.width as number, params.height as number);
  ellipse.name = (params.name as string) || "Ellipse";
  await appendToParent(ellipse, params.parentId as string | undefined);
  return { id: ellipse.id, name: ellipse.name };
});

registerHandler("create_polygon", async (params) => {
  const polygon = figma.createPolygon();
  polygon.x = params.x as number;
  polygon.y = params.y as number;
  polygon.resize(params.width as number, params.height as number);
  polygon.pointCount = (params.pointCount as number) || 3;
  polygon.name = (params.name as string) || "Polygon";
  await appendToParent(polygon, params.parentId as string | undefined);
  return { id: polygon.id, name: polygon.name };
});

registerHandler("create_star", async (params) => {
  const star = figma.createStar();
  star.x = params.x as number;
  star.y = params.y as number;
  star.resize(params.width as number, params.height as number);
  star.pointCount = (params.pointCount as number) || 5;
  star.innerRadius = (params.innerRadius as number) || 0.382;
  star.name = (params.name as string) || "Star";
  await appendToParent(star, params.parentId as string | undefined);
  return { id: star.id, name: star.name };
});

registerHandler("create_line", async (params) => {
  const line = figma.createLine();
  line.x = params.x as number;
  line.y = params.y as number;
  line.resize(params.length as number, 0);
  line.rotation = (params.rotation as number) || 0;
  line.strokeWeight = (params.strokeWeight as number) || 1;
  line.name = (params.name as string) || "Line";
  await appendToParent(line, params.parentId as string | undefined);
  return { id: line.id, name: line.name };
});

registerHandler("create_section", async (params) => {
  const section = figma.createSection();
  section.x = params.x as number;
  section.y = params.y as number;
  section.resizeWithoutConstraints(params.width as number, params.height as number);
  section.name = (params.name as string) || "Section";
  await appendToParent(section, params.parentId as string | undefined);
  return { id: section.id, name: section.name };
});

registerHandler("create_node_from_svg", async (params) => {
  const node = figma.createNodeFromSvg(params.svg as string);
  if (params.x !== undefined) node.x = params.x as number;
  if (params.y !== undefined) node.y = params.y as number;
  if (params.name) node.name = params.name as string;
  await appendToParent(node, params.parentId as string | undefined);
  return { id: node.id, name: node.name };
});

registerHandler("create_connector", async (params) => {
  if (typeof figma.createConnector !== "function") throw new Error("create_connector is only available in FigJam files");
  const connector = figma.createConnector();
  if (params.startNodeId && params.endNodeId) {
    const startNode = await getNodeById(params.startNodeId as string);
    const endNode = await getNodeById(params.endNodeId as string);
    if (startNode) connector.connectorStart = { endpointNodeId: (startNode as SceneNode).id, magnet: "AUTO" };
    if (endNode) connector.connectorEnd = { endpointNodeId: (endNode as SceneNode).id, magnet: "AUTO" };
  }
  if (params.lineType) connector.connectorLineType = params.lineType as ConnectorNode["connectorLineType"];
  return { id: connector.id, name: connector.name };
});

registerHandler("create_table", async (params) => {
  if (typeof figma.createTable !== "function") throw new Error("create_table is only available in FigJam files");
  const rows = (params.rows as number) || 3;
  const cols = (params.cols as number) || 3;
  const table = figma.createTable(rows, cols);
  if (params.name) table.name = params.name as string;
  return { id: table.id, name: table.name };
});

registerHandler("create_sticky", async (params) => {
  if (typeof figma.createSticky !== "function") throw new Error("create_sticky is only available in FigJam files");
  const sticky = figma.createSticky();
  if (params.x !== undefined) sticky.x = params.x as number;
  if (params.y !== undefined) sticky.y = params.y as number;
  if (params.text) {
    await figma.loadFontAsync(sticky.text.fontName as FontName);
    sticky.text.characters = params.text as string;
  }
  return { id: sticky.id, name: sticky.name };
});

registerHandler("create_code_block", async (params) => {
  if (typeof figma.createCodeBlock !== "function") throw new Error("create_code_block is only available in FigJam files");
  const codeBlock = figma.createCodeBlock();
  if (params.x !== undefined) (codeBlock as any).x = params.x as number;
  if (params.y !== undefined) (codeBlock as any).y = params.y as number;
  return { id: codeBlock.id, name: codeBlock.name };
});

registerHandler("create_slice", async (params) => {
  const slice = figma.createSlice();
  slice.x = (params.x as number) || 0;
  slice.y = (params.y as number) || 0;
  slice.resize((params.width as number) || 100, (params.height as number) || 100);
  if (params.name) slice.name = params.name as string;
  await appendToParent(slice, params.parentId as string | undefined);
  return { id: slice.id, name: slice.name };
});

registerHandler("create_component_instance", async (params) => {
  const componentKey = params.componentKey as string;
  // Try to find the component locally first (match key, or id for convenience)
  let component: ComponentNode | null = null;

  for (const page of figma.root.children) {
    await page.loadAsync();
    const found = page.findOne(
      (n) => n.type === "COMPONENT" && (n.key === componentKey || n.id === componentKey)
    ) as ComponentNode | null;
    if (found) {
      component = found;
      break;
    }
  }

  if (!component) {
    try {
      component = await figma.importComponentByKeyAsync(componentKey);
    } catch {
      throw new Error(
        `Component not found for key/id "${componentKey}". ` +
          `Use get_local_components to list local components (pass their "key"), ` +
          `or make sure the library containing it is enabled for this file.`
      );
    }
  }

  const instance = component.createInstance();
  instance.x = params.x as number;
  instance.y = params.y as number;
  return { id: instance.id, name: instance.name };
});
