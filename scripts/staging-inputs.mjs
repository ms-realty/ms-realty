import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Operator-owned environment configuration is bound to the already qualified exact checkout.
 * Keeping that SHA outside Git avoids a commit having to contain its own hash. */
export function bindStagingInputs(serialized, sourceCommit) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? ""))
    throw new Error("Qualified source commit required");
  const input = JSON.parse(serialized);
  if (input.sourceCommit !== null && input.sourceCommit !== sourceCommit)
    throw new Error("Staging input source pin differs from qualified checkout");
  return { ...input, sourceCommit };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = bindStagingInputs(process.env.STAGING_INPUTS_JSON, process.env.GITHUB_SHA);
    if (
      input.database?.originIsolationReport !== "deploy/staging-isolation.generated.json" ||
      !process.env.STAGING_DATABASE_ISOLATION_JSON
    )
      throw new Error("Reviewed origin isolation report is required");
    await writeFile(
      input.database.originIsolationReport,
      process.env.STAGING_DATABASE_ISOLATION_JSON,
    );
    await writeFile("deploy/staging-inputs.generated.json", `${JSON.stringify(input, null, 2)}\n`);
    console.log("Environment-owned nonsecret staging inputs bound to exact qualified source.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging inputs unavailable");
    process.exitCode = 1;
  }
}
