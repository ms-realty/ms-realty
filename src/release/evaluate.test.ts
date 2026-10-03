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
import { signEvidence } from "./signature";

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
const operatorKeyId = "test-operator-1";

/** The committed policy with a test key trusted and every legacy replacement approved. */
function trustedPolicy(): GatePolicy {
  return {
    ...committedPolicy,
    trustedKeys: [
      {
        keyId: operatorKeyId,
        owner: "Test Operator",
        publicKey: operatorKey.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        evidenceTypes: committedPolicy.evidenceTypes.map((type) => type.id),
      },
    ],
    legacyGates: committedPolicy.legacyGates.map((legacy) =>
      legacy.disposition === "retained_obligation"
        ? legacy
        : {
            ...legacy,
            approval: {
              approvedBy: "Test Owner",
              approvedAt: minutesAgo(600),
              evidenceId: "R00-authority_decision_record",
            },
          },
    ),
  };
}

function completeManifest(policy: GatePolicy, evidenceIds: string[]): ReleaseManifest {
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
    evidenceIds,
    approvals: [
      { role: "operator", name: "Test Operator", approvedAt: minutesAgo(30), scope: "release" },
      { role: "reviewer", name: "Test Reviewer", approvedAt: minutesAgo(30), scope: "release" },
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
  return policy.gates.flatMap((gate) =>
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
        releaseSha: manifest.releaseSha,
        digests: Object.fromEntries(
          Object.entries(manifest.artifacts).filter(
            (entry): entry is [string, string] => entry[1] !== null,
          ),
        ),
        policyRevision: policy.policyRevision,
        dataDigest: null,
        observedAt: minutesAgo(10),
        source: "test-harness@1",
        reviewer: "Test Reviewer",
        assertions: (gate.requiredAssertions.length ? gate.requiredAssertions : ["check"]).map(
          (id) => ({ id, passed: true }),
        ),
        redactionStatus: "no_personal_data",
      };
      return type.signatureRequired
        ? signEvidence(artifact, operatorKey.privateKey, operatorKeyId)
        : artifact;
    }),
  );
}

function scenario() {
  const policy = trustedPolicy();
  const probe = completeManifest(policy, []);
  const evidence = completeEvidence(policy, probe);
  const manifest = completeManifest(
    policy,
    evidence.map((artifact) => artifact.id),
  );
  return { policy, manifest, evidence };
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
  return evaluate(input);
}

const gate = (report: ReadinessReport, id: string) => {
  const found = report.gates.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
};
const reasonsOf = (report: ReadinessReport, id: string) =>
  report.evidence.find((item) => item.id === id)?.reasons;

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
    for (const id of ["deployed_check", "provider_check", "monitoring_check", "rollback_drill"]) {
      expect(age(id)).toBe(1440);
    }
    expect(age("recovery_point")).toBe(60);
    const signed = committedPolicy.evidenceTypes
      .filter((t) => t.signatureRequired)
      .map((t) => t.id);
    expect(signed).toEqual(expect.arrayContaining(["recovery_point", "recovery_drill"]));
  });

  it("ships no trusted key and no owner approval: nothing is pre-cleared", () => {
    expect(committedPolicy.trustedKeys).toEqual([]);
    expect(committedPolicy.legacyGates.every((legacy) => legacy.approval === null)).toBe(true);
    expect(
      committedPolicy.legacyGates.find((legacy) => legacy.id === "live_services")?.disposition,
    ).toBe("replacement_proof");
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
    expect(reasonsOf(tampered, "R08-recovery_drill")).toEqual(["invalid_signature"]);

    const stranger = withArtifact("R08-recovery_drill", (a) =>
      signEvidence({ ...a, signature: undefined }, strangerKey.privateKey, "stranger"),
    );
    expect(reasonsOf(stranger, "R08-recovery_drill")).toEqual(["untrusted_key"]);
  });

  it("does not count evidence missing from the manifest, failing, or without a reviewer", () => {
    const input = scenario();
    input.manifest = {
      ...input.manifest,
      evidenceIds: input.manifest.evidenceIds.filter((id) => id !== "R02-human_review"),
    };
    expect(reasonsOf(evaluate(input), "R02-human_review")).toEqual(["not_in_manifest"]);
    const failing = withArtifact("R04-ci_test_report", (a) => ({
      ...a,
      assertions: [...a.assertions.slice(1), { id: "AT15", passed: false }],
    }));
    expect(reasonsOf(failing, "R04-ci_test_report")).toEqual(["assertion_failed"]);
    expect(gate(failing, "R04").blockers).toContain("missing_assertion:AT15");
    const anonymous = withArtifact("R02-human_review", (a) => ({ ...a, reviewer: null }));
    expect(reasonsOf(anonymous, "R02-human_review")).toEqual(["reviewer_missing"]);
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
    const report = evaluate(input);
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
    expect(report.release.gaps).toEqual(["/artifacts/gateway"]);
    expect(gate(report, "R10").blockers).toContain("manifest_incomplete");
    expect(reasonsOf(report, "R10-deployed_check")).toContain("artifact_unknown:gateway");
  });

  it("rejects an invalid manifest outright", () => {
    const { policy } = scenario();
    expect(() =>
      evaluateRelease({ policy, manifest: { releaseSha: "main" }, evidence: [], now }),
    ).toThrow(ReleaseInputError);
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
  });
});
