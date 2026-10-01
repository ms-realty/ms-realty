import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { accountId, readStagingInputs, sha256, validateStaging } from "./staging-config.mjs";

// Records an already pushed image; this script never builds or pushes it.
const [path, tag, output] = process.argv.slice(2);
try {
  const { input, artifacts } = await readStagingInputs(path);
  validateStaging(input, artifacts, undefined, { imageRequired: false });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== input.sourceCommit || tag !== `ms-realty-staging:${head}`)
    throw new Error("Image tag/source commit mismatch");
  const registryTag = `registry.cloudflare.com/${accountId}/${tag}`;
  const [inspected] = JSON.parse(
    execFileSync("docker", ["image", "inspect", registryTag], { encoding: "utf8" }),
  );
  const image = inspected?.RepoDigests?.find((value) =>
    value.startsWith(`registry.cloudflare.com/${accountId}/ms-realty-staging@sha256:`),
  );
  if (
    !image ||
    inspected.Config?.Labels?.["org.opencontainers.image.revision"] !== head ||
    inspected.Os !== "linux" ||
    inspected.Architecture !== "amd64"
  )
    throw new Error("Pushed immutable image/revision/platform could not be verified");
  input.image = image;
  validateStaging(input, artifacts);
  await writeFile(output, `${JSON.stringify(input, null, 2)}\n`);
  const provenance = {
    purpose: input.purpose,
    productionAllowed: input.purpose === "complete_parity",
    schemaVersion: 1,
    sourceCommit: head,
    baseCommit: input.baseCommit,
    image,
    dockerfileSha256: sha256(await readFile("Dockerfile")),
    rootLockSha256: sha256(await readFile("package-lock.json")),
    gatewayLockSha256: sha256(await readFile("gateway/package-lock.json")),
    inputsSha256: sha256(JSON.stringify(input)),
    routesSha256: input.artifacts.routesSha256,
    mediaSha256: input.artifacts.mediaSha256,
    workflowRun: process.env.GITHUB_RUN_ID ?? null,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    roles: ["web", "worker", "migrator"],
    platform: "linux/amd64",
  };
  await writeFile(
    "deploy/staging-provenance.generated.json",
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `image=${image}\nsubject_name=${image.split("@")[0]}\ndigest=${image.split("@")[1]}\n`,
      { flag: "a" },
    );
  console.log(
    `Verified image ${image}; staging runtime and independent parity remain unqualified.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Image provenance unavailable");
  process.exitCode = 1;
}
