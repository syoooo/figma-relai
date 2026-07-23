import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("get_reactions", async (params) => {
  const nodeIds = params.nodeIds as string[];
  const results = [];

  for (const nodeId of nodeIds) {
    const node = await getNodeById(nodeId);
    if (node && "reactions" in node) {
      const sceneNode = node as SceneNode & { reactions: readonly Reaction[] };
      results.push({
        nodeId,
        name: sceneNode.name,
        reactions: sceneNode.reactions.map((r) => ({
          trigger: r.trigger,
          actions: r.actions,
        })),
      });
    }
  }

  return results;
});

registerHandler("set_default_connector", async (params) => {
  // Store connector template ID in plugin data on the page
  const connectorId = params.connectorId as string;
  if (connectorId) {
    figma.currentPage.setPluginData("defaultConnectorId", connectorId);
  }
  return { success: true, connectorId };
});

registerHandler("create_connections", async (params) => {
  const connections = params.connections as Array<{
    startNodeId: string;
    endNodeId: string;
    text?: string;
  }>;

  const results = [];
  for (const conn of connections) {
    try {
      const startNode = await getNodeById(conn.startNodeId);
      const endNode = await getNodeById(conn.endNodeId);

      if (!startNode || !endNode) {
        results.push({ success: false, error: "Nodes not found" });
        continue;
      }

      const connector = figma.createConnector();
      connector.connectorStart = {
        endpointNodeId: conn.startNodeId,
        magnet: "AUTO",
      };
      connector.connectorEnd = {
        endpointNodeId: conn.endNodeId,
        magnet: "AUTO",
      };

      if (conn.text) {
        await figma.loadFontAsync(connector.text.fontName as FontName);
        connector.text.characters = conn.text;
      }

      results.push({
        success: true,
        connectorId: connector.id,
        startNodeId: conn.startNodeId,
        endNodeId: conn.endNodeId,
      });
    } catch (err) {
      results.push({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
});
