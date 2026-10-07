import { spawnSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifactModule = new URL("../gateway/staging-artifacts.generated.ts", import.meta.url);
try {
  await access(artifactModule);
} catch {
  await writeFile(
    artifactModule,
    'export const stagingArtifacts: {fixture: boolean; sourceCommit: string; routes: string; media: string} = {fixture:true,sourceCommit:"types-local",routes:"[]",media:"[]"};\n',
  );
}
for (const [command, args] of [
  [
    "gateway/node_modules/.bin/wrangler",
    [
      "types",
      "gateway/cloudflare-runtime.generated.d.ts",
      "--config",
      "gateway/wrangler.containers.types.jsonc",
      "--strict-vars=false",
    ],
  ],
  ["node_modules/.bin/tsc", ["--project", "gateway/tsconfig.json"]],
  ["node_modules/.bin/tsc", ["--project", "gateway/tsconfig.test.json"]],
]) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
