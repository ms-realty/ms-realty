import fs from "node:fs";
import path from "node:path";
const dir = new URL(".", import.meta.url).pathname;
const out = path.join(dir, "preview");
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".dc.html"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const style = src.match(/<helmet>\s*<style>([\s\S]*?)<\/style>/)[1];
  const body = src.split("</helmet>")[1].split("</x-dc>")[0];
  fs.writeFileSync(path.join(out, f.replace(".dc.html", ".html")),
    `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`);
}
console.log("preview:", fs.readdirSync(out).length, "files");
