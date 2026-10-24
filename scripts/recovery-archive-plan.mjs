// Local plan and fixed-origin GET validation only. No provider mutation or recovery opening.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export function archiveInputIssues(input) {
  const issues = [];
  if (input.scope !== "independent_recovery_archive" || input.provider !== "cloudflare_r2")
    issues.push("cloudflare_archive_scope");
  for (const name of ["applicationAccountId", "archiveAccountId"])
    if (!/^[a-f0-9]{32}$/.test(input[name] ?? "")) issues.push(name);
  // Public account identifier already pinned in staging.yml; this is not a credential.
  if (input.applicationAccountId !== "921d0224dcd595c87b7928d2b3c479d1")
    issues.push("ms_realty_application_account_pin");
  if (input.archiveAccountId && input.archiveAccountId === input.applicationAccountId)
    issues.push("archive_account_must_be_separate");
  if (input.jurisdiction !== "eu") issues.push("reviewed_eu_jurisdiction");
  if (
    typeof input.archiveBucketName !== "string" ||
    !/^ms-realty-recovery-[a-z0-9-]+$/.test(input.archiveBucketName) ||
    input.archiveBucketName.length > 63
  )
    issues.push("agency_archive_bucket");
  if (!/^MS_REALTY_RECOVERY_[A-Z0-9_]+_TOKEN$/.test(input.readTokenEnvironment ?? ""))
    issues.push("private_read_token_reference");
  if (
    !Number.isSafeInteger(input.proposedRetentionDays) ||
    input.proposedRetentionDays < 1 ||
    input.proposedRetentionDays > 3650 ||
    input.retentionApproved !== true
  )
    issues.push("approved_retention");
  if (input.agencyCustodyConfirmed !== true) issues.push("agency_account_custody");
  if (input.separateAdministrationConfirmed !== true)
    issues.push("separate_archive_administration");
  if (
    input.outsideAccountCopyConfirmed !== true ||
    typeof input.outsideAccountCopyReference !== "string" ||
    !input.outsideAccountCopyReference.trim()
  )
    issues.push("outside_account_encrypted_copy_custody");
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

export function prepareArchivePlan(input) {
  const issues = archiveInputIssues(input);
  const days = input.proposedRetentionDays;
  return {
    schemaVersion: 1,
    kind: "cloudflare_recovery_archive_plan",
    status: issues.length ? "blocked_inputs" : "prepared_unvalidated",
    applicationAccountId: input.applicationAccountId ?? null,
    archiveAccountId: input.archiveAccountId ?? null,
    jurisdiction: input.jurisdiction,
    bucket: input.archiveBucketName ?? null,
    proposedRetentionDays: days,
    proposedLockRules:
      Number.isSafeInteger(days) && days >= 1 && days <= 3650
        ? {
            rules: [
              {
                id: "approved-recovery-retention",
                enabled: true,
                prefix: "",
                condition: { type: "Age", maxAgeSeconds: days * 86400 },
              },
            ],
          }
        : null,
    missingInputs: issues,
    providerValidated: false,
    deploymentPerformed: false,
    outsideAccountCopyVerified: false,
    safetyTailVerified: false,
    recoveryPointSealed: false,
    recoveryQualified: false,
    productionQualified: false,
    retentionAdministratorRemovable: true,
    next: issues.length
      ? "Complete the agency custody, retention and separate review inputs"
      : "Observe configuration; separately prove writer denials, archived copy, safety tail and restore",
  };
}

export async function observeArchiveConfiguration(input, token, transport = fetch) {
  if (
    archiveInputIssues(input).length ||
    typeof token !== "string" ||
    !token ||
    /[\r\n]/.test(token)
  )
    throw Error("Archive validation inputs incomplete");
  const account = input.archiveAccountId;
  const root = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  const bucket = `/r2/buckets/${encodeURIComponent(input.archiveBucketName)}`;
  const get = async (path) => {
    const response = await transport(root + path, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { authorization: ["Bearer", token].join(" "), "cf-r2-jurisdiction": "eu" },
    });
    if (!response.ok || response.redirected) throw Error("Archive provider read failed");
    const body = await response.json();
    if (body.success !== true || !Array.isArray(body.errors) || body.errors.length)
      throw Error("Archive provider envelope failed");
    return body.result;
  };
  const identity = await get("");
  if (identity?.id !== account) throw Error("Archive account identity mismatch");
  const metadata = await get(bucket);
  if (metadata?.name !== input.archiveBucketName || metadata.jurisdiction !== "eu")
    throw Error("Archive bucket identity or EU jurisdiction not observed");
  const managed = await get(bucket + "/domains/managed");
  const custom = await get(bucket + "/domains/custom");
  if (
    managed?.enabled !== false ||
    !Array.isArray(custom?.domains) ||
    custom.domains.some((d) => d.enabled !== false)
  )
    throw Error("Private archive access not established");
  const locks = await get(bucket + "/lock");
  if (
    !Array.isArray(locks?.rules) ||
    !locks.rules.some(
      (rule) =>
        rule.enabled === true &&
        (rule.prefix ?? "") === "" &&
        rule.condition?.type === "Age" &&
        Number.isSafeInteger(rule.condition.maxAgeSeconds) &&
        rule.condition.maxAgeSeconds >= input.proposedRetentionDays * 86400,
    )
  )
    throw Error("Approved archive-wide retention not observed");
  return {
    account,
    bucket: metadata.name,
    jurisdiction: metadata.jurisdiction,
    privateAccess: true,
    retentionDaysAtLeast: input.proposedRetentionDays,
    writerPermissionDenialsVerified: false,
    outsideAccountCopyVerified: false,
    recoveryQualified: false,
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
    const input = JSON.parse(readFileSync(values.inputs, "utf8"));
    const report = prepareArchivePlan(input);
    if (values.validate && report.missingInputs.length === 0) {
      report.observation = await observeArchiveConfiguration(
        input,
        process.env[input.readTokenEnvironment],
      );
      report.status = "provider_configuration_observed_recovery_unqualified";
      report.providerValidated = true;
    }
    const output = resolve(values.out);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
    if (report.missingInputs.length) process.exitCode = 2;
  } catch {
    console.error(
      "Cloudflare recovery plan could not be validated. No resources were created or changed; check the private custody inputs and read-only archive credential.",
    );
    process.exitCode = 1;
  }
}
