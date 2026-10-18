import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { readStagingInputs, validateStaging } from "./staging-config.mjs";
import { prepareRuntimeRollout } from "./staging-rollout-proof.mjs";
import { permanent } from "./staging-settle.mjs";

try {
  const { input, artifacts } = await readStagingInputs(process.argv[2]);
  validateStaging(input, artifacts, process.env);
  const accessHeaders = {
    "CF-Access-Client-Id": input.access.serviceClientId,
    "CF-Access-Client-Secret": process.env.ACCESS_SERVICE_CLIENT_SECRET,
  };
  const headers = {
    ...accessHeaders,
    authorization: `Bearer ${process.env.STAGING_CONTROL_SECRET}`,
  };
  const call = async (path, method) => {
    const response = await fetch(`${input.origins.public}/__staging/${path}`, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.headers.get("x-robots-tag")?.includes("noindex"))
      throw (response.status === 401 || response.status === 403 ? permanent : Error)(
        `Protected noindex staging control endpoint unavailable (HTTP ${response.status})`,
      );
    return response.json();
  };
  // Preparing identities does not start queue jobs or migrations. Config/env pins cannot
  // authorize a migration until the provider actually reports the exact running images.
  // The release deploy returns before its containers start and its rolling update completes.
  const { runtime: prepared } = await prepareRuntimeRollout(
    input,
    () => call("runtime", "POST"),
    process.env.STAGING_CLOUDFLARE_READ_TOKEN,
    { allowPreparedWeb: true, retry: { ms: 600_000 } },
  );
  const initial = await call("migrate?reconcile=1", "GET");
  // Resume observations of an existing operation. Only an absent receipt permits a new start.
  if (initial.status === "absent") await call("migrate", "POST");
  const deadline = Date.now() + 600000;
  let completed;
  for (;;) {
    const receipt = await call("migrate?reconcile=1", "GET");
    if (
      receipt.configuredDigest !== input.image.split("@")[1] ||
      receipt.digestVerification !== "unqualified" ||
      receipt.sourceCommit !== input.sourceCommit ||
      receipt.buildNonce !== prepared.roles.migrator.buildNonce
    )
      throw new Error("Migration source/configuration receipt mismatch");
    if (receipt.status === "completed") {
      completed = receipt;
      break;
    }
    if (!["running", "unknown"].includes(receipt.status) || Date.now() > deadline)
      throw new Error("Migration failed or is uncertain; operator reconciliation required");
    await setTimeout(5000);
  }
  const response = await fetch(`${input.origins.public}/api/health`, {
    headers: accessHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.headers.get("x-robots-tag")?.includes("noindex"))
    throw new Error("Staging web/noindex health unavailable");
  const health = await response.json();
  if (health.build !== input.sourceCommit) throw new Error("Staging web build identity mismatch");
  const { runtime, observation } = await prepareRuntimeRollout(
    input,
    () => call("runtime", "POST"),
    process.env.STAGING_CLOUDFLARE_READ_TOKEN,
    { retry: { ms: 180_000 } },
  );
  await writeFile(
    "deploy/staging-runtime.generated.json",
    `${JSON.stringify({ schemaVersion: 1, runtime, migration: completed, provider: observation }, null, 2)}\n`,
  );
  console.log(
    "Explicit migration completion and immutable role sources checked; provider-reported digest/rollouts observed. Independent launch, parity and delivery remain unqualified.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging runtime unavailable");
  process.exitCode = 1;
}
