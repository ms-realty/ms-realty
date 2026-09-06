// A static server for the plain-HTML previews, so a browser can measure an
// artboard's real rendered height. Nothing here is product code.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = new URL("./preview/", import.meta.url).pathname;
const port = Number(process.env.PORT || 4877);
http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname.replace(/^\/+/, "") || "Main.html"));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  const type = file.endsWith(".png") ? "image/png" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`preview server on http://localhost:${port}`));
