// Builds the API for Vercel as one bundled function in Vercel's Build Output format
// (.vercel/output), so the workspace's TypeScript packages need no separate build step.
// Every path routes to the function, which runs in Paris (cdg1), next to the Supabase database.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const out = new URL("../.vercel/output/", import.meta.url).pathname;
const fn = `${out}functions/index.func/`;
await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  entryPoints: [new URL("../src/vercel.ts", import.meta.url).pathname],
  outfile: `${fn}index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  sourcemap: "inline",
  // Some dependencies still use require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});

await writeFile(`${fn}.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, regions: ["cdg1"], maxDuration: 30 }, null, 2));
await writeFile(`${out}config.json`, JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2));
console.log("Built .vercel/output for Vercel");
