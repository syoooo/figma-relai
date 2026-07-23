import { registerHandler } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";

registerHandler("get_variable_collections", async () => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes,
    variableIds: c.variableIds,
  }));
});

registerHandler("get_variables", async (params) => {
  const collectionId = params.collectionId as string;
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) throw new Error(`Collection not found: ${collectionId}`);

  const variables = [];
  for (const varId of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(varId);
    if (variable) {
      variables.push({
        id: variable.id,
        name: variable.name,
        key: variable.key,
        resolvedType: variable.resolvedType,
        description: variable.description,
        hiddenFromPublishing: variable.hiddenFromPublishing,
        scopes: variable.scopes,
        codeSyntax: variable.codeSyntax,
        valuesByMode: variable.valuesByMode,
      });
    }
  }
  return variables;
});

registerHandler("create_variable_collection", async (params) => {
  const collection = figma.variables.createVariableCollection(params.name as string);
  const modes = params.modes as string[] | undefined;
  if (modes && modes.length > 0) {
    // Rename the default mode
    collection.renameMode(collection.modes[0].modeId, modes[0]);
    // Add additional modes
    for (let i = 1; i < modes.length; i++) {
      collection.addMode(modes[i]);
    }
  }
  return { id: collection.id, name: collection.name, modes: collection.modes };
});

registerHandler("create_variable", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    params.collectionId as string
  );
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);

  const variable = figma.variables.createVariable(
    params.name as string,
    collection,
    params.resolvedType as VariableResolvedDataType
  );

  if (params.value !== undefined) {
    variable.setValueForMode(collection.modes[0].modeId, params.value as any);
  }

  return { id: variable.id, name: variable.name, resolvedType: variable.resolvedType };
});

registerHandler("update_variable", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  if (params.modeId !== undefined && params.value !== undefined) {
    variable.setValueForMode(params.modeId as string, params.value as any);
  }
  if (params.name !== undefined) variable.name = params.name as string;
  if (params.description !== undefined) variable.description = params.description as string;
  if (params.hiddenFromPublishing !== undefined) variable.hiddenFromPublishing = params.hiddenFromPublishing as boolean;
  return { id: variable.id, name: variable.name, description: variable.description };
});

registerHandler("update_variable_collection", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  if (params.name !== undefined) collection.name = params.name as string;
  if (params.hiddenFromPublishing !== undefined) collection.hiddenFromPublishing = params.hiddenFromPublishing as boolean;
  return { id: collection.id, name: collection.name, hiddenFromPublishing: collection.hiddenFromPublishing };
});

registerHandler("add_mode", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  const modeId = collection.addMode(params.name as string);
  return { modeId, name: params.name, modes: collection.modes };
});

registerHandler("remove_mode", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  collection.removeMode(params.modeId as string);
  return { success: true, modes: collection.modes };
});

registerHandler("rename_mode", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  collection.renameMode(params.modeId as string, params.name as string);
  return { success: true, modes: collection.modes };
});

registerHandler("set_variable_scopes", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  variable.scopes = params.scopes as VariableScope[];
  return { id: variable.id, name: variable.name, scopes: variable.scopes };
});

registerHandler("set_variable_code_syntax", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  variable.setVariableCodeSyntax(params.platform as CodeSyntaxPlatform, params.value as string);
  return { id: variable.id, name: variable.name, codeSyntax: variable.codeSyntax };
});

registerHandler("remove_variable_code_syntax", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  variable.removeVariableCodeSyntax(params.platform as CodeSyntaxPlatform);
  return { id: variable.id, name: variable.name, codeSyntax: variable.codeSyntax };
});

registerHandler("create_variable_alias", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  const targetVariable = await figma.variables.getVariableByIdAsync(params.targetVariableId as string);
  if (!targetVariable) throw new Error(`Target variable not found: ${params.targetVariableId}`);
  const alias = figma.variables.createVariableAlias(targetVariable);
  variable.setValueForMode(params.modeId as string, alias);
  return { id: variable.id, name: variable.name, aliasOf: targetVariable.name };
});

registerHandler("delete_variable", async (params) => {
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);
  const name = variable.name;
  variable.remove();
  return { success: true, name };
});

registerHandler("delete_variable_collection", async (params) => {
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  const name = collection.name;
  collection.remove();
  return { success: true, name };
});

registerHandler("bind_variable", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const variable = await figma.variables.getVariableByIdAsync(params.variableId as string);
  if (!variable) throw new Error(`Variable not found: ${params.variableId}`);

  const field = params.property as string;
  const sceneNode = node as SceneNode;

  // Handle paint-level bindings (e.g. "fills/0/color", "strokes/0/color")
  const paintMatch = field.match(/^(fills|strokes)\/(\d+)\/color$/);
  if (paintMatch) {
    const prop = paintMatch[1] as "fills" | "strokes";
    const index = parseInt(paintMatch[2]);
    const paints = [...((sceneNode as any)[prop] as Paint[])];
    if (index >= paints.length) throw new Error(`Paint index ${index} out of range`);
    paints[index] = figma.variables.setBoundVariableForPaint(paints[index] as SolidPaint, "color", variable);
    (sceneNode as any)[prop] = paints;
  } else {
    sceneNode.setBoundVariable(field as VariableBindableNodeField, variable);
  }

  return { id: sceneNode.id, property: field, variableId: variable.id };
});

registerHandler("unbind_variable", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const property = params.property as string;
  (node as SceneNode).setBoundVariable(property as VariableBindableNodeField, null);
  return { id: (node as SceneNode).id, property };
});

registerHandler("set_node_variable_mode", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId as string);
  if (!collection) throw new Error(`Collection not found: ${params.collectionId}`);
  (node as SceneNode).setExplicitVariableModeForCollection(collection, params.modeId as string);
  return { id: (node as SceneNode).id, collectionId: collection.id, modeId: params.modeId };
});

registerHandler("get_resolved_variable_modes", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  const sceneNode = node as SceneNode;
  return {
    id: sceneNode.id,
    name: sceneNode.name,
    resolvedVariableModes: (sceneNode as any).resolvedVariableModes || {},
    explicitVariableModes: (sceneNode as any).explicitVariableModes || {},
  };
});
