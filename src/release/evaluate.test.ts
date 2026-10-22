// Release gate evaluation (architecture §20.1, §20.3, §21.2, §21.3; D14; AT67).
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type EvidenceFile,
  evaluateRelease,
  ReleaseInputError,
  renderReadinessMarkdown,
} from "./evaluate";
import {
  acceptanceIdPattern,
  type EvidenceArtifact,
  type GatePolicy,
  gateIds,
  gatePolicySchema,
  type ReadinessReport,
  type ReleaseManifest,
} from "./schemas";
import {
  approvalEvidenceDigest,
  canonicalJson,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
  signEvidence,
} from "./signature";

const committedPolicy = gatePolicySchema.parse(
  JSON.parse(readFileSync("release/policy.json", "utf8")),
);
const now = new Date("2026-09-27T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const digest = (hex: string) => `sha256:${hex.repeat(64)}`;

const operatorKey = generateKeyPairSync("ed25519");
const strangerKey = generateKeyPairSync("ed25519");
const reviewerKey = generateKeyPairSync("ed25519");
const operatorKeyId = "test-operator-1";

/** The committed policy with a test key trusted and every legacy replacement approved. */
function trustedPolicy(): GatePolicy {
  return {
    ...structuredClone(committedPolicy),
    trustedKeys: [
      {
        keyId: operatorKeyId,
        owner: "Test Operator",
        publicKey: operatorKey.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        evidenceTypes: committedPolicy.evidenceTypes.map((type) => type.id),
      },
      {
        keyId: "test-reviewer-1",
        owner: "Test Reviewer",
        publicKey: reviewerKey.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        evidenceTypes: ["release_attestation"],
      },
    ],
    legacyGates: committedPolicy.legacyGates.map((legacy) =>
      legacy.disposition === "retained_obligation"
        ? legacy
        : {
            ...legacy,
            approval: {
              approvedBy: "Test Operator",
              approvedAt: minutesAgo(600),
              evidenceId: "R00-authority_decision_record",
            },
          },
    ),
  };
}

function completeManifest(policy: GatePolicy): ReleaseManifest {
  return {
    schemaVersion: 1,
    product: "ms-realty",
    specVersion: "architecture-1.0",
    releaseSha: sha,
    environment: "production",
    artifacts: {
      web: digest("1"),
      worker: digest("2"),
      migration: digest("3"),
      gateway: digest("4"),
    },
    revisions: { dependencies: digest("5"), model: "test-model", prompts: "p1", schemas: "s1" },
    providerAccounts: { hosting: "test-account" },
    database: { schemaDigest: digest("6"), lastMigration: "0003_test" },
    manifests: {
      domains: digest("7"),
      redirects: digest("8"),
      media: digest("9"),
      dataImport: digest("0"),
    },
    scope: { services: ["sale"], regions: ["bg"], locales: ["bg"], channels: ["website"] },
    policies: {
      policyRevision: policy.policyRevision,
      roles: "r1",
      retention: "t1",
      templates: "m1",
    },
    evidenceIds: [],
    evidenceDigests: {},
    approvals: [
      {
        role: "operator",
        name: "Test Operator",
        approvedAt: minutesAgo(10),
        scope: "release",
        evidenceId: "R10-release_attestation",
      },
      {
        role: "reviewer",
        name: "Test Reviewer",
        approvedAt: minutesAgo(10),
        scope: "release",
        evidenceId: "R10-release_attestation-reviewer",
      },
    ],
    recoveryPoint: { id: "rp-test-1", sealedAt: minutesAgo(10) },
    procedures: {
      cutover: { ref: "docs/runbooks/cutover.md", digest: digest("a") },
      rollback: { ref: "docs/runbooks/rollback.md", digest: digest("b") },
    },
  };
}

/** One fresh artifact per required evidence type of every gate, signed where required. */
function completeEvidence(policy: GatePolicy, manifest: ReleaseManifest): EvidenceArtifact[] {
  const artifacts = policy.gates.flatMap((gate) =>
    gate.requiredEvidence.map((typeId) => {
      const type = policy.evidenceTypes.find((candidate) => candidate.id === typeId);
      if (!type) throw new Error(typeId);
      const environment = type.environments.includes("release")
        ? manifest.environment
        : type.environments.includes(manifest.environment)
          ? manifest.environment
          : (type.environments[0] as EvidenceArtifact["environment"]);
      const artifact: EvidenceArtifact = {
        schemaVersion: 1,
        id: `${gate.id}-${typeId}`,
        type: typeId,
        gate: gate.id,
        environment,
        evidenceClass: type.classes[0] as EvidenceArtifact["evidenceClass"],
        releaseSha: manifest.releaseSha,
        digests: Object.fromEntries(
          Object.entries(manifest.artifacts).filter(
            (entry): entry is [string, string] => entry[1] !== null,
          ),
        ),
        policyRevision: policy.policyRevision,
        policyDigest: sha256Digest(canonicalJson(policy)),
        dataDigest: releaseContextDigest(manifest),
        attestedEvidenceDigest: null,
        observedAt: minutesAgo(10),
        expiresAt: null,
        source: "test-harness@1",
        reviewer: "Test Reviewer",
        assertions: [
          ...new Set([
            ...(gate.requiredAssertions.length ? gate.requiredAssertions : ["check"]),
            ...type.requiredAssertions,
            ...(gate.id === "R00"
              ? policy.legacyGates
                  .filter((legacy) => legacy.disposition !== "retained_obligation")
                  .map((legacy) => `legacy:${legacy.id}`)
              : []),
            ...(typeId === "release_attestation" ? ["approval:operator"] : []),
          ]),
        ].map((id) => ({ id, passed: true })),
        redactionStatus: "no_personal_data",
      };
      return type.signatureRequired
        ? signEvidence(artifact, operatorKey.privateKey, operatorKeyId)
        : artifact;
    }),
  );
  const attestation = artifacts.find((artifact) => artifact.type === "release_attestation");
  if (!attestation) throw new Error("attestation missing");
  artifacts.push(
    signEvidence(
      {
        ...attestation,
        id: "R10-release_attestation-reviewer",
        assertions: [
          ...attestation.assertions.filter((assertion) => assertion.id !== "approval:operator"),
          { id: "approval:reviewer", passed: true },
        ],
      },
      reviewerKey.privateKey,
      "test-reviewer-1",
    ),
  );
  return artifacts;
}

function sealTestEvidence(
  input: { manifest: ReleaseManifest; evidence: EvidenceArtifact[] },
  signApprovals = true,
) {
  const pin = () => {
    input.manifest.evidenceIds = input.evidence.map((artifact) => artifact.id);
    input.manifest.evidenceDigests = Object.fromEntries(
      input.evidence.map((artifact) => [artifact.id, evidenceDigest(artifact)]),
    );
  };
  pin();
  if (signApprovals) {
    const attestedEvidenceDigest = approvalEvidenceDigest(input.manifest);
    input.evidence = input.evidence.map((artifact) => {
      if (artifact.type !== "release_attestation") return artifact;
      const isReviewer = artifact.id.endsWith("-reviewer");
      return signEvidence(
        { ...artifact, attestedEvidenceDigest },
        isReviewer ? reviewerKey.privateKey : operatorKey.privateKey,
        isReviewer ? "test-reviewer-1" : operatorKeyId,
      );
    });
    pin();
  }
}

function scenario() {
  const policy = trustedPolicy();
  const manifest = completeManifest(policy);
  const input = { policy, manifest, evidence: completeEvidence(policy, manifest) };
  sealTestEvidence(input);
  return input;
}

/** Recollects synthetic test artifacts after deliberately changing candidate/policy inputs. */
function recollect(input: ReturnType<typeof scenario>) {
  input.evidence = completeEvidence(input.policy, input.manifest);
  sealTestEvidence(input);
  return input;
}

const files = (artifacts: EvidenceArtifact[]): EvidenceFile[] =>
  artifacts.map((artifact) => ({ file: `${artifact.id}.json`, content: JSON.stringify(artifact) }));

function evaluate(input: {
  policy: GatePolicy;
  manifest: ReleaseManifest;
  evidence: EvidenceArtifact[];
}): ReadinessReport {
  return evaluateRelease({
    policy: input.policy,
    manifest: input.manifest,
    evidence: files(input.evidence),
    now,
  });
}

/** Replaces one artifact (re-signed when it was signed) and re-evaluates. */
function withArtifact(id: string, change: (artifact: EvidenceArtifact) => EvidenceArtifact) {
  const input = scenario();
  input.evidence = input.evidence.map((artifact) => {
    if (artifact.id !== id) return artifact;
    const changed = change(artifact);
    return artifact.signature && changed.signature === artifact.signature
      ? signEvidence({ ...changed, signature: undefined }, operatorKey.privateKey, operatorKeyId)
      : changed;
  });
  sealTestEvidence(input, !id.startsWith("R10-release_attestation"));
  return evaluate(input);
}

const gate = (report: ReadinessReport, id: string) => {
  const found = report.gates.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
};
const reasonsOf = (report: ReadinessReport, id: string) =>
  report.evidence.find((item) => item.id === id)?.reasons;
const required = <T>(value: T | null | undefined): T => {
  if (value == null) throw new Error("Missing test fixture");
  return value;
};

// Concrete retained obligations: a signed generic report must not clear any of these checks.
const retainedProofChecks = [
  ["R00", "authority_decision_record", "authority:successor_provisioning_equivalence"],
  ["R00", "authority_decision_record", "authority:successor_identity_equivalence"],
  ["R00", "authority_decision_record", "authority:evidence_owners"],
  ["R00", "authority_decision_record", "authority:broker_review_owners"],
  ["R01", "successor_provisioning_report", "provisioning:legacy_contract_equivalence"],
  ["R01", "successor_provisioning_report", "provisioning:checks_and_owners"],
  ["R01", "successor_provisioning_report", "provisioning:cloudflare_gateway_container"],
  ["R01", "successor_provisioning_report", "provisioning:immutable_web_worker_migration_image"],
  ["R01", "successor_provisioning_report", "provisioning:postgres_16_14"],
  ["R01", "successor_provisioning_report", "provisioning:private_tls_path"],
  ["R01", "first_party_runtime_report", "runtime:staff_client_identity"],
  ["R01", "first_party_runtime_report", "runtime:cms_listing_mutations"],
  ["R01", "first_party_runtime_report", "runtime:deny_revocation"],
  ["R01", "first_party_runtime_report", "runtime:restart_recovery"],
  ["R02", "listing_review_report", "listing:complete_human_csv"],
  ["R02", "listing_review_report", "listing:source_approval_separate"],
  ["R02", "listing_review_report", "listing:broker_owners_assigned"],
  ["R02", "listing_review_report", "listing:broker_decisions_complete"],
  ["R02", "listing_review_report", "listing:translation_approval_before_indexing"],
  ["R02", "listing_review_report", "warning_review:structured_data.missing_area"],
  ["R02", "listing_review_report", "warning_review:structured_data.missing_bedrooms"],
  ["R02", "listing_review_report", "warning_review:structured_data.missing_public_images"],
  ["R02", "listing_review_report", "warning_review:listing_quality.missing_area"],
  ["R02", "listing_review_report", "warning_review:listing_quality.thin_public_gallery"],
  ["R03", "postgres_search_sync", "search:authoritative_postgres_target"],
  ["R03", "postgres_search_sync", "search:sync_projection"],
  ["R03", "postgres_search_sync", "search:deployed_path"],
  ["R03", "postgres_search_sync", "search:failure_recovery"],
  ["R03", "postgres_search_query", "search:authorized_query"],
  ["R03", "postgres_search_query", "search:deny_query"],
  ["R03", "postgres_search_query", "search:failure_recovery"],
  ["R03", "deployed_check", "deployed:three_hosts"],
  ["R03", "deployed_check", "deployed:browser_api_journeys"],
  ["R06", "hermes_draft_worker", "assistance:authenticated_worker_provider"],
  ["R06", "hermes_draft_worker", "assistance:budget_policy"],
  ["R06", "hermes_draft_worker", "assistance:approved_sources"],
  ["R06", "hermes_draft_worker", "assistance:publish_send_fact_index_denied"],
  ["R07", "migration_rehearsal_report", "migration:originals_rights_transforms_access"],
  ["R08", "monitoring_check", "monitoring:privacy_events"],
  ["R08", "monitoring_check", "monitoring:analytics_export"],
  ["R08", "monitoring_check", "monitoring:public_https_endpoint"],
  ["R08", "monitoring_check", "monitoring:named_responders"],
  ["R08", "rollback_drill", "rollback:automated_policy"],
  ["R08", "rollback_drill", "rollback:passing_canary"],
  ["R08", "rollback_drill", "rollback:isolated_drill"],
  ["R08", "rollback_drill", "rollback:queue_intake_fallback"],
  ["R08", "rollback_drill", "rollback:previous_origin_until_crawl_stable"],
  ["R08", "rollback_drill", "rollback:disable_redirects_before_routes"],
  ["R08", "rollback_drill", "rollback:previous_sitemap_robots"],
  ["R08", "rollback_drill", "rollback:failed_url_review_owners"],
  ["R08", "recovery_point", "recovery:encrypted"],
  ["R08", "recovery_drill", "recovery:checksums"],
  ["R08", "recovery_drill", "recovery:rollback_verified"],
  ["R10", "release_attestation", "release:evidence_bundle_captured"],
  ["R10", "release_attestation", "release:evidence_bundle_verified"],
  ["R10", "release_attestation", "release:protected_staging_parity"],
] as const;

describe("gate policy (§20.3, §21.2)", () => {
  it("lists R00–R12 and requires every acceptance scenario AT01–AT68 in some gate", () => {
    expect(committedPolicy.gates.map((g) => g.id)).toEqual([...gateIds]);
    const required = new Set(committedPolicy.gates.flatMap((g) => g.requiredAssertions));
    for (let n = 1; n <= 68; n += 1) {
      const id = `AT${String(n).padStart(2, "0")}`;
      expect(acceptanceIdPattern.test(id)).toBe(true);
      expect(required.has(id), id).toBe(true);
    }
  });

  it("keeps deployed-path freshness at 24 h and the recovery point at 60 min (§17.3, §21.3)", () => {
    const age = (id: string) =>
      committedPolicy.evidenceTypes.find((t) => t.id === id)?.maxAgeMinutes;
    for (const id of [
      "deployed_check",
      "provider_check",
      "monitoring_check",
      "rollback_drill",
      "successor_provisioning_report",
      "first_party_runtime_report",
      "postgres_search_sync",
      "postgres_search_query",
      "hermes_draft_worker",
    ]) {
      expect(age(id)).toBe(1440);
    }
    expect(
      committedPolicy.evidenceTypes.find((type) => type.id === "monitoring_check")?.environments,
    ).toEqual(["production"]);
    expect(age("recovery_point")).toBe(60);
    const signed = committedPolicy.evidenceTypes
      .filter((t) => t.signatureRequired)
      .map((t) => t.id);
    expect(signed).toEqual(expect.arrayContaining(["recovery_point", "recovery_drill"]));
  });

  it("ships no trusted key or signed approval: mapping chat approval clears no gate", () => {
    expect(committedPolicy.trustedKeys).toEqual([]);
    expect(committedPolicy.legacyGates.every((legacy) => legacy.approval === null)).toBe(true);
    expect(
      committedPolicy.legacyGates.find((legacy) => legacy.id === "live_services")?.disposition,
    ).toBe("replacement_proof");
  });

  it("requires each retained proof on its own signed evidence type and gate", () => {
    for (const [gateId, typeId, assertionId] of retainedProofChecks) {
      const type = required(committedPolicy.evidenceTypes.find((type) => type.id === typeId));
      expect(type.signatureRequired, typeId).toBe(true);
      expect(type.requiredAssertions, typeId).toContain(assertionId);
      expect(
        required(committedPolicy.gates.find((gate) => gate.id === gateId)).requiredEvidence,
        gateId,
      ).toContain(typeId);
    }
  });

  it("rejects a policy whose gates reference an unknown evidence type", () => {
    const broken = structuredClone(committedPolicy);
    broken.gates[1]?.requiredEvidence.push("made_up");
    expect(() => evaluateRelease({ policy: broken, manifest: {}, evidence: [], now })).toThrow(
      ReleaseInputError,
    );
  });
});

describe("release evaluation", () => {
  it.each(retainedProofChecks)(
    "%s rejects signed %s proof missing %s",
    (gateId, typeId, assertionId) => {
      const id = `${gateId}-${typeId}`;
      const report = withArtifact(id, (artifact) => ({
        ...artifact,
        assertions: artifact.assertions.filter((assertion) => assertion.id !== assertionId),
      }));
      expect(reasonsOf(report, id)).toContain(`missing_required_assertion:${assertionId}`);
      expect(gate(report, gateId).blockers).toContain(
        typeId === "release_attestation" ? "manifest_incomplete" : `missing_evidence:${typeId}`,
      );
      if (typeId === "release_attestation") {
        expect(report.release.gaps).toContain("/approvals/operator/unverified");
      }
      expect(report.verdict).toBe("blocked");
    },
  );

  it.each([
    ["R01", "successor_provisioning_report"],
    ["R01", "first_party_runtime_report"],
    ["R03", "postgres_search_sync"],
    ["R03", "postgres_search_query"],
    ["R06", "hermes_draft_worker"],
  ])("%s rejects a CI fixture offered as the live %s report", (gateId, typeId) => {
    const id = `${gateId}-${typeId}`;
    const report = withArtifact(id, (artifact) => ({
      ...artifact,
      evidenceClass: "test",
      environment: "ci",
    }));
    expect(reasonsOf(report, id)).toContain("wrong_evidence_class");
    expect(reasonsOf(report, id)).toContain("wrong_environment");
    expect(gate(report, gateId).blockers).toContain(`missing_evidence:${typeId}`);
  });

  it("rejects signed staging monitoring as retained production monitoring proof", () => {
    const input = scenario();
    input.manifest.environment = "staging";
    recollect(input);
    input.evidence = input.evidence.map((artifact) =>
      artifact.id === "R08-monitoring_check"
        ? signEvidence(
            { ...artifact, environment: "staging" },
            operatorKey.privateKey,
            operatorKeyId,
          )
        : artifact,
    );
    sealTestEvidence(input);
    const report = evaluate(input);
    expect(reasonsOf(report, "R08-monitoring_check")).toContain("wrong_environment");
    expect(gate(report, "R08").blockers).toContain("missing_evidence:monitoring_check");
  });

  it("cannot use the source audit or CI assertions as the complete human broker review", () => {
    const input = scenario();
    const review = required(
      input.evidence.find((artifact) => artifact.id === "R02-listing_review_report"),
    );
    input.evidence = input.evidence.map((artifact) => {
      if (artifact.id === review.id) {
        return signEvidence(
          {
            ...artifact,
            source: "manual-source-audit-non-approval@1",
            assertions: [{ id: "review:scope_complete", passed: true }],
          },
          operatorKey.privateKey,
          operatorKeyId,
        );
      }
      if (artifact.id === "R02-ci_test_report") {
        return {
          ...artifact,
          assertions: [
            ...new Map(
              [...artifact.assertions, ...review.assertions].map((assertion) => [
                assertion.id,
                assertion,
              ]),
            ).values(),
          ],
        };
      }
      return artifact;
    });
    sealTestEvidence(input);
    const report = evaluate(input);
    expect(reasonsOf(report, "R02-ci_test_report")).toEqual([]);
    expect(reasonsOf(report, review.id)).toContain(
      "missing_required_assertion:listing:broker_decisions_complete",
    );
    expect(gate(report, "R02").blockers).toContain("missing_evidence:listing_review_report");
    expect(report.verdict).toBe("blocked");
  });

  it("AT67 blocks every gate when there is no evidence", () => {
    const { policy, manifest } = scenario();
    const report = evaluate({ policy, manifest, evidence: [] });
    expect(report.verdict).toBe("blocked");
    for (const item of report.gates) {
      expect(item.status, item.id).toBe("blocked");
      expect(
        item.blockers.some((b) => b.startsWith("missing_evidence:")),
        item.id,
      ).toBe(true);
    }
  });

  it("passes every gate only with complete, fresh, signed evidence for this release", () => {
    const report = evaluate(scenario());
    expect(report.gates.filter((g) => g.status !== "pass")).toEqual([]);
    expect(report.verdict).toBe("pass");
    expect(report.legacyGates.every((legacy) => legacy.approved)).toBe(true);
  });

  it("does not count evidence for another release SHA", () => {
    const report = withArtifact("R03-deployed_check", (a) => ({ ...a, releaseSha: otherSha }));
    expect(reasonsOf(report, "R03-deployed_check")).toContain("wrong_release");
    expect(gate(report, "R03").blockers).toContain("missing_evidence:deployed_check");
    expect(report.verdict).toBe("blocked");
  });

  it("does not count evidence for other image digests, policy or environment", () => {
    const image = withArtifact("R10-deployed_check", (a) => ({
      ...a,
      digests: { ...a.digests, web: digest("f") },
    }));
    expect(reasonsOf(image, "R10-deployed_check")).toContain("artifact_mismatch:web");
    const policy = withArtifact("R04-ci_test_report", (a) => ({ ...a, policyRevision: "old" }));
    expect(reasonsOf(policy, "R04-ci_test_report")).toContain("wrong_policy");
    const environment = withArtifact("R04-ci_test_report", (a) => ({ ...a, environment: "local" }));
    expect(reasonsOf(environment, "R04-ci_test_report")).toContain("wrong_environment");
    expect(gate(environment, "R04").status).toBe("blocked");
  });

  it("blocks on stale deployed-path evidence (24 h) and an old recovery point (60 min)", () => {
    const deployed = withArtifact("R10-deployed_check", (a) => ({
      ...a,
      observedAt: minutesAgo(24 * 60 + 1),
    }));
    expect(reasonsOf(deployed, "R10-deployed_check")).toEqual(["stale"]);
    expect(gate(deployed, "R10").status).toBe("blocked");
    const recovery = withArtifact("R08-recovery_point", (a) => ({
      ...a,
      observedAt: minutesAgo(61),
    }));
    expect(reasonsOf(recovery, "R08-recovery_point")).toEqual(["stale"]);
    expect(gate(recovery, "R08").status).toBe("blocked");
    // Blocking R08 blocks the attestation that depends on it.
    expect(gate(recovery, "R10").blockers).toContain("dependency_blocked:R08");
  });

  it("blocks unsigned, tampered or untrusted-key evidence where a signature is required", () => {
    const unsigned = withArtifact("R08-recovery_drill", (a) => ({ ...a, signature: undefined }));
    expect(reasonsOf(unsigned, "R08-recovery_drill")).toEqual(["unsigned"]);
    expect(gate(unsigned, "R08").status).toBe("blocked");

    const input = scenario();
    input.evidence = input.evidence.map((a) =>
      a.id === "R08-recovery_drill" ? { ...a, reviewer: "Someone Else" } : a,
    );
    const tampered = evaluate(input);
    expect(reasonsOf(tampered, "R08-recovery_drill")).toEqual([
      "evidence_digest_mismatch",
      "invalid_signature",
    ]);

    const stranger = withArtifact("R08-recovery_drill", (a) =>
      signEvidence({ ...a, signature: undefined }, strangerKey.privateKey, "stranger"),
    );
    expect(reasonsOf(stranger, "R08-recovery_drill")).toEqual(["untrusted_key"]);
  });

  it("does not count evidence missing from the manifest, failing, or without a reviewer", () => {
    const input = scenario();
    input.manifest = {
      ...input.manifest,
      evidenceIds: input.manifest.evidenceIds.filter((id) => id !== "R02-listing_review_report"),
      evidenceDigests: Object.fromEntries(
        Object.entries(input.manifest.evidenceDigests).filter(
          ([id]) => id !== "R02-listing_review_report",
        ),
      ),
    };
    expect(reasonsOf(evaluate(input), "R02-listing_review_report")).toEqual(["not_in_manifest"]);
    const failing = withArtifact("R04-ci_test_report", (a) => ({
      ...a,
      assertions: [...a.assertions.slice(1), { id: "AT15", passed: false }],
    }));
    expect(reasonsOf(failing, "R04-ci_test_report")).toEqual(["assertion_failed"]);
    expect(gate(failing, "R04").blockers).toContain("missing_assertion:AT15");
    const anonymous = withArtifact("R02-listing_review_report", (a) => ({ ...a, reviewer: null }));
    expect(reasonsOf(anonymous, "R02-listing_review_report")).toEqual(["reviewer_missing"]);
  });

  it("reports unreadable and duplicate evidence without counting it", () => {
    const { policy, manifest, evidence } = scenario();
    const report = evaluateRelease({
      policy,
      manifest,
      evidence: [
        ...files(evidence),
        { file: "broken.json", content: "{" },
        { file: "odd.json", content: JSON.stringify({ id: "x" }) },
        { file: "copy.json", content: JSON.stringify(evidence[0]) },
      ],
      now,
    });
    const byFile = (file: string) => report.evidence.find((item) => item.file === file);
    expect(byFile("broken.json")?.reasons).toEqual(["invalid_json"]);
    expect(byFile("odd.json")?.reasons).toEqual(["invalid_schema"]);
    expect(byFile("copy.json")?.reasons).toEqual(["duplicate_id"]);
    expect(gate(report, "R00").status).toBe("blocked");
  });

  it("keeps R00 blocked while a legacy replacement lacks owner approval", () => {
    const input = scenario();
    input.policy = {
      ...input.policy,
      legacyGates: input.policy.legacyGates.map((legacy) =>
        legacy.id === "live_services" ? { ...legacy, approval: null } : legacy,
      ),
    };
    const report = evaluate(recollect(input));
    expect(gate(report, "R00").blockers).toEqual(["legacy_mapping_unapproved:live_services"]);
    expect(report.legacyGates.find((legacy) => legacy.id === "live_services")?.approved).toBe(
      false,
    );
  });

  it("blocks the attestation while any manifest field is unknown", () => {
    const input = scenario();
    input.manifest = {
      ...input.manifest,
      artifacts: { ...input.manifest.artifacts, gateway: null },
    };
    const report = evaluate(input);
    expect(report.release.gaps).toContain("/artifacts/gateway");
    expect(gate(report, "R10").blockers).toContain("manifest_incomplete");
    expect(reasonsOf(report, "R10-deployed_check")).toContain("artifact_unknown:gateway");
  });

  it("rejects an invalid manifest outright", () => {
    const { policy } = scenario();
    expect(() =>
      evaluateRelease({ policy, manifest: { releaseSha: "main" }, evidence: [], now }),
    ).toThrow(ReleaseInputError);
  });

  it("binds unsigned CI evidence by its canonical hash and rejects changed payloads", () => {
    const input = scenario();
    const artifact = input.evidence.find((item) => item.id === "R01-ci_test_report");
    if (!artifact) throw new Error("fixture missing");
    artifact.source = "different-run@2";
    expect(reasonsOf(evaluate(input), artifact.id)).toEqual(["evidence_digest_mismatch"]);
  });

  it("requires new signed release decisions when the pinned evidence set changes", () => {
    const input = scenario();
    required(input.evidence.find((artifact) => artifact.id === "R01-ci_test_report")).source =
      "new-ci-run@2";
    sealTestEvidence(input, false);
    const report = evaluate(input);
    expect(reasonsOf(report, "R01-ci_test_report")).toEqual([]);
    expect(report.release.gaps).toContain("/approvals/operator/unverified");
    expect(report.release.gaps).toContain("/approvals/reviewer/unverified");
    expect(gate(report, "R10").status).toBe("blocked");
  });

  it("invalidates evidence when data, provider configuration or policy contents change", () => {
    const input = scenario();
    input.manifest.providerAccounts.hosting = "another-account";
    expect(reasonsOf(evaluate(input), "R03-deployed_check")).toContain("data_digest_mismatch");
    const changedPolicy = scenario();
    required(changedPolicy.policy.evidenceTypes[0]).description =
      "Changed requirements under the old revision";
    expect(reasonsOf(evaluate(changedPolicy), "R00-authority_decision_record")).toContain(
      "policy_digest_mismatch",
    );
  });

  it("never accepts local fixture environments or a fixture labelled as a live check", () => {
    const input = scenario();
    input.manifest.environment = "local";
    const report = evaluate(recollect(input));
    expect(report.gates.every((item) => item.blockers.includes("non_deployed_release"))).toBe(true);
    const fixture = withArtifact("R03-deployed_check", (artifact) => ({
      ...artifact,
      evidenceClass: "test",
    }));
    expect(reasonsOf(fixture, "R03-deployed_check")).toContain("wrong_evidence_class");
    expect(fixture.verdict).toBe("blocked");
    const candidate = scenario();
    candidate.manifest.environment = "staging";
    expect(gate(evaluate(recollect(candidate)), "R12").blockers).toContain("production_required");
  });

  it("a signed placeholder live report cannot borrow assertions from CI", () => {
    const report = withArtifact("R03-deployed_check", (artifact) => ({
      ...artifact,
      assertions: [{ id: "check", passed: true }],
    }));
    expect(reasonsOf(report, "R03-deployed_check")).toContain(
      "missing_required_assertion:deployed:intake",
    );
    expect(gate(report, "R03").blockers).toContain("missing_evidence:deployed_check");
  });

  it("expires at the earliest evidence or recovery-point expiry and refuses the boundary", () => {
    const report = evaluate(scenario());
    expect(report.expiresAt).toBe("2026-09-27T12:50:00.000Z");
    const expired = withArtifact("R03-deployed_check", (artifact) => ({
      ...artifact,
      expiresAt: now.toISOString(),
    }));
    expect(reasonsOf(expired, "R03-deployed_check")).toContain("expired");
    const stale = withArtifact("R10-recovery_point", (artifact) => ({
      ...artifact,
      observedAt: minutesAgo(60),
    }));
    expect(reasonsOf(stale, "R10-recovery_point")).toContain("stale");
  });

  it("a fresh observation cannot refresh an old sealed recovery point", () => {
    const input = scenario();
    required(input.manifest.recoveryPoint).sealedAt = minutesAgo(61);
    const report = evaluate(recollect(input));
    expect(report.release.gaps).toContain("/recoveryPoint/stale");
    expect(gate(report, "R10").status).toBe("blocked");
  });

  it("requires independent signed approvals and rejects future or mismatched approvers", () => {
    for (const change of [
      (input: ReturnType<typeof scenario>) => {
        required(input.manifest.approvals[0]).name = "Forged Operator";
      },
      (input: ReturnType<typeof scenario>) => {
        required(input.manifest.approvals[0]).approvedAt = minutesAgo(-1);
      },
      (input: ReturnType<typeof scenario>) => {
        required(input.manifest.approvals[1]).evidenceId = required(
          input.manifest.approvals[0],
        ).evidenceId;
      },
    ]) {
      const input = scenario();
      change(input);
      const report = evaluate(input);
      expect(gate(report, "R10").blockers).toContain("manifest_incomplete");
    }
    const policyApproval = scenario();
    const replacement = required(
      policyApproval.policy.legacyGates.find((legacy) => legacy.id === "live_services"),
    );
    required(replacement.approval).approvedBy = "Forged Owner";
    expect(gate(evaluate(recollect(policyApproval)), "R00").blockers).toContain(
      "legacy_mapping_unapproved:live_services",
    );
  });

  it("fails closed on future observations, unredacted evidence and duplicate assertions", () => {
    const future = withArtifact("R03-deployed_check", (artifact) => ({
      ...artifact,
      observedAt: minutesAgo(-6),
    }));
    expect(reasonsOf(future, "R03-deployed_check")).toContain("observed_in_future");
    const unredacted = withArtifact("R02-listing_review_report", (artifact) => ({
      ...artifact,
      redactionStatus: "unredacted_restricted",
    }));
    expect(reasonsOf(unredacted, "R02-listing_review_report")).toContain("redaction_required");
    const duplicate = withArtifact("R01-ci_test_report", (artifact) => ({
      ...artifact,
      assertions: [...artifact.assertions, required(artifact.assertions[0])],
    }));
    expect(
      duplicate.evidence.find((item) => item.file === "R01-ci_test_report.json")?.reasons,
    ).toEqual(["invalid_schema"]);
  });

  it("rejects ambiguous ids, weakened dependencies and unknown evaluation times", () => {
    const input = scenario();
    input.policy.trustedKeys.push(required(input.policy.trustedKeys[0]));
    expect(() => evaluate(input)).toThrow("duplicate key id");
    const policy = scenario();
    required(policy.policy.gates[10]).dependsOn = ["R00"];
    expect(() => evaluate(policy)).toThrow("must require R01");
    const valid = scenario();
    expect(() =>
      evaluateRelease({ ...valid, evidence: files(valid.evidence), now: new Date(Number.NaN) }),
    ).toThrow("Invalid evaluation time");
  });
});

describe("AT67 readiness views", () => {
  /** Reads the verdict, snapshot and per-gate status back out of the markdown view. */
  function parseMarkdown(markdown: string) {
    const verdict = /^- Verdict: \*\*(\w+)\*\*$/m.exec(markdown)?.[1];
    const snapshot = /^- Snapshot: `([^`]+)`$/m.exec(markdown)?.[1];
    const release = /^- Release: `([0-9a-f]{40})`/m.exec(markdown)?.[1];
    const gates = Object.fromEntries(
      [...markdown.matchAll(/^\| (R\d\d) \| [^|]+ \| \*\*(\w+)\*\* \|/gm)].map((m) => [m[1], m[2]]),
    );
    return { verdict, snapshot, release, gates };
  }

  for (const [name, build] of [
    ["blocked", () => evaluate({ ...scenario(), evidence: [] })],
    ["passing", () => evaluate(scenario())],
  ] as const) {
    it(`JSON and markdown agree on one release, snapshot and verdict (${name})`, () => {
      const report = build();
      const view = parseMarkdown(renderReadinessMarkdown(report));
      expect(view.verdict).toBe(report.verdict);
      expect(view.snapshot).toBe(report.snapshotId);
      expect(view.release).toBe(report.release.releaseSha);
      expect(view.gates).toEqual(Object.fromEntries(report.gates.map((g) => [g.id, g.status])));
    });
  }

  it("gives a different snapshot for different evidence or time", () => {
    const input = scenario();
    const a = evaluate(input);
    expect(evaluate(input).snapshotId).toBe(a.snapshotId);
    expect(evaluate({ ...input, evidence: input.evidence.slice(1) }).snapshotId).not.toBe(
      a.snapshotId,
    );
    expect(
      evaluateRelease({
        ...input,
        evidence: files(input.evidence),
        now: new Date(now.getTime() + 60_000),
      }).snapshotId,
    ).not.toBe(a.snapshotId);
  });
});
