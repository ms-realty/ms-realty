// Serves the built Storybook (storybook-static/) for e2e/visual.spec.ts. No dependencies, so it
// runs unchanged inside the Playwright Docker image with the host's node_modules mounted.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../storybook-static/", import.meta.url));
const port = Number(process.env.STORYBOOK_PORT ?? 6106);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://storybook").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    response.writeHead(403).end();
    return;
  }
  if (path.endsWith("/")) file = join(file, "index.html");
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Storybook static build on http://127.0.0.1:${port}`);
});
