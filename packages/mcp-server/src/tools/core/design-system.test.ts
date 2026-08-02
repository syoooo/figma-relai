import { describe, expect, test } from "bun:test";
import {
  discoverLibraryFiles,
  librariesNotCatalogued,
  probeFailureNote,
} from "./design-system.js";

// Resolving a library file from the keys a file already holds is the thing that
// removed "paste a library URL" from the workflow. These pin the three rules the
// real Figma API taught us, each verified against api.figma.com before landing:
// dot-prefixed assets are never published, a set's key answers only at
// /component_sets, and one file can consume more than one library.

type Call = string;

function fakeApi(table: Record<string, string>, calls: Call[]) {
  return async (path: string) => {
    calls.push(path);
    const fileKey = table[path];
    return fileKey
      ? { ok: true, status: 200, json: { meta: { file_key: fileKey, name: "x" } } }
      : { ok: false, status: 404, json: { message: "Component not found." } };
  };
}

const scan = (
  comps: Array<{ key: string; name: string }>,
  styles: Array<{ key: string; name: string }> = []
) => ({ components: { remoteUsed: { items: comps } }, styles: { remoteUsed: { items: styles } } });

describe("discoverLibraryFiles", () => {
  test("resolves a component SET key via /component_sets after /components misses", async () => {
    const calls: Call[] = [];
    const api = fakeApi({ "/component_sets/btn": "GINFILE" }, calls);

    const found = await discoverLibraryFiles(api, scan([{ key: "btn", name: "Button" }]));

    expect(found).toEqual([{ fileKey: "GINFILE", via: "Button" }]);
    expect(calls).toEqual(["/component_sets/btn"]);
  });

  test("skips dot-prefixed names — they are never published, so they only burn calls", async () => {
    const calls: Call[] = [];
    const api = fakeApi({ "/component_sets/btn": "GINFILE" }, calls);

    await discoverLibraryFiles(
      api,
      scan([
        { key: "ell", name: ".atom/Ellipse" },
        { key: "btn", name: "Button" },
      ])
    );

    expect(calls.some((c) => c.includes("ell"))).toBe(false);
  });

  test("reports every library the file consumes, not just the first", async () => {
    const calls: Call[] = [];
    const api = fakeApi(
      { "/component_sets/btn": "GINFILE", "/components/caret": "ICONFILE" },
      calls
    );

    const found = await discoverLibraryFiles(
      api,
      scan([
        { key: "btn", name: "Button" },
        { key: "caret", name: "caret-down - solid" },
      ])
    );

    expect(found.map((f) => f.fileKey).sort()).toEqual(["GINFILE", "ICONFILE"]);
    // the icon is a plain component: /component_sets misses, /components answers
    expect(calls).toContain("/component_sets/caret");
    expect(calls).toContain("/components/caret");
  });

  test("falls back to style keys when no component resolves", async () => {
    const calls: Call[] = [];
    const api = fakeApi({ "/styles/label": "GINFILE" }, calls);

    const found = await discoverLibraryFiles(
      api,
      scan([{ key: "gone", name: "Deleted" }], [{ key: "label", name: "Label/md" }])
    );

    expect(found).toEqual([{ fileKey: "GINFILE", via: "Label/md" }]);
  });

  test("returns nothing rather than guessing when every candidate 404s", async () => {
    const api = fakeApi({}, []);
    expect(await discoverLibraryFiles(api, scan([{ key: "a", name: "A" }]))).toEqual([]);
  });
});

// Measured on the real API (2026-08-02): a component-set key answers 403 at
// /component_sets and 404 at /components, so a mixed run is what a permission
// problem actually looks like — never an all-403 one.
describe("probeFailureNote", () => {
  test("calls a mixed 403/404 run a permission problem, not a dead token", () => {
    const note = probeFailureNote([403, 404, 404, 403]);
    expect(note).toContain("2 of 4");
    expect(note).toContain("the token works");
    expect(note).not.toContain("expired");
  });

  test("calls an all-403 run a dead token", () => {
    expect(probeFailureNote([403, 403])).toContain("expired");
  });

  test("says nothing when every probe simply missed", () => {
    expect(probeFailureNote([404, 404])).toBeNull();
    expect(probeFailureNote([])).toBeNull();
  });
});

// Discovery starts from what the file already uses, so a library it has drawn
// nothing from leaves no trace at all — and a catalog that silently omits it
// reads as the whole design system.
describe("librariesNotCatalogued", () => {
  test("names an enabled library the catalog could not reach", () => {
    expect(
      librariesNotCatalogued({
        libraryCatalog: { libraries: [{ name: "[MASTER] Gin" }] },
        variables: {
          libraryCollections: [
            { libraryName: "[MASTER] Gin" },
            { libraryName: "Gin Foundations" },
            { libraryName: "Gin Foundations" }, // two collections, one library
          ],
        },
      })
    ).toEqual(["Gin Foundations"]);
  });

  test("says nothing when every enabled library was catalogued", () => {
    expect(
      librariesNotCatalogued({
        libraryCatalog: { libraries: [{ name: "  gin  " }] },
        variables: { libraryCollections: [{ libraryName: "Gin" }] },
      })
    ).toEqual([]);
  });

  test("stays quiet when nothing was catalogued at all — the token note covers that", () => {
    expect(
      librariesNotCatalogued({
        libraryCatalog: { note: "needs a token" },
        variables: { libraryCollections: [{ libraryName: "Gin" }] },
      })
    ).toEqual([]);
  });
});
