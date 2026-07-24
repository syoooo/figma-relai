import { registerHandler, isCancelled } from "../dispatcher.js";
import { getNodeById } from "../utils/node-helpers.js";
import { sendProgressUpdate, delay } from "../progress.js";
import { nearestColorMatch, rgbaToHex, type ColorCandidate } from "@figma-relai/shared";

// Design-system inventory and token-drift scanning. The inventory is honest
// about what the Plugin API can see:
//   tier 1 — local components/styles/variables + remote items USED in the file
//            (reachable through instances and consumed style/variable ids)
//   tier 2 — enabled libraries' variable collections (figma.teamLibrary)
//   tier 3 — a library's full component catalog is NOT visible from a plugin;
//            the MCP server layers that via REST when FIGMA_TOKEN is set.

const LIST_CAP = 40;

interface UsageMap {
  [key: string]: { name: string; count: number; remote: boolean };
}

let dsCache: { data: unknown; scannedAt: number } | null = null;

registerHandler("get_design_system", async (params) => {
  if (dsCache && !params.refresh) {
    return { ...(dsCache.data as Record<string, unknown>), cached: true };
  }

  const commandId = params.commandId as string;
  const pages = figma.root.children;

  const componentUsage: UsageMap = {};
  const consumedStyleIds = new Set<string>();
  const consumedVariableIds = new Set<string>();
  let nodesScanned = 0;
  let instanceCount = 0;

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    await page.loadAsync();
    if (isCancelled(commandId)) throw new Error("Cancelled by designer");

    const nodes = page.findAll(() => true);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as SceneNode;
      nodesScanned++;

      if (node.type === "INSTANCE") {
        instanceCount++;
        try {
          const main = await (node as InstanceNode).getMainComponentAsync();
          if (main) {
            // Attribute usage to the variant set when there is one
            const owner =
              main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : main;
            const key = owner.type === "COMPONENT_SET" ? owner.key : (owner as ComponentNode).key;
            const entry = (componentUsage[key] ??= {
              name: owner.name,
              count: 0,
              remote: owner.remote,
            });
            entry.count++;
          }
        } catch {
          // Main component can be unresolvable (deleted library); skip
        }
      }

      for (const prop of ["fillStyleId", "strokeStyleId", "textStyleId", "effectStyleId"] as const) {
        const id = (node as unknown as Record<string, unknown>)[prop];
        if (typeof id === "string" && id) consumedStyleIds.add(id);
      }

      const bound = (node as SceneNode).boundVariables;
      if (bound) {
        for (const value of Object.values(bound)) {
          for (const alias of Array.isArray(value) ? value : [value]) {
            const id = (alias as VariableAlias | undefined)?.id;
            if (id) consumedVariableIds.add(id);
          }
        }
      }

      if (i % 400 === 399) {
        if (isCancelled(commandId)) throw new Error("Cancelled by designer");
        await delay(10);
      }
    }

    sendProgressUpdate({
      commandId,
      commandType: "get_design_system",
      status: "in_progress",
      progress: Math.round(((p + 1) / pages.length) * 100),
      totalItems: pages.length,
      processedItems: p + 1,
      message: `Scanned page: ${page.name}`,
    });
  }

  // Local component definitions (variant sets counted as one entry)
  const localComponents: Array<{
    id: string;
    name: string;
    key: string;
    variants?: number;
    usages: number;
  }> = [];
  for (const page of pages) {
    for (const node of page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })) {
      if (node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET") continue;
      localComponents.push({
        id: node.id,
        name: node.name,
        key: node.key,
        ...(node.type === "COMPONENT_SET" ? { variants: node.children.length } : {}),
        usages: componentUsage[node.key]?.count ?? 0,
      });
    }
  }
  localComponents.sort((a, b) => b.usages - a.usages);

  const remoteUsedComponents = Object.entries(componentUsage)
    .filter(([, v]) => v.remote)
    .map(([key, v]) => ({ key, name: v.name, usages: v.count }))
    .sort((a, b) => b.usages - a.usages);

  // Styles: local defs + remote ones the file consumes
  const styleName = (s: BaseStyle) => ({ id: s.id, name: s.name, key: s.key });
  const localStyles = {
    paint: (await figma.getLocalPaintStylesAsync()).map(styleName),
    text: (await figma.getLocalTextStylesAsync()).map(styleName),
    effect: (await figma.getLocalEffectStylesAsync()).map(styleName),
    grid: (await figma.getLocalGridStylesAsync()).map(styleName),
  };
  const remoteUsedStyles: Array<{ key: string; name: string; type: string }> = [];
  for (const id of consumedStyleIds) {
    try {
      const style = await figma.getStyleByIdAsync(id);
      if (style?.remote) {
        remoteUsedStyles.push({ key: style.key, name: style.name, type: style.type });
      }
    } catch {
      // Dangling style id
    }
  }

  // Variables: local collections + enabled libraries (tier 2)
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = {
    localCollections: localCollections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => m.name),
      variableCount: c.variableIds.length,
    })),
    libraryCollections: [] as Array<{
      key: string;
      name: string;
      libraryName: string;
      variableCount: number;
      sample: string[];
    }>,
    libraryNote: undefined as string | undefined,
  };
  try {
    const libCollections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const c of libCollections) {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key);
      variables.libraryCollections.push({
        key: c.key,
        name: c.name,
        libraryName: c.libraryName,
        variableCount: vars.length,
        sample: vars.slice(0, 10).map((v) => v.name),
      });
    }
  } catch (e) {
    variables.libraryNote = `Enabled-library variables unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }

  const cap = <T>(list: T[]) => ({
    items: list.slice(0, LIST_CAP),
    ...(list.length > LIST_CAP ? { truncated: list.length - LIST_CAP } : {}),
  });

  const data = {
    components: {
      local: cap(localComponents),
      remoteUsed: cap(remoteUsedComponents),
    },
    styles: { local: localStyles, remoteUsed: cap(remoteUsedStyles) },
    variables,
    stats: { pages: pages.length, nodesScanned, instances: instanceCount },
  };
  dsCache = { data, scannedAt: Date.now() };
  return data;
});

// ─── Token drift: hardcoded values that "are" an existing variable ───

interface DriftFinding {
  nodeId: string;
  nodeName: string;
  field: string;
  value: string;
  variableId: string;
  variableName: string;
  deltaE?: number;
  fixed?: boolean;
}

const FINDINGS_CAP = 150;
const NUMBER_FIELDS = [
  "cornerRadius",
  "itemSpacing",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
] as const;

// Follow alias chains to a concrete value (depth-capped)
async function resolveVariableValue(
  variable: Variable,
  modeId: string,
  depth = 0
): Promise<VariableValue | null> {
  const value = variable.valuesByMode[modeId] ?? Object.values(variable.valuesByMode)[0];
  if (value === undefined) return null;
  if (typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS") {
    if (depth >= 5) return null;
    const next = await figma.variables.getVariableByIdAsync(value.id);
    if (!next) return null;
    const nextMode = Object.keys(next.valuesByMode)[0];
    return resolveVariableValue(next, nextMode, depth + 1);
  }
  return value;
}

registerHandler("scan_token_drift", async (params) => {
  const commandId = params.commandId as string;
  const fix = params.fix === true;
  const tolerance = typeof params.tolerance === "number" ? params.tolerance : 0.02;

  let root: BaseNode | null = figma.currentPage;
  if (params.nodeId) {
    root = await getNodeById(params.nodeId as string);
    if (!root) throw new Error(`Node not found: ${params.nodeId}`);
  }

  // Candidate pool: local variables, resolved to concrete values
  const colorCandidates: ColorCandidate[] = [];
  const numberCandidates: Array<{ id: string; name: string; value: number }> = [];
  for (const collection of await figma.variables.getLocalVariableCollectionsAsync()) {
    const modeId = collection.modes[0]?.modeId;
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const value = await resolveVariableValue(variable, modeId);
      if (variable.resolvedType === "COLOR" && value && typeof value === "object" && "r" in value) {
        colorCandidates.push({ id: variable.id, name: variable.name, color: value as RGB });
      } else if (variable.resolvedType === "FLOAT" && typeof value === "number") {
        numberCandidates.push({ id: variable.id, name: variable.name, value });
      }
    }
  }

  if (colorCandidates.length === 0 && numberCandidates.length === 0) {
    return {
      findings: [],
      stats: { nodesScanned: 0, matched: 0, fixed: 0 },
      note: "No local variables to match against — create collections first (or import a library's variables by binding them once).",
    };
  }

  const findings: DriftFinding[] = [];
  const nodes = (root as ChildrenMixin & BaseNode).findAll
    ? (root as unknown as ChildrenMixin).findAll(() => true)
    : [];
  let matched = 0;
  let fixed = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as SceneNode;
    if (i % 300 === 299) {
      if (isCancelled(commandId)) throw new Error("Cancelled by designer");
      sendProgressUpdate({
        commandId,
        commandType: "scan_token_drift",
        status: "in_progress",
        progress: Math.round((i / nodes.length) * 100),
        totalItems: nodes.length,
        processedItems: i,
        message: `Scanning ${i}/${nodes.length} nodes`,
      });
      await delay(10);
    }

    // Paint drift (fills + strokes), skipping already-bound paints
    for (const listProp of ["fills", "strokes"] as const) {
      const paints = (node as unknown as Record<string, unknown>)[listProp];
      if (!Array.isArray(paints)) continue;
      for (let pi = 0; pi < paints.length; pi++) {
        const paint = paints[pi] as SolidPaint;
        if (paint.type !== "SOLID" || paint.boundVariables?.color) continue;
        const hit = nearestColorMatch(paint.color, colorCandidates, tolerance);
        if (!hit) continue;
        matched++;
        const finding: DriftFinding = {
          nodeId: node.id,
          nodeName: node.name,
          field: `${listProp}[${pi}]`,
          value: rgbaToHex({ ...paint.color, a: paint.opacity ?? 1 }),
          variableId: hit.candidate.id,
          variableName: hit.candidate.name,
          deltaE: Math.round(hit.deltaE * 1000) / 1000,
        };
        if (fix) {
          try {
            const variable = await figma.variables.getVariableByIdAsync(hit.candidate.id);
            if (variable) {
              const next = (paints as Paint[]).slice();
              next[pi] = figma.variables.setBoundVariableForPaint(paint, "color", variable);
              (node as unknown as Record<string, unknown>)[listProp] = next;
              finding.fixed = true;
              fixed++;
            }
          } catch (e) {
            finding.fixed = false;
          }
        }
        if (findings.length < FINDINGS_CAP) findings.push(finding);
      }
    }

    // Number drift: exact matches only (rounded to 2dp)
    for (const field of NUMBER_FIELDS) {
      const value = (node as unknown as Record<string, unknown>)[field];
      if (typeof value !== "number" || value === 0) continue;
      if ((node.boundVariables as Record<string, unknown> | undefined)?.[field]) continue;
      const candidate = numberCandidates.find(
        (c) => Math.round(c.value * 100) === Math.round(value * 100)
      );
      if (!candidate) continue;
      matched++;
      const finding: DriftFinding = {
        nodeId: node.id,
        nodeName: node.name,
        field,
        value: String(value),
        variableId: candidate.id,
        variableName: candidate.name,
      };
      if (fix) {
        try {
          const variable = await figma.variables.getVariableByIdAsync(candidate.id);
          if (variable) {
            (node as FrameNode).setBoundVariable(field as VariableBindableNodeField, variable);
            finding.fixed = true;
            fixed++;
          }
        } catch {
          finding.fixed = false;
        }
      }
      if (findings.length < FINDINGS_CAP) findings.push(finding);
    }
  }

  return {
    findings,
    ...(matched > FINDINGS_CAP ? { truncated: matched - FINDINGS_CAP } : {}),
    stats: { nodesScanned: nodes.length, matched, fixed },
    candidates: { colors: colorCandidates.length, numbers: numberCandidates.length },
  };
});
