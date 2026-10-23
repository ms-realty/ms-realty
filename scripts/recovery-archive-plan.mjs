// Local proposal/validation only. This command cannot create or execute a change set.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export function archiveInputIssues(input) {
  const issues = [];
  if (input.scope !== "independent_recovery_archive") issues.push("independent_archive_scope");
  if (typeof input.awsProfile !== "string" || !/^[A-Za-z0-9_.-]+$/.test(input.awsProfile))
    issues.push("agency_aws_profile");
  if (!/^\d{12}$/.test(input.expectedAwsAccountId ?? "")) issues.push("explicit_aws_account_pin");
  if (input.region !== "eu-central-1") issues.push("reviewed_eu_region");
  if (
    typeof input.archiveBucketName !== "string" ||
    !/^ms-realty-recovery-[a-z0-9-]+$/.test(input.archiveBucketName) ||
    input.archiveBucketName.length > 63
  )
    issues.push("agency_archive_bucket");
  if (
    !/^arn:aws:iam::\d{12}:(role|user)\/[A-Za-z0-9+=,.@_/-]+$/.test(
      input.operatorPrincipalArn ?? "",
    )
  )
    issues.push("reviewed_operator_trust");
  if (
    !Number.isSafeInteger(input.proposedGovernanceRetentionDays) ||
    input.proposedGovernanceRetentionDays < 1 ||
    input.proposedGovernanceRetentionDays > 3650 ||
    input.retentionApproved !== true
  )
    issues.push("approved_governance_retention");
  if (input.agencyCustodyConfirmed !== true) issues.push("agency_account_custody");
  if (typeof input.operatorName !== "string" || !input.operatorName.trim())
    issues.push("named_recovery_operator");
  if (typeof input.separateReviewer !== "string" || !input.separateReviewer.trim())
    issues.push("separate_recovery_reviewer");
  else if (input.separateReviewer.trim().toLowerCase() === input.operatorName?.trim().toLowerCase())
    issues.push("operator_and_reviewer_must_differ");
  if (
    input.operatorSigningPublicKeyFile &&
    input.operatorSigningPublicKeyFile === input.reviewerSigningPublicKeyFile
  )
    issues.push("distinct_operator_and_reviewer_public_keys");
  for (const name of [
    "ageRecipientFile",
    "operatorSigningPublicKeyFile",
    "reviewerSigningPublicKeyFile",
  ])
    if (typeof input[name] !== "string" || !input[name].startsWith("/")) issues.push(name);
  return issues;
}

export function prepareArchivePlan(input, templateBytes) {
  JSON.parse(templateBytes);
  const issues = archiveInputIssues(input);
  return {
    schemaVersion: 1,
    kind: "independent_recovery_archive_proposal",
    status: issues.length ? "blocked_inputs" : "prepared_unvalidated",
    templateSha256: createHash("sha256").update(templateBytes).digest("hex"),
    expectedAwsAccountId: input.expectedAwsAccountId ?? null,
    region: input.region,
    bucket: input.archiveBucketName ?? null,
    proposedRetentionDays: input.proposedGovernanceRetentionDays,
    missingInputs: issues,
    providerValidated: false,
    changeSetCreated: false,
    deploymentPerformed: false,
    productionQualified: false,
    next: issues.length
      ? "Complete the agency custody and review inputs"
      : "Validate in the pinned account; review a separate change set before any execution",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        inputs: { type: "string" },
        out: { type: "string" },
        validate: { type: "boolean", default: false },
      },
    });
    if (!values.inputs || !values.out)
      throw Error("Use --inputs <private-json> --out <report-json> [--validate]");
    const templatePath = fileURLToPath(
      new URL("../deploy/recovery-archive/template.json", import.meta.url),
    );
    const input = JSON.parse(readFileSync(values.inputs, "utf8"));
    const report = prepareArchivePlan(input, readFileSync(templatePath, "utf8"));
    if (values.validate && report.missingInputs.length === 0) {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("AWS_")),
      );
      env.AWS_EC2_METADATA_DISABLED = "true";
      const call = (args) =>
        JSON.parse(
          execFileSync(
            "aws",
            ["--profile", input.awsProfile, "--region", input.region, ...args, "--output", "json"],
            { env, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
          ),
        );
      const identity = call(["sts", "get-caller-identity"]);
      if (identity.Account !== input.expectedAwsAccountId)
        throw Error("Selected AWS identity differs from the agency account pin; no further call");
      report.validation = call([
        "cloudformation",
        "validate-template",
        "--template-body",
        `file://${templatePath}`,
      ]);
      report.status = "template_validated_resources_not_created";
      report.providerValidated = true;
    }
    const output = resolve(values.out);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
    if (report.missingInputs.length) process.exitCode = 2;
  } catch {
    console.error(
      "Archive proposal could not be validated. No resources or change set were created; check the private inputs and agency AWS session.",
    );
    process.exitCode = 1;
  }
}
