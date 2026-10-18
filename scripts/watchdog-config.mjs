import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function watchdogConfiguration(sourceCommit) {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit ?? ""))
    throw new Error("Exact committed watchdog source required");
  const file = new URL("../gateway/wrangler.watchdog.jsonc", import.meta.url);
  const template = JSON.parse((await readFile(file, "utf8")).replace(/^\/\/[^\n]*\n/u, ""));
  if (
    template.name !== "ms-realty-route-watchdog" ||
    template.account_id !== "921d0224dcd595c87b7928d2b3c479d1" ||
    template.routes
  )
    throw new Error("Private watchdog target changed");
  const main = fileURLToPath(new URL("../gateway/route-watchdog.ts", import.meta.url));
  const sourceSha256 = createHash("sha256")
    .update(await readFile(main))
    .digest("hex");
  return {
    ...template,
    main,
    vars: {
      ...template.vars,
      WATCHDOG_SOURCE_COMMIT: sourceCommit,
      WATCHDOG_SOURCE_SHA256: sourceSha256,
      WATCHDOG_ORIGIN: "https://ms-realty-route-watchdog.ms-realty-bg.workers.dev",
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceCommit, output] = process.argv.slice(2);
  if (!output || process.argv.length !== 4)
    throw new Error("watchdog-config <committed-sha> <private-config.json>");
  await writeFile(
    output,
    `${JSON.stringify(await watchdogConfiguration(sourceCommit), null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log("Private routing watchdog configuration retained; no business host routes attached.");
}
