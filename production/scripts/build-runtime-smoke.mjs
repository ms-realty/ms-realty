import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { assertRuntimeSmoke, buildRuntimeSmoke, loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

const smoke = buildRuntimeSmoke(loadLocaleRegistry(), loadCmsSeed());
assertRuntimeSmoke(smoke);

const outPath = fromRoot("production", "data", "runtime-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote runtime smoke fixture to ${outPath}`);
