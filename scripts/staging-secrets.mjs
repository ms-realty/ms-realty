import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  readStagingInputs,
  requiredSecrets,
  stagingConfig,
  validateStaging,
} from "./staging-config.mjs";

try {
  const [inputPath, configPath] = process.argv.slice(2);
  const { input, artifacts } = await readStagingInputs(inputPath);
  validateStaging(input, artifacts, process.env);
  if (
    JSON.stringify(JSON.parse(await readFile(configPath, "utf8"))) !==
    JSON.stringify(stagingConfig(input, artifacts))
  )
    throw new Error("Secret target differs from the validated staging-only config");
  const supplied = Object.fromEntries(requiredSecrets.map((name) => [name, process.env[name]]));
  const result = spawnSync(
    "gateway/node_modules/.bin/wrangler",
    ["secret", "bulk", "--config", configPath],
    {
      input: JSON.stringify(supplied),
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
      env: process.env,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error("Staging secret upload failed; no secret content is logged");
  console.log("Staging-only role secrets supplied; no production environment file used.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging secrets unavailable");
  process.exitCode = 1;
}
