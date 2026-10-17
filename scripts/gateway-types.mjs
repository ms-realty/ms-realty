// Reproduce bindings with the pinned Wrangler release, then scope its runtime declarations.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const result = spawnSync(
  "npx",
  [
    "--yes",
    "wrangler@4.143.0",
    "types",
    "gateway/worker-configuration.d.ts",
    "--config",
    "gateway/wrangler.jsonc",
    "--strict-vars=false",
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const declarationPath = "gateway/worker-configuration.d.ts";
const generated = (await readFile(declarationPath, "utf8")).replace(/[ \t]+$/gm, "");
await writeFile(
  declarationPath,
  generated +
    "\n// Keep Worker runtime types local to this module; the Next application uses DOM/Node types.\nexport type { Env, R2Bucket, R2Object, R2ObjectBody };\n",
);
