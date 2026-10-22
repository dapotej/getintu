// Serves the member app's web build (dist/) for the end-to-end tests. Unknown paths get the app
// shell, which routes them. Usage: node scripts/serve.mjs dist 3003
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [dir = "dist", port = "3003"] = process.argv.slice(2);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain", ".ttf": "font/ttf" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(dir, "index.html");
  }
  try {
    await stat(file);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=0" });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`Member app on http://localhost:${port}`));
