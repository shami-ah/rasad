import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const config = {
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/cli.js",
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
  external: [
    "better-sqlite3",
    "chokidar",
    "fsevents",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(config);
  console.log("CLI built → dist/cli.js");
}
