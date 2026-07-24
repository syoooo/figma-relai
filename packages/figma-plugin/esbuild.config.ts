import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const options: esbuild.BuildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "code.js",
  format: "iife",
  target: "es2017",
  sourcemap: false,
  minify: false,
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);
  console.log("Plugin built successfully → code.js");
}
