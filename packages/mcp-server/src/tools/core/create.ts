import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { colorSchema, dimensionSchema, type FigmaCommand } from "@figma-relai/shared";
import { jsonResult, errorResult } from "./helpers.js";

const NODE_KINDS = [
  "rectangle",
  "frame",
  "text",
  "ellipse",
  "polygon",
  "star",
  "line",
  "section",
  "slice",
  "svg",
  "image",
  "connector",
  "table",
  "sticky",
  "code_block",
] as const;

// kind → plugin command
const KIND_COMMAND: Record<(typeof NODE_KINDS)[number], FigmaCommand> = {
  rectangle: "create_rectangle",
  frame: "create_frame",
  text: "create_text",
  ellipse: "create_ellipse",
  polygon: "create_polygon",
  star: "create_star",
  line: "create_line",
  section: "create_section",
  slice: "create_slice",
  svg: "create_node_from_svg",
  image: "create_image_from_url",
  connector: "create_connector",
  table: "create_table",
  sticky: "create_sticky",
  code_block: "create_code_block",
};

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "create_node",
    "Create a node in Figma: rectangle, frame, text, ellipse, polygon, star, line, section, slice, svg (from markup), image (from URL), or FigJam connector/table/sticky/code_block. Returns the new node's id — style it further with set_properties. For component instances use manage_components.",
    {
      type: z.enum(NODE_KINDS).describe("What to create"),
      x: z.number().optional().describe("X position (default 0)"),
      y: z.number().optional().describe("Y position (default 0)"),
      width: dimensionSchema.optional(),
      height: dimensionSchema.optional(),
      name: z.string().optional(),
      parentId: z.string().optional().describe("Parent node id (default: current page)"),
      text: z.string().optional().describe("Text content (text/sticky)"),
      fontSize: z.number().positive().optional().describe("text only"),
      fontWeight: z.number().optional().describe("text only (e.g. 400, 700)"),
      fontColor: colorSchema.optional().describe("text only"),
      fillColor: colorSchema.optional().describe("frame/rectangle fill"),
      pointCount: z.number().int().min(3).optional().describe("polygon/star points"),
      innerRadius: z.number().min(0).max(1).optional().describe("star inner radius ratio"),
      length: z.number().positive().optional().describe("line length"),
      rotation: z.number().optional().describe("line rotation in degrees"),
      strokeWeight: z.number().min(0).optional().describe("line stroke weight"),
      svg: z.string().optional().describe("SVG markup (type=svg)"),
      url: z.string().optional().describe("Image URL (type=image)"),
      scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional().describe("image only"),
      rows: z.number().int().positive().optional().describe("table only"),
      cols: z.number().int().positive().optional().describe("table only"),
      startNodeId: z.string().optional().describe("connector only"),
      endNodeId: z.string().optional().describe("connector only"),
      lineType: z.enum(["ELBOWED", "STRAIGHT"]).optional().describe("connector only"),
    },
    async ({ type, ...params }) => {
      try {
        const clean = Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined)
        );
        const result = await sendCommand(KIND_COMMAND[type], clean);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
