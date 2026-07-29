import { registerHandler } from "../dispatcher.js";

registerHandler("get_pages", async () => {
  const pages = figma.root.children;
  const results = [];
  for (const page of pages) {
    let childCount = -1;
    if (page === figma.currentPage) {
      childCount = page.children.length;
    } else {
      try {
        await page.loadAsync();
        childCount = page.children.length;
      } catch {
        childCount = -1;
      }
    }
    results.push({
      id: page.id,
      name: page.name,
      childCount,
      isCurrent: page === figma.currentPage,
    });
  }
  return results;
});

registerHandler("create_page", async (params) => {
  const page = figma.createPage();
  page.name = params.name as string;
  // Pages are ordered by meaning, not by creation time — a new component page
  // belongs next to its neighbours, not at the bottom of a 43-page file.
  let index: number | null = null;
  if (params.afterPageId) {
    const at = figma.root.children.findIndex((p) => p.id === params.afterPageId);
    if (at === -1) throw new Error(`Page not found: ${params.afterPageId}`);
    index = at + 1;
  } else if (typeof params.index === "number") {
    index = Math.max(0, Math.min(params.index as number, figma.root.children.length - 1));
  }
  if (index !== null) figma.root.insertChild(index, page);
  return { id: page.id, name: page.name, index: figma.root.children.indexOf(page) };
});

registerHandler("rename_page", async (params) => {
  const page = figma.root.children.find((p) => p.id === params.pageId);
  if (!page) throw new Error(`Page not found: ${params.pageId}`);
  page.name = params.name as string;
  return { id: page.id, name: page.name };
});

registerHandler("delete_page", async (params) => {
  if (figma.root.children.length <= 1) {
    throw new Error("Cannot delete the last page");
  }
  const page = figma.root.children.find((p) => p.id === params.pageId);
  if (!page) throw new Error(`Page not found: ${params.pageId}`);
  const name = page.name;
  page.remove();
  return { success: true, name };
});

registerHandler("switch_page", async (params) => {
  const page = figma.root.children.find((p) => p.id === params.pageId);
  if (!page) throw new Error(`Page not found: ${params.pageId}`);
  await figma.setCurrentPageAsync(page);
  return { id: page.id, name: page.name };
});

registerHandler("set_page_background", async (params) => {
  const page = figma.root.children.find((p) => p.id === params.pageId);
  if (!page) throw new Error(`Page not found: ${params.pageId}`);
  const c = params.color as { r: number; g: number; b: number; a?: number };
  page.backgrounds = [{ type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a ?? 1 }];
  return { id: page.id, name: page.name };
});

registerHandler("get_flow_starting_points", async (params) => {
  const page = figma.root.children.find((p) => p.id === params.pageId);
  if (!page) throw new Error(`Page not found: ${params.pageId}`);
  return { id: page.id, flowStartingPoints: page.flowStartingPoints };
});
