import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertLaunchEvidenceBundle,
  assertNoSecretLaunchEvidenceBundle,
  buildLaunchEvidenceBundle,
  readLaunchEvidenceBundle,
  REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
  writeLaunchEvidenceBundle,
} from "../lib/launch-evidence.mjs";

const SIGNING_KEY = "test-launch-evidence-signing-key";
const ISSUED_AT = "2026-07-31T10:00:00.000Z";
const EXPIRES_AT = "2026-07-31T11:00:00.000Z";

function evidenceFixture() {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-evidence-`);
  const artifactPath = path.join(directory, "launch-readiness.json");
  fs.writeFileSync(artifactPath, '{"ready":false}\n');
  return {
    directory,
    artifactPath,
    bundle: buildLaunchEvidenceBundle({
      artifactPaths: { launch_readiness: artifactPath },
      signingKey: SIGNING_KEY,
      issuer: "ms-realty-release",
      commitSha: "a".repeat(40),
      generatedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    }),
  };
}

test("launch evidence verifies a signed production artifact bundle", () => {
  const { directory, bundle } = evidenceFixture();
  const outputPath = path.join(directory, "launch-evidence.json");

  assert.equal(assertNoSecretLaunchEvidenceBundle(bundle), true);
  assert.equal(writeLaunchEvidenceBundle(bundle, outputPath), outputPath);
  assert.equal(
    assertLaunchEvidenceBundle(readLaunchEvidenceBundle(outputPath), {
      signingKey: SIGNING_KEY,
      now: "2026-07-31T10:30:00.000Z",
      requiredArtifactIds: ["launch_readiness"],
    }),
    true,
  );
  assert.equal(JSON.stringify(bundle).includes(SIGNING_KEY), false);
});

test("launch evidence rejects a source artifact whose bytes changed", () => {
  const { artifactPath, bundle } = evidenceFixture();
  fs.writeFileSync(artifactPath, '{"ready":true}\n');

  assert.throws(
    () => assertLaunchEvidenceBundle(bundle, { signingKey: SIGNING_KEY, now: "2026-07-31T10:30:00.000Z" }),
    /content digest does not match/,
  );
});

test("launch evidence rejects an altered bundle", () => {
  const { bundle } = evidenceFixture();
  const altered = { ...bundle, issuer: "another-issuer" };

  assert.throws(
    () => assertLaunchEvidenceBundle(altered, { signingKey: SIGNING_KEY, now: "2026-07-31T10:30:00.000Z" }),
    /signature is invalid/,
  );
});

test("launch evidence rejects a bundle from another release SHA", () => {
  const { bundle } = evidenceFixture();

  assert.throws(
    () =>
      assertLaunchEvidenceBundle(bundle, {
        signingKey: SIGNING_KEY,
        now: "2026-07-31T10:30:00.000Z",
        expectedCommitSha: "b".repeat(40),
      }),
    /does not match expected release SHA/,
  );
});

test("launch evidence rejects an expired bundle", () => {
  const { bundle } = evidenceFixture();

  assert.throws(
    () => assertLaunchEvidenceBundle(bundle, { signingKey: SIGNING_KEY, now: EXPIRES_AT }),
    /has expired/,
  );
});

test("launch evidence rejects a missing required artifact", () => {
  const { bundle } = evidenceFixture();

  assert.throws(
    () =>
      assertLaunchEvidenceBundle(bundle, {
        signingKey: SIGNING_KEY,
        now: "2026-07-31T10:30:00.000Z",
        requiredArtifactIds: ["payload_runtime"],
      }),
    /Required artifact is missing: payload_runtime/,
  );
  assert.throws(
    () =>
      assertLaunchEvidenceBundle(bundle, {
        signingKey: SIGNING_KEY,
        now: "2026-07-31T10:30:00.000Z",
        requiredArtifactIds: REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
      }),
    /Required artifact is missing: deployable_redirects/,
  );
});
