// Font loading utilities for the Figma plugin sandbox

// Load a font with fallback chain, returns the loaded FontName or null
export async function loadFont(
  family: string = "Inter",
  style: string = "Regular"
): Promise<FontName | null> {
  const fallbacks: FontName[] = [
    { family, style },
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
    { family: "Roboto", style: "Regular" },
  ];

  for (const font of fallbacks) {
    try {
      await figma.loadFontAsync(font);
      return font;
    } catch (_e) {
      continue;
    }
  }
  return null;
}

// Load all fonts used in a text node
export async function loadNodeFonts(node: TextNode): Promise<void> {
  const len = node.characters.length;
  if (len === 0) {
    const font = await loadFont();
    if (font) node.fontName = font;
    return;
  }

  const loaded = new Set<string>();
  for (let i = 0; i < len; i++) {
    const fontName = node.getRangeFontName(i, i + 1) as FontName;
    const key = `${fontName.family}:${fontName.style}`;
    if (!loaded.has(key)) {
      try {
        await figma.loadFontAsync(fontName);
      } catch {
        // Exact font unavailable, load fallback and replace on the range
        const fallback = await loadFont(fontName.family, fontName.style);
        if (!fallback) {
          throw new Error(`Cannot load font "${fontName.family} ${fontName.style}" or any fallback`);
        }
        // Update font on all characters using this font
        for (let j = i; j < len; j++) {
          const jFont = node.getRangeFontName(j, j + 1) as FontName;
          if (jFont.family === fontName.family && jFont.style === fontName.style) {
            node.setRangeFontName(j, j + 1, fallback);
          }
        }
      }
      loaded.add(key);
    }
  }
}
