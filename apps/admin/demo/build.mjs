// Builds the admin console as one self-contained HTML page with in-browser stand-ins for the
// API and Supabase, for sharing as a click-through demo. Usage: pnpm --filter @intu/admin demo
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");

// A local export of the partner sheet's pipeline tab, if present, is baked into this private demo.
// The file is gitignored: the repo itself only ever holds TEST data.
const pipelineFile = join(here, "pipeline.local.csv");
const pipelineCsv = existsSync(pipelineFile) ? await readFile(pipelineFile, "utf8") : "";
if (pipelineCsv) console.log("Including the partner pipeline from demo/pipeline.local.csv");

const js = await build({
  entryPoints: [join(here, "main.tsx")],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
  minify: true,
  jsx: "automatic",
  alias: {
    "next/navigation": join(here, "router.tsx"),
    "next/link": join(here, "router.tsx"),
    "@": join(here, "../src"),
  },
  plugins: [
    {
      // Swap the Supabase client for the demo's stand-in, however the console imports it.
      name: "demo-supabase",
      setup(b) {
        const real = join(here, "../src/lib/supabase");
        b.onResolve({ filter: /supabase$/ }, (args) => {
          const target = args.path.startsWith(".") ? join(args.resolveDir, args.path) : args.path.replace(/^@\//, join(here, "../src") + "/");
          return target === real ? { path: join(here, "supabase.ts") } : undefined;
        });
      },
    },
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '"demo"',
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": '"demo"',
    DEMO_PIPELINE_CSV: JSON.stringify(pipelineCsv),
  },
  logLevel: "warning",
});

const cssSource = await readFile(join(here, "demo.css"), "utf8");
const css = await postcss([tailwind({ optimize: { minify: true } })]).process(cssSource, { from: join(here, "demo.css") });

// Page content only: the artifact host adds the document skeleton.
const html = `<title>intu Admin Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>
:root { color-scheme: dark; }
${css.css}
</style>
<div id="root"></div>
<script type="module">${js.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>
`;
await mkdir(out, { recursive: true });
await writeFile(join(out, "intu-admin-demo.html"), html);
console.log(`Wrote ${join(out, "intu-admin-demo.html")} (${Math.round(html.length / 1024)} KB)`);
