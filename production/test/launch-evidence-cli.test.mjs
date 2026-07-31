import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLaunchEvidenceBundle,
  REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
  writeLaunchEvidenceBundle,
} from "../lib/launch-evidence.mjs";
import { fromRoot } from "../lib/paths.mjs";

const signingKey = "test-launch-evidence-cli-signing-key-123456";

test("launch evidence verify CLI accepts a fresh bundle and rejects altered artifacts", () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-evidence-cli-`);
  const artifactPaths = Object.fromEntries(
    REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS.map((id) => [id, path.join(directory, `${id}.json`)]),
  );
  const artifactPath = artifactPaths.payload_runtime;
  const bundlePath = path.join(directory, "launch-evidence.json");
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + 60 * 60 * 1000);
  for (const [id, filePath] of Object.entries(artifactPaths)) fs.writeFileSync(filePath, `{"id":"${id}"}\n`);
  writeLaunchEvidenceBundle(
    buildLaunchEvidenceBundle({
      artifactPaths,
      signingKey,
      issuer: "ms-realty-release-worker",
      commitSha: "a".repeat(40),
      generatedAt,
      expiresAt,
    }),
    bundlePath,
  );
  const env = {
    ...process.env,
    MS_REALTY_EVIDENCE_SIGNING_KEY: signingKey,
    MS_REALTY_LAUNCH_EVIDENCE_BUNDLE_PATH: bundlePath,
    GITHUB_SHA: "a".repeat(40),
  };
  delete env.MS_REALTY_RELEASE_SHA;
  const valid = spawnSync(process.execPath, [fromRoot("production", "scripts", "verify-launch-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env,
  });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Launch evidence verified/);

  fs.writeFileSync(artifactPath, '{"ready":false}\n');
  const altered = spawnSync(process.execPath, [fromRoot("production", "scripts", "verify-launch-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env,
  });
  assert.notEqual(altered.status, 0);
  assert.match(altered.stderr, /content digest does not match/);
});

test("launch evidence capture CLI fails closed without production evidence inputs", () => {
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "capture-launch-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_EVIDENCE_SIGNING_KEY: "" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LAUNCH EVIDENCE CAPTURE FAILED: Missing MS_REALTY_EVIDENCE_SIGNING_KEY/);
});
