import { registerHandler } from "../dispatcher.js";
import { getNodeById, serializeNode } from "../utils/node-helpers.js";
import { resolveNode } from "../utils/preconditions.js";
import { sendProgressUpdate, delay } from "../progress.js";

registerHandler("get_local_components", async (params) => {
  const commandId = params.commandId as string;
  const components: Array<{ id: string; name: string; key: string }> = [];

  for (let i = 0; i < figma.root.children.length; i++) {
    const page = figma.root.children[i];
    await page.loadAsync();
    const found = page.findAll((n) => n.type === "COMPONENT") as ComponentNode[];
    for (const comp of found) {
      components.push({ id: comp.id, name: comp.name, key: comp.key });
    }

    sendProgressUpdate({
      commandId,
      commandType: "get_local_components",
      status: "in_progress",
      progress: Math.round(((i + 1) / figma.root.children.length) * 100),
      totalItems: figma.root.children.length,
      processedItems: i + 1,
      message: `Scanning page: ${page.name}`,
    });
    await delay();
  }

  return components;
});

registerHandler("get_instance_overrides", async (params) => {
  let node: BaseNode | null;
  if (params.instanceNodeId) {
    node = await getNodeById(params.instanceNodeId as string);
  } else {
    const sel = figma.currentPage.selection;
    node = sel.length > 0 ? sel[0] : null;
  }

  if (!node || node.type !== "INSTANCE") {
    throw new Error("No instance selected or found");
  }

  const instance = node as InstanceNode;
  return {
    sourceInstanceId: instance.id,
    mainComponentId: (await instance.getMainComponentAsync())?.id,
    overrides: instance.overrides,
  };
});

registerHandler("set_instance_overrides", async (params) => {
  const sourceId = params.sourceInstanceId as string;
  const targetIds = params.targetNodeIds as string[];
  const source = await getNodeById(sourceId);

  if (!source || source.type !== "INSTANCE") {
    throw new Error(`Source instance not found: ${sourceId}`);
  }

  const sourceProps = (source as InstanceNode).componentProperties;
  const values: Record<string, string | boolean> = {};
  for (const [name, prop] of Object.entries(sourceProps)) {
    values[name] = prop.value;
  }

  const results = [];
  for (const targetId of targetIds) {
    try {
      const target = await getNodeById(targetId);
      if (!target) throw new Error(`Node not found: ${targetId}`);
      if (target.type !== "INSTANCE") {
        throw new Error(`Node "${target.name}" (${targetId}) is a ${target.type}, not an INSTANCE`);
      }
      // setProperties throws on unknown property names, which catches
      // targets whose main component differs from the source's
      (target as InstanceNode).setProperties(values);
      results.push({ instanceId: targetId, success: true, name: target.name });
    } catch (e) {
      results.push({
        instanceId: targetId,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { results, appliedProperties: Object.keys(values) };
});

registerHandler("create_component", async (params) => {
  const node = await resolveNode(params.nodeId as string);
  const component = figma.createComponentFromNode(node);
  return { id: component.id, name: component.name, key: component.key };
});

registerHandler("create_component_set", async (params) => {
  const componentIds = params.componentIds as string[];
  const components: ComponentNode[] = [];
  for (const id of componentIds) {
    const node = await getNodeById(id);
    if (node && node.type === "COMPONENT") {
      components.push(node as ComponentNode);
    }
  }
  if (components.length < 2) throw new Error("Need at least 2 components");
  const set = figma.combineAsVariants(components, components[0].parent as FrameNode);
  return { id: set.id, name: set.name };
});

registerHandler("get_component_properties", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    return (node as ComponentNode).componentPropertyDefinitions;
  } else if (node.type === "INSTANCE") {
    return (node as InstanceNode).componentProperties;
  }

  throw new Error("Node is not a component or instance");
});

registerHandler("set_component_properties", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: ["INSTANCE"] });
  const instance = node as InstanceNode;
  const properties = params.properties as Record<string, string | boolean>;
  instance.setProperties(properties);
  return { id: instance.id, name: instance.name };
});

registerHandler("detach_instance", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: ["INSTANCE"] });
  const detached = (node as InstanceNode).detachInstance();
  return { id: detached.id, name: detached.name };
});

registerHandler("reset_instance", async (params) => {
  const node = await resolveNode(params.nodeId as string, { types: ["INSTANCE"] });
  const inst = node as InstanceNode;
  const snapshot = () => {
    const p: Record<string, unknown> = {};
    try {
      for (const [k, v] of Object.entries(inst.componentProperties ?? {})) p[k] = v.value;
    } catch {
      // componentProperties throws on some exotic instances — snapshot stays partial
    }
    return p;
  };
  const before = snapshot();
  inst.resetOverrides();
  const after = snapshot();
  const main = await inst.getMainComponentAsync();
  return {
    id: inst.id,
    name: inst.name,
    main: main ? (main.parent?.type === "COMPONENT_SET" ? `${main.parent.name} / ${main.name}` : main.name) : null,
    propertiesBefore: before,
    propertiesAfter: after,
  };
});
