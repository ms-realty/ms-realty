// Reproduce bindings with the pinned Wrangler release, then scope its runtime declarations.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const gatewayPackage = JSON.parse(
  await readFile(new URL("../gateway/package.json", import.meta.url), "utf8"),
);
const wranglerVersion = gatewayPackage.devDependencies.wrangler;
if (!/^\d+\.\d+\.\d+$/.test(wranglerVersion))
  throw new Error("Gateway Wrangler must be pinned to an exact release");
const result = spawnSync(
  "npx",
  [
    "--yes",
    `wrangler@${wranglerVersion}`,
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
