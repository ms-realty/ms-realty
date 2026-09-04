#!/usr/bin/env node
import fs from "node:fs";
import {
  HERMES_UPSTREAM_PROVENANCE_PATH,
  buildHermesUpstreamProvenance,
  compareHermesReleaseVersions,
  fetchOfficialHermesReleases,
  hermesImageForRelease,
  parseHermesImageReference,
  readHermesImagePin,
  resolveHermesDockerManifestDigest,
  resolveOfficialHermesTagCommit,
  selectLatestStableHermesRelease,
  synchronizeHermesImagePins,
  writeHermesUpstreamProvenance,
} from "../lib/hermes-upstream-update.mjs";

const dryRun = process.argv.includes("--dry-run");
const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();

function currentProvenanceMatches(existing, next) {
  if (!existing) return false;
  const withoutTimestamp = (value) => {
    const copy = structuredClone(value);
    delete copy.generated_at;
    return copy;
  };
  return JSON.stringify(withoutTimestamp(existing)) === JSON.stringify(withoutTimestamp(next));
}

function readProvenance(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const releases = await fetchOfficialHermesReleases({ githubToken: process.env.GITHUB_TOKEN });
const release = selectLatestStableHermesRelease(releases);
const currentImage = readHermesImagePin();
const current = parseHermesImageReference(currentImage);
const currentRelease = { tag: current.tag };

if (compareHermesReleaseVersions(release, currentRelease) < 0) {
  throw new Error(`Refusing to downgrade Hermes Agent from ${current.tag} to ${release.tag}`);
}

const [commit, docker] = await Promise.all([
  resolveOfficialHermesTagCommit(release.tag, { githubToken: process.env.GITHUB_TOKEN }),
  resolveHermesDockerManifestDigest(release.tag),
]);
const image = hermesImageForRelease(release.tag, docker.digest);
const provenance = buildHermesUpstreamProvenance({ release, commit, docker, generatedAt });
const previousProvenance = readProvenance(HERMES_UPSTREAM_PROVENANCE_PATH);
const pinsChanged = currentImage !== image;
const provenanceChanged = !currentProvenanceMatches(previousProvenance, provenance);

if (!dryRun) {
  if (pinsChanged) synchronizeHermesImagePins(image);
  if (provenanceChanged) writeHermesUpstreamProvenance(provenance);
}

console.log(`Hermes upstream release: ${release.tag}`);
console.log(`Hermes upstream commit: ${commit.sha}`);
console.log(`Hermes Docker image: ${image}`);
console.log(`Hermes pin update: ${pinsChanged ? "changed" : "unchanged"}`);
console.log(`Hermes provenance: ${provenanceChanged ? "changed" : "unchanged"}`);
console.log(`Hermes updater result: ${pinsChanged || provenanceChanged ? "changed" : "unchanged"}`);
