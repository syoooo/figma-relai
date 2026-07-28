import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { jsonResult, errorResult } from "./helpers.js";
import { parseFileKey } from "./comments.js";
import { loadToken } from "../../credentials.js";

// The "look before you draw" tool. Layered honestly around what each API can
// see: the plugin reports local + used-remote items and enabled-library
// variable collections; a library's FULL component catalog needs the REST API
// (FIGMA_TOKEN + that library file's key).

export function register(server: McpServer, sendCommand: SendCommandFn): void {
  server.tool(
    "get_design_system",
    "Inventory the design system available to this file — call this BEFORE building UI, then prefer instantiating existing components (manage_components action:instantiate takes local and library keys) and binding existing variables over drawing raw shapes. Reports: local components/styles/variable collections with usage counts, remote components/styles the file already uses, and enabled libraries' variable collections. To list a library's full component catalog, pass libraryFileUrl (requires FIGMA_TOKEN). Results are cached per session — pass refresh:true after big library changes.",
    {
      refresh: z.boolean().optional().describe("Rescan instead of using the session cache"),
      libraryFileUrl: z
        .string()
        .optional()
        .describe(
          "figma.com URL or key of a LIBRARY file to catalog via REST (needs FIGMA_TOKEN)"
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

        if (libraryFileUrl) {
          data.libraryCatalog = await fetchLibraryCatalog(libraryFileUrl);
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
          case "set":
            return jsonResult(await sendCommand("set_conventions", { content: content ?? "" }));
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

async function fetchLibraryCatalog(libraryFileUrl: string): Promise<unknown> {
  const token = loadToken();
  if (!token) {
    return {
      note: "Full library catalogs need a personal access token (file content read scope): store it once with `npx figma-relai login`, or set FIGMA_TOKEN in the MCP config env. Without it, components the file already uses are still listed above — or keep a 'DS palette' page with one instance of each key component so they show up there.",
    };
  }
  const fileKey = parseFileKey(libraryFileUrl);
  if (!fileKey) {
    return { note: `Could not extract a file key from "${libraryFileUrl}".` };
  }

  const get = async (path: string) => {
    const res = await fetch(`https://api.figma.com/v1${path}`, {
      headers: { "X-Figma-Token": token },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        `Figma API ${res.status} for ${path}: ${(json as { err?: string }).err ?? "request failed"}`
      );
    }
    return json;
  };

  const [components, styles] = await Promise.all([
    get(`/files/${fileKey}/components`),
    get(`/files/${fileKey}/styles`),
  ]);
  const meta = (r: unknown) =>
    ((r as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;

  return {
    components: ((meta(components).components as Array<Record<string, unknown>>) ?? []).map(
      (c) => ({ key: c.key, name: c.name, description: c.description || undefined })
    ),
    styles: ((meta(styles).styles as Array<Record<string, unknown>>) ?? []).map((s) => ({
      key: s.key,
      name: s.name,
      type: s.style_type,
    })),
  };
}
