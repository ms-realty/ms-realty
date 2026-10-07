import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readStagingInputs, sha256, validateStaging } from "./staging-config.mjs";
import { validateConnectionProof } from "./staging-connection-proof.mjs";
import { observeRuntimeRollout } from "./staging-rollout-proof.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reportPath = "deploy/staging-connectivity.generated.json";
  try {
    const inputPath = process.argv[2];
    const { input, artifacts } = await readStagingInputs(inputPath);
    validateStaging(input, artifacts, process.env, { connectivityProbe: true });
    await writeFile(
      reportPath,
      `${JSON.stringify({ status: "UNQUALIFIED", sourceCommit: input.sourceCommit, image: input.image })}\n`,
    );
    const call = async (path) => {
      const response = await fetch(`${input.origins.public}/__staging/${path}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
        headers: {
          "CF-Access-Client-Id": input.access.serviceClientId,
          "CF-Access-Client-Secret": process.env.ACCESS_SERVICE_CLIENT_SECRET,
          authorization: `Bearer ${process.env.STAGING_CONTROL_SECRET}`,
        },
      });
      if (!response.ok || !response.headers.get("x-robots-tag")?.includes("noindex"))
        throw new Error("Protected noindex connectivity control is unavailable");
      try {
        return await response.json();
      } catch {
        throw new Error("Protected connectivity response is not valid JSON");
      }
    };
    const runtime = await call("runtime");
    const before = await observeRuntimeRollout(
      input,
      runtime,
      process.env.STAGING_CLOUDFLARE_READ_TOKEN,
      fetch,
      { allowPreparedWeb: true },
    );
    const packet = validateConnectionProof(input, runtime, await call("connectivity"));
    const afterRuntime = await call("runtime");
    if (JSON.stringify(afterRuntime.roles) !== JSON.stringify(runtime.roles))
      throw new Error("Prepared actors changed during TLS measurement");
    const after = await observeRuntimeRollout(
      input,
      afterRuntime,
      process.env.STAGING_CLOUDFLARE_READ_TOKEN,
      fetch,
      { allowPreparedWeb: true },
    );
    const report = {
      schemaVersion: 2,
      status: "PASS",
      sourceCommit: input.sourceCommit,
      image: input.image,
      database: input.database.stagingName,
      engineVersion: "16.14",
      transport: input.database.transport,
      tlsVerification: "verify-full",
      from: "cloudflare-containers",
      // Public exposure cannot be inferred from a SQL connection. This separate origin inspection is mandatory.
      exposesPublicPostgres: false,
      originIsolationSha256: input.database.originIsolationSha256,
      runtime,
      connections: packet,
      provider: { before, after },
      measuredAt: new Date().toISOString(),
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    input.database.privateConnectivityReport = reportPath;
    input.database.privateConnectivitySha256 = sha256(serialized);
    validateStaging(input, { ...artifacts, connectivity: serialized }, process.env);
    await writeFile(reportPath, serialized);
    await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
    const provenancePath = "deploy/staging-provenance.generated.json";
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    if (provenance.image !== input.image || provenance.sourceCommit !== input.sourceCommit)
      throw new Error("Image provenance changed during connectivity qualification");
    provenance.preConnectivityInputsSha256 = provenance.inputsSha256;
    provenance.inputsSha256 = sha256(JSON.stringify(input));
    provenance.privateConnectivitySha256 = input.database.privateConnectivitySha256;
    provenance.originIsolationSha256 = input.database.originIsolationSha256;
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    console.log(
      "Three prepared roles verified actual PostgreSQL 16.14 TLS through both drivers; no migration, web or queue was started. Independent launch parity remains unqualified.",
    );
  } catch (error) {
    // The held adapter remains in connectivity-only mode. No app/migration retry is attempted.
    console.error(
      error instanceof Error ? error.message : "Staging connection remains unqualified",
    );
    process.exitCode = 1;
  }
}
