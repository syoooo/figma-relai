import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";
import { parseFileKey } from "./comments.js";
import { loadToken, noteAuthFailure } from "../../credentials.js";

// The "look before you draw" tool. Layered honestly around what each API can
// see: the plugin reports local + used-remote items and enabled-library
// variable collections; a library's FULL component catalog needs the REST API,
// whose file keys are resolved from the asset keys the file already holds.

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "get_design_system",
    "Inventory the design system available to this file — call this BEFORE building UI, then prefer instantiating existing components (manage_components action:instantiate takes local and library keys) and binding existing variables over drawing raw shapes. Reports: local components/styles/variable collections with usage counts, remote components/styles the file already uses, enabled libraries' variable collections, and — with a token stored (`npx figma-relai login`) — the FULL published catalog of every library this file consumes, resolved automatically. What the file already uses is never the whole library: a component the file has not placed yet is invisible until this catalog is read. A library the file has drawn from NOTHING at all cannot be resolved either — those are named under librariesNotCatalogued, with the one step that fixes it. Results are cached per session — pass refresh:true after big library changes.",
    {
      refresh: z.boolean().optional().describe("Rescan instead of using the session cache"),
      libraryFileUrl: z
        .string()
        .optional()
        .describe(
          "Optional. Catalog THIS library file instead of the auto-resolved ones (figma.com URL or key)"
        ),
    },
    { readOnlyHint: true },
    async ({ refresh, libraryFileUrl }) => {
      try {
        const data = (await sendCommand(
          "get_design_system",
          { refresh: refresh ?? false },
          120000
        )) as Record<string, unknown>;

        data.libraryCatalog = await fetchLibraryCatalogs(libraryFileUrl, data);
        if (!libraryFileUrl) {
          const missed = librariesNotCatalogued(data);
          if (missed.length) data.librariesNotCatalogued = missedNote(missed);
        }

        // Truncation must be impossible to miss: lists are usage-sorted, so a
        // cap silently hides exactly the newest zero-usage components.
        const truncNotes: string[] = [];
        const components = data.components as
          | Record<string, { items?: unknown[]; truncated?: number }>
          | undefined;
        for (const [group, entry] of Object.entries(components ?? {})) {
          if (entry?.truncated) {
            truncNotes.push(
              `components.${group}: showing ${entry.items?.length ?? 0}, ${entry.truncated} more hidden (usage-sorted — new/unused components are the ones cut)`
            );
          }
        }
        if (truncNotes.length) {
          data.TRUNCATED = `${truncNotes.join("; ")}. Full component list: manage_components action:"list".`;
        }

        return jsonResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "manage_conventions",
    "The file's law: conventions (statutes) + precedents (case law), stored INSIDE this Figma file so they travel with it to every future session from any AI client. action:get returns both — read them BEFORE working and follow them like user instructions. Conventions are a markdown doc (action:set overwrites). Precedents are single adjudications the designer made — record one (action:record_precedent, one sentence, with refs to the tokens/nodes/pages it concerns) whenever the designer rules on something durable ('this deviation is intent, not drift', 'never restructure this table'), and SAY in your reply that you recorded it. Write results automatically surface precedents whose refs they touch.",
    {
      action: z.enum([
        "get",
        "set",
        "record_precedent",
        "list_precedents",
        "update_precedent",
        "remove_precedent",
      ]),
      content: z.string().optional().describe("set: the full markdown doc (overwrites; max 20k chars)"),
      kind: z
        .enum(["decision", "intent", "correction"])
        .optional()
        .describe("record/update_precedent: decision (an approval/rejection), intent (a deviation that is deliberate), correction (a do-it-differently ruling). Default intent"),
      text: z.string().optional().describe("record/update_precedent: the adjudication, one sentence, ≤280 chars"),
      id: z.string().optional().describe("update/remove_precedent: precedent id (from list_precedents)"),
      refs: z
        .object({
          tokens: z.array(z.string()).optional().describe("Variable IDs this precedent concerns"),
          nodes: z.array(z.string()).optional().describe("Node IDs this precedent concerns"),
          pages: z.array(z.string()).optional().describe("Page IDs this precedent concerns"),
        })
        .optional()
        .describe("What the precedent is anchored to — enables in-band surfacing when writes touch these"),
      limit: z.number().optional().describe("list_precedents: max entries returned (default 50)"),
    },
    async ({ action, content, kind, text, id, refs, limit }) => {
      try {
        switch (action) {
          case "set": {
            const saved = (await sendCommand("set_conventions", {
              content: content ?? "",
            })) as Record<string, unknown>;
            // Writing the law into a file that follows a kit forks the two. Name the
            // fork here so the next session doesn't have to remember it — but never
            // resolve it: which way the law should travel is the designer's ruling.
            try {
              const status = (await sendCommand("ruleset_status", {})) as {
                state?: string;
                linked?: string;
              };
              if (status?.state === "drifted" && status.linked) {
                return jsonResult({
                  ...saved,
                  kit: { linked: status.linked, state: status.state },
                  recommended_next:
                    `These rules now differ from the kit "${status.linked}". If they belong to every file that uses it, ` +
                    `manage_rulesets action:push sends them up (file → kit); if they are this file's own, leave the difference standing. ` +
                    `Ask the designer — the panel's "update" button runs the other way (kit → file) and would overwrite what was just written.`,
                });
              }
            } catch {
              // Older plugin builds have no ruleset_status; the write itself still stands.
            }
            return jsonResult(saved);
          }
          case "record_precedent":
            return jsonResult(
              await sendCommand("record_precedent", { kind, text, refs, source: "chat" })
            );
          case "list_precedents":
            return jsonResult(await sendCommand("list_precedents", { limit }));
          case "update_precedent":
            return jsonResult(await sendCommand("update_precedent", { id, kind, text, refs }));
          case "remove_precedent":
            return jsonResult(await sendCommand("remove_precedent", { id }));
          default:
            return jsonResult(await sendCommand("get_conventions", {}));
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// A published asset knows which file it came from: GET /v1/{component_sets,
// components,styles}/{key} answers with meta.file_key. The plugin can only ever
// hand out keys it finds on nodes in THIS file — which is exactly enough, since
// those keys belong to the libraries this file consumes. So nobody has to paste
// a library URL. Two rules make the probe cheap: names starting with "." are
// never published (Figma hides them), and a set's key does not resolve at
// /components, nor a component's at /component_sets — try both.
const PROBE_LIMIT = 12;

type Api = (path: string) => Promise<{ ok: boolean; status: number; json: Record<string, unknown> }>;

function apiFor(token: string): Api {
  return async (path) => {
    const res = await fetch(`https://api.figma.com/v1${path}`, {
      headers: { "X-Figma-Token": token },
    });
    noteAuthFailure(res.status);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  };
}

/**
 * A refusal is not an absence. Two different failures wear 401/403, and they
 * need opposite responses — one is "your token is dead", the other is "your
 * token is fine and that library is not yours to read".
 *
 * Requiring EVERY status to be 401/403 never fired in practice: each key is
 * tried on two endpoints, and the one that does not match its kind answers 404
 * by design. So one guaranteed 404 per asset buried every permission error
 * under "every candidate 404'd".
 */
export function probeFailureNote(statuses: readonly number[]): string | null {
  const denied = statuses.filter((s) => s === 401 || s === 403).length;
  if (denied === 0) return null;
  return denied === statuses.length
    ? "Figma rejected the token on every probe (401/403) — it is expired or lacks the file content read scope. Re-run `npx -y figma-relai@latest login`, then retry."
    : `Figma refused ${denied} of ${statuses.length} probes with 401/403 — the token works, but it cannot read the libraries this file draws from (they belong to a team or organisation it has no access to). Ask for access to that library file, or pass libraryFileUrl for one you can read.`;
}

const metaOf = (r: { json: Record<string, unknown> }) =>
  (r.json.meta ?? {}) as Record<string, unknown>;

/** Which library files does this file consume? Answered from the keys it already holds. */
export async function discoverLibraryFiles(
  api: Api,
  scan: Record<string, unknown>
): Promise<Array<{ fileKey: string; via: string }>> {
  const comps =
    ((scan.components as Record<string, { items?: Array<{ key?: string; name?: string }> }>)
      ?.remoteUsed?.items ?? []);
  const styles =
    ((scan.styles as Record<string, { items?: Array<{ key?: string; name?: string }> }>)
      ?.remoteUsed?.items ?? []);

  // Usage-sorted already; dot-prefixed items are unpublishable, so they only burn calls.
  const candidates = [
    ...comps.map((c) => ({ ...c, paths: ["/component_sets/", "/components/"] })),
    ...styles.map((s) => ({ ...s, paths: ["/styles/"] })),
  ]
    .filter((c) => c.key && c.name && !c.name.startsWith("."))
    .slice(0, PROBE_LIMIT);

  const found = new Map<string, string>();
  const statuses: number[] = [];
  for (const c of candidates) {
    for (const p of c.paths) {
      const res = await api(`${p}${c.key}`);
      statuses.push(res.status);
      const fileKey = metaOf(res).file_key as string | undefined;
      if (res.ok && fileKey) {
        if (!found.has(fileKey)) found.set(fileKey, c.name as string);
        break;
      }
    }
  }
  if (found.size === 0) {
    const denied = probeFailureNote(statuses);
    if (denied) throw new Error(denied);
  }
  return [...found].map(([fileKey, via]) => ({ fileKey, via }));
}

async function catalogOne(api: Api, fileKey: string): Promise<Record<string, unknown>> {
  const [sets, components, styles, meta] = await Promise.all([
    api(`/files/${fileKey}/component_sets`),
    api(`/files/${fileKey}/components`),
    api(`/files/${fileKey}/styles`),
    api(`/files/${fileKey}/meta`),
  ]);
  const failed = [sets, components, styles].find((r) => !r.ok);
  if (failed) {
    return {
      fileKey,
      error: `Figma API ${failed.status}: ${(failed.json.err ?? failed.json.message ?? "request failed") as string}`,
    };
  }

  const rawComponents = (metaOf(components).components as Array<Record<string, unknown>>) ?? [];
  // Variants are rows like "size=md, state=default" — the set is the component a
  // designer names. Fold them away or the catalog is 90% noise.
  const standalone = rawComponents.filter(
    (c) =>
      !(c.containing_frame as { containingComponentSet?: unknown } | undefined)
        ?.containingComponentSet
  );

  return {
    fileKey,
    name: ((meta.json.file as { name?: string })?.name ?? undefined) as string | undefined,
    componentSets: ((metaOf(sets).component_sets as Array<Record<string, unknown>>) ?? []).map(
      (c) => ({ key: c.key, name: c.name, description: c.description || undefined })
    ),
    components: standalone.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description || undefined,
    })),
    variantsFolded: rawComponents.length - standalone.length,
    styles: ((metaOf(styles).styles as Array<Record<string, unknown>>) ?? []).map((s) => ({
      key: s.key,
      name: s.name,
      type: s.style_type,
    })),
  };
}

/**
 * Discovery starts from assets the file already USES, so a library that is
 * enabled but not yet drawn from has nothing to probe — it is invisible, and
 * an agent reading the catalog concludes it is the whole design system.
 *
 * The enabled libraries are known by name (teamLibrary reports them), so the
 * gap can at least be named. There is no public route from a variable
 * collection to its file key, which is why this reports rather than resolves.
 */
export function librariesNotCatalogued(data: Record<string, unknown>): string[] {
  const catalog = data.libraryCatalog as { libraries?: Array<{ name?: string }> } | undefined;
  if (!catalog?.libraries) return []; // no token, or nothing resolved — other notes cover it
  const norm = (s: string) => s.trim().toLowerCase();
  const seen = new Set(catalog.libraries.map((l) => norm(l.name ?? "")));
  const enabled = (data.variables as { libraryCollections?: Array<{ libraryName?: string }> })
    ?.libraryCollections;
  const names = new Set<string>();
  for (const c of enabled ?? []) {
    const name = c.libraryName?.trim();
    if (name && !seen.has(norm(name))) names.add(name);
  }
  return [...names];
}

function missedNote(names: string[]): Record<string, unknown> {
  return {
    libraries: names,
    why: "Enabled, but absent from the catalog above — usually because this file has not placed a single component or style from them, so there is no key to resolve their file from.",
    // The remedy is the designer's, not the agent's: one instance is enough,
    // and only while the scan runs — the keys it yields stay valid after.
    how: "Ask the designer to drag any one component from that library onto the canvas (any page), then call this tool again with refresh:true. The instance can be deleted once the catalog is read — the keys remain valid. Or pass libraryFileUrl with the library file's figma.com URL.",
    ignoreIf: "A library that publishes only variables always lands here; its contents are already in variables.libraryCollections.",
  };
}

async function fetchLibraryCatalogs(
  libraryFileUrl: string | undefined,
  scan: Record<string, unknown>
): Promise<unknown> {
  const token = loadToken();
  if (!token) {
    return {
      note: "Full library catalogs need a personal access token (file content read scope): store it once with `npx figma-relai login`, or set FIGMA_TOKEN in the MCP config env. Without it, components the file already uses are still listed above — or keep a 'DS palette' page with one instance of each key component so they show up there.",
    };
  }
  const api = apiFor(token);

  let targets: Array<{ fileKey: string; via: string }>;
  if (libraryFileUrl) {
    const fileKey = parseFileKey(libraryFileUrl);
    if (!fileKey) return { note: `Could not extract a file key from "${libraryFileUrl}".` };
    targets = [{ fileKey, via: "libraryFileUrl" }];
  } else {
    try {
      targets = await discoverLibraryFiles(api, scan);
    } catch (err) {
      return { note: (err as Error).message };
    }
    if (!targets.length) {
      // "Every candidate failed" and "there were no candidates" are different
      // facts, and a file that publishes its own library has the second one.
      const remote =
        ((scan.components as { remoteUsed?: { items?: unknown[] } })?.remoteUsed?.items?.length ??
          0) +
        ((scan.styles as { remoteUsed?: { items?: unknown[] } })?.remoteUsed?.items?.length ?? 0);
      return {
        note: remote
          ? "No library file could be resolved from the keys this file holds — every candidate 404'd (unpublished, or from a library this token cannot read). Pass libraryFileUrl explicitly."
          : "This file uses no remote components or styles, so there is no key to resolve a library from. Either it draws from none, or it publishes its own — check components.local. Pass libraryFileUrl to catalog a specific library anyway.",
      };
    }
  }

  const libraries = [];
  for (const t of targets) {
    libraries.push({ resolvedFrom: t.via, ...(await catalogOne(api, t.fileKey)) });
  }
  return { libraries };
}
