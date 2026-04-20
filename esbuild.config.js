import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const config = {
  entryPoints: ["src/cli/index.ts"],
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/cli.js",
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __cjsReq } from "module"; const require = __cjsReq(import.meta.url);',
  },
  external: [
    "better-sqlite3",
    "chokidar",
    "fsevents",
    "react",
    "react/jsx-runtime",
    "ink",
    "ink-spinner",
    "yoga-wasm-web",
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
