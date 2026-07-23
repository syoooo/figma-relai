import { registerHandler } from "../dispatcher.js";

registerHandler("import_component_by_key", async (params) => {
  const key = params.key as string;
  const component = await figma.importComponentByKeyAsync(key);
  return { id: component.id, name: component.name, type: component.type };
});

registerHandler("import_style_by_key", async (params) => {
  const key = params.key as string;
  const style = await figma.importStyleByKeyAsync(key);
  return { id: style.id, name: style.name, type: style.type };
});

registerHandler("import_variable_by_key", async (params) => {
  const key = params.key as string;
  const variable = await figma.variables.importVariableByKeyAsync(key);
  return { id: variable.id, name: variable.name, resolvedType: variable.resolvedType };
});
