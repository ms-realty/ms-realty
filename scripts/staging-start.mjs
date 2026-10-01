import { setTimeout } from "node:timers/promises";
import { readStagingInputs, validateStaging } from "./staging-config.mjs";

try {
  const { input, artifacts } = await readStagingInputs(process.argv[2]);
  validateStaging(input, artifacts, process.env);
  const url = `${input.origins.public}/__staging/migrate`;
  const accessHeaders = {
    "CF-Access-Client-Id": input.access.serviceClientId,
    "CF-Access-Client-Secret": process.env.ACCESS_SERVICE_CLIENT_SECRET,
  };
  const headers = {
    ...accessHeaders,
    authorization: `Bearer ${process.env.STAGING_CONTROL_SECRET}`,
  };
  const call = async (method) => {
    const response = await fetch(url, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.headers.get("x-robots-tag")?.includes("noindex"))
      throw new Error("Protected noindex migration endpoint unavailable");
    return response.json();
  };
  await call("POST");
  const deadline = Date.now() + 600000;
  for (;;) {
    const receipt = await call("GET");
    if (receipt.digest !== input.image.split("@")[1])
      throw new Error("Migration receipt digest mismatch");
    if (receipt.status === "passed") break;
    if (receipt.status !== "running" || Date.now() > deadline)
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
  console.log(
    "Digest-bound migration and web identity verified; this is not independent launch parity or delivery proof.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging runtime unavailable");
  process.exitCode = 1;
}
