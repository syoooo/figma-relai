import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  sourcemap: true,
  clean: true,
  bundle: true,
  minify: false,
  noExternal: ["@figma-relai/shared"],
  loader: {
    ".md": "text",
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
