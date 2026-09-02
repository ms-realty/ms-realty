// Every artboard inlines the shared BASE stylesheet. A screen-local class that
// reuses a BASE name silently inherits it — that is how a 372px card became a
// 15px checkbox. This finds the collisions and the undefined classes.
import fs from "node:fs";
import path from "node:path";
import { BASE } from "./shell.mjs";

const dir = new URL(".", import.meta.url).pathname;
const classesIn = (css) => new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const baseClasses = classesIn(BASE);

let problems = 0;
for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".dc.html"))) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const style = src.match(/<helmet>\s*<style>([\s\S]*?)<\/style>/)[1];
  const body = src.split("</helmet>")[1].split("</x-dc>")[0];
  const declared = classesIn(style);
  // "local" = declared in this file's style block but not in the shared BASE
  const localCss = style.slice(BASE.length);
  const local = classesIn(localCss);
  const collisions = [...local].filter((c) => baseClasses.has(c));

  const used = new Set();
  for (const m of body.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
  const undef = [...used].filter((c) => !declared.has(c));

  if (collisions.length || undef.length) {
    problems += 1;
    console.log(`\n${file}`);
    if (collisions.length) console.log(`  collides with BASE: ${collisions.join(", ")}`);
    if (undef.length) console.log(`  used but undefined:  ${undef.join(", ")}`);
  }
}
console.log(problems ? `\n${problems} file(s) with problems` : "\nno class collisions, no undefined classes");
