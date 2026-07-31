import {
  assertLaunchEvidenceBundle,
  readLaunchEvidenceBundle,
  REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
} from "../lib/launch-evidence.mjs";

function required(env, key) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

try {
  const signingKey = required(process.env, "MS_REALTY_EVIDENCE_SIGNING_KEY");
  if (signingKey.length < 32) throw new Error("MS_REALTY_EVIDENCE_SIGNING_KEY must be at least 32 characters");
  const expectedCommitSha = String(process.env.MS_REALTY_RELEASE_SHA || process.env.GITHUB_SHA || "").trim();
  if (!expectedCommitSha) throw new Error("Missing MS_REALTY_RELEASE_SHA or GITHUB_SHA");
  const bundle = readLaunchEvidenceBundle(required(process.env, "MS_REALTY_LAUNCH_EVIDENCE_BUNDLE_PATH"));
  assertLaunchEvidenceBundle(bundle, {
    signingKey,
    expectedCommitSha,
    requiredArtifactIds: REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
  });
  console.log(`Launch evidence verified for ${bundle.commit_sha} (${bundle.artifacts.length} artifacts)`);
} catch (error) {
  console.error(`LAUNCH EVIDENCE VERIFY FAILED: ${error.message}`);
  console.error("Next: rerun npm run launch:evidence:capture on the release worker; do not reuse expired or altered evidence.");
  process.exitCode = 1;
}
