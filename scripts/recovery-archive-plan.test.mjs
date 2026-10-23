import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { archiveInputIssues, prepareArchivePlan } from "./recovery-archive-plan.mjs";

const input = JSON.parse(
  readFileSync(new URL("../deploy/recovery-archive/inputs.example.json", import.meta.url), "utf8"),
);
const template = readFileSync(
  new URL("../deploy/recovery-archive/template.json", import.meta.url),
  "utf8",
);
test("an incomplete owner packet is explicitly blocked and never reports provider or deployment success", () => {
  const plan = prepareArchivePlan(input, template);
  assert.equal(plan.status, "blocked_inputs");
  assert(plan.missingInputs.includes("agency_account_custody"));
  assert.equal(plan.providerValidated, false);
  assert.equal(plan.changeSetCreated, false);
  assert.equal(plan.deploymentPerformed, false);
});
test("rejects a foreign region, unpinned account and wildcard operator principal before provider validation", () => {
  const issues = archiveInputIssues({
    ...input,
    region: "us-east-1",
    expectedAwsAccountId: "unknown",
    operatorPrincipalArn: "*",
  });
  assert(issues.includes("reviewed_eu_region"));
  assert(issues.includes("explicit_aws_account_pin"));
  assert(issues.includes("reviewed_operator_trust"));
});
test("a reviewer cannot be the operator or reuse the operator's public-key reference", () => {
  const issues = archiveInputIssues({
    ...input,
    operatorName: "Operator",
    separateReviewer: " operator ",
    operatorSigningPublicKeyFile: "/public/operator.pem",
    reviewerSigningPublicKeyFile: "/public/operator.pem",
  });
  assert(issues.includes("operator_and_reviewer_must_differ"));
  assert(issues.includes("distinct_operator_and_reviewer_public_keys"));
});
