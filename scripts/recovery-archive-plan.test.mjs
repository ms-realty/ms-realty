import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  archiveInputIssues,
  observeArchiveConfiguration,
  prepareArchivePlan,
} from "./recovery-archive-plan.mjs";

const input = JSON.parse(
  readFileSync(new URL("../deploy/recovery-archive/inputs.example.json", import.meta.url), "utf8"),
);
const complete = {
  ...input,
  archiveAccountId: "a".repeat(32),
  archiveBucketName: "ms-realty-recovery-unit",
  retentionApproved: true,
  agencyCustodyConfirmed: true,
  separateAdministrationConfirmed: true,
  outsideAccountCopyConfirmed: true,
  outsideAccountCopyReference: "synthetic custody record",
  operatorName: "Operator",
  separateReviewer: "Reviewer",
  ageRecipientFile: "/public/age.txt",
  operatorSigningPublicKeyFile: "/public/operator.pem",
  reviewerSigningPublicKeyFile: "/public/reviewer.pem",
};
test("an incomplete packet stays blocked without provider, custody or recovery qualification", () => {
  const plan = prepareArchivePlan(input);
  assert.equal(plan.status, "blocked_inputs");
  assert(plan.missingInputs.includes("agency_account_custody"));
  assert.equal(plan.providerValidated, false);
  assert.equal(plan.deploymentPerformed, false);
  assert.equal(plan.recoveryQualified, false);
});
test("rejects shared application custody, a foreign jurisdiction and absent outside-account copy", () => {
  const issues = archiveInputIssues({
    ...complete,
    archiveAccountId: input.applicationAccountId,
    jurisdiction: "default",
    outsideAccountCopyConfirmed: false,
  });
  assert(issues.includes("archive_account_must_be_separate"));
  assert(issues.includes("reviewed_eu_jurisdiction"));
  assert(issues.includes("outside_account_encrypted_copy_custody"));
});
test("a reviewer cannot be the operator or reuse the operator's public-key reference", () => {
  const issues = archiveInputIssues({
    ...complete,
    separateReviewer: " operator ",
    reviewerSigningPublicKeyFile: complete.operatorSigningPublicKeyFile,
  });
  assert(issues.includes("operator_and_reviewer_must_differ"));
  assert(issues.includes("distinct_operator_and_reviewer_public_keys"));
});
function provider(overrides = {}) {
  const calls = [];
  return {
    calls,
    transport: async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.method, "GET");
      assert.equal(new URL(url).origin, "https://api.cloudflare.com");
      assert.equal(init.headers["cf-r2-jurisdiction"], "eu");
      const suffix = new URL(url).pathname.split(complete.archiveBucketName)[1];
      const result =
        suffix === "/domains/managed"
          ? { enabled: false }
          : suffix === "/domains/custom"
            ? { domains: [] }
            : suffix === "/lock"
              ? {
                  rules: [
                    {
                      enabled: true,
                      prefix: "",
                      condition: { type: "Age", maxAgeSeconds: 90 * 86400 },
                    },
                  ],
                }
              : suffix === ""
                ? { name: complete.archiveBucketName, jurisdiction: "eu", ...overrides }
                : { id: complete.archiveAccountId };
      return Response.json({ success: true, errors: [], result });
    },
  };
}
test("successful provider GETs cannot qualify a non-EU archive", async () => {
  const p = provider({ jurisdiction: "default" });
  await assert.rejects(
    observeArchiveConfiguration(complete, "fixture", p.transport),
    /jurisdiction/,
  );
});
test("configuration observation does not establish writer denials, outside-copy integrity or recovery", async () => {
  const p = provider();
  const result = await observeArchiveConfiguration(complete, "fixture", p.transport);
  assert.equal(p.calls.length, 5);
  assert.equal(result.privateAccess, true);
  assert.equal(result.writerPermissionDenialsVerified, false);
  assert.equal(result.outsideAccountCopyVerified, false);
  assert.equal(result.recoveryQualified, false);
});
