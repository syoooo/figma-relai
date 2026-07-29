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

  // A variant owns no definitions — they live on its set. Asking about the
  // variant you selected is the natural move, so answer it instead of throwing.
  if (node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET") {
    const set = node.parent as ComponentSetNode;
    return {
      definitions: set.componentPropertyDefinitions,
      note: `Read from the set "${set.name}" (${set.id}) — a variant carries no definitions of its own.`,
      variantProperties: (node as ComponentNode).variantProperties,
    };
  }
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    return (node as ComponentNode).componentPropertyDefinitions;
  } else if (node.type === "INSTANCE") {
    return (node as InstanceNode).componentProperties;
  }

  throw new Error("Node is not a component or instance");
});

// Component properties live on the SET and are referenced by layers inside each
// variant. Doing that by hand takes a script per component — and the reference
// is the part everyone forgets, so a property with nothing pointing at it looks
// like it works until a designer flips the switch and nothing moves.
registerHandler("add_component_property", async (params) => {
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  let target = node;
  let redirected: string | null = null;
  if (node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET") {
    target = node.parent;
    redirected = `Added to the set "${target.name}" — a variant cannot own properties.`;
  }
  if (target.type !== "COMPONENT_SET" && target.type !== "COMPONENT") {
    throw new Error(
      `Component properties belong to a COMPONENT_SET or a non-variant COMPONENT, not ${target.type}.`
    );
  }

  const type = params.propertyType as "TEXT" | "BOOLEAN" | "INSTANCE_SWAP" | "VARIANT";
  if (type === "VARIANT") {
    throw new Error(
      "VARIANT properties come from variant names (e.g. \"size=md, state=default\") — rename the variants instead of adding a property."
    );
  }
  const key = (target as ComponentSetNode).addComponentProperty(
    params.propertyName as string,
    type,
    params.defaultValue as string | boolean
  );
  return {
    key,
    on: { id: target.id, name: target.name, type: target.type },
    ...(redirected ? { note: redirected } : {}),
    next: "bind_property points a layer's characters/visible at this key — a property nothing references does nothing.",
  };
});

registerHandler("bind_component_property", async (params) => {
  const field = params.field as "characters" | "visible" | "mainComponent";
  const key = params.propertyKey as string;
  const layerName = params.layerName as string | undefined;
  const node = await getNodeById(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  const point = (n: SceneNode) => {
    n.componentPropertyReferences = { ...(n.componentPropertyReferences || {}), [field]: key };
  };

  // Given a set (or one of its variants) plus a layer name, wire the same layer
  // in every variant — the loop nobody enjoys writing, and the one that gets
  // silently half-done when a variant was cloned in later.
  const set =
    node.type === "COMPONENT_SET"
      ? (node as ComponentSetNode)
      : node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET"
        ? (node.parent as ComponentSetNode)
        : null;
  if (set && layerName) {
    const bound: string[] = [];
    const missing: string[] = [];
    for (const variant of set.children) {
      const layer = (variant as ComponentNode).findOne((n) => n.name === layerName);
      if (!layer) { missing.push(variant.name); continue; }
      point(layer as SceneNode);
      bound.push(variant.name);
    }
    return {
      boundIn: bound.length,
      variants: set.children.length,
      field,
      propertyKey: key,
      ...(missing.length ? { missingLayerIn: missing } : {}),
    };
  }

  if (!("componentPropertyReferences" in node)) {
    throw new Error(`${node.type} cannot reference a component property.`);
  }
  point(node as SceneNode);
  return { id: node.id, name: node.name, field, propertyKey: key };
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
