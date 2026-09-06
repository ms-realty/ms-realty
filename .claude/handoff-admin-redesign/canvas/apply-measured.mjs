// Usage:
//   node apply-measured.mjs --hash        prints the measure.html URL hash for every artboard
//   node apply-measured.mjs '{"Main":1031,...}'   writes measured.json and rebuilds canvas.json
// A frame shorter than its content clips, and clipping is the only way a frame
// can fail, so heights come from the browser, never from a guess.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const dir = new URL(".", import.meta.url).pathname;
const canvasSrc = fs.readFileSync(`${dir}build/canvas.mjs`, "utf8");
const frames = [...canvasSrc.matchAll(/\["([A-Za-z]+)\.dc\.html", "[^"]*", (\d+), \d+\]/g)].map((m) => [m[1], Number(m[2])]);
if (process.argv[2] === "--hash") {
  console.log(`http://localhost:4877/measure.html#${encodeURIComponent(JSON.stringify(frames))}`);
  process.exit(0);
}
const measured = JSON.parse(process.argv[2] || "{}");
const current = JSON.parse(fs.readFileSync(`${dir}measured.json`, "utf8"));
const next = { ...current };
const changes = [];
for (const [name] of frames) {
  if (!(name in measured)) continue;
  const h = Math.ceil(measured[name]);
  if (next[name] !== h) { changes.push(`${name} ${next[name]} -> ${h}`); next[name] = h; }
}
fs.writeFileSync(`${dir}measured.json`, `${JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 2)}\n`);
execFileSync("node", [`${dir}build/canvas.mjs`], { stdio: "inherit" });
console.log(changes.length ? changes.join("\n") : "no height changed");
