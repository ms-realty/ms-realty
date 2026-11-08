// Disposable synthetic custody, observations and owner signatures. No live provider is called.
import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundleLimits, parseBundleJson } from "./bundle";
import { bundleRoot, inventoryBundleTree, readBundleFile } from "./bundle-files";
import {
  bundlePrerequisites,
  captureEvidenceBundle,
  verifyEvidenceBundle,
} from "./bundle-operations";
import { evaluateRelease } from "./evaluate";
// @ts-expect-error Shared synthetic fixture keys only.
import { bundleSigningFixture, executionScenario } from "./execution-fixtures.mjs";
import {
  type AdmittedReleaseTrust,
  type EvidenceArtifact,
  type GatePolicy,
  type ReleaseManifest,
  singleOperatorReviewAssertions,
} from "./schemas";
import {
  canonicalJson,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
  signEvidence,
} from "./signature";

const directories: string[] = [];
const hash = (value: unknown) => sha256Digest(canonicalJson(value));
const temp = () => {
  const path = mkdtempSync(join(realpathSync(tmpdir()), "msr-bundle-synthetic-"));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(now = new Date()) {
  const f = executionScenario();
  const keys = bundleSigningFixture();
  const directory = temp();
  const root = join(directory, "input");
  mkdirSync(root);
  const policy: GatePolicy = structuredClone(f.candidate.policy);
  const manifest: ReleaseManifest = structuredClone(f.candidate.manifest);
  const observedAt = new Date(now.getTime() - 60_000).toISOString();
  for (const mapping of policy.legacyGates)
    if (mapping.approval) mapping.approval.approvedAt = observedAt;
  manifest.approvals = [];
  if (manifest.recoveryPoint) manifest.recoveryPoint.sealedAt = observedAt;
  const support: Record<string, string> = {
    "fixture/amendments": "synthetic fixture bytes",
    "fixture/limitations": "synthetic fixture bytes",
    "fixture/phasePermissions": f.preparation.phasePermissions,
    "fixture/cutover": f.preparation.procedures.cutover,
    "fixture/rollback": f.preparation.procedures.rollback,
    "fixture/raw-receipt": "complete synthetic raw receipt; not a live measurement",
  };
  const artifacts: EvidenceArtifact[] = (f.candidate.evidence as EvidenceArtifact[])
    .filter((item) => item.type !== "release_attestation")
    .map((item, i) =>
      keys.signArtifact({
        ...item,
        observedAt,
        expiresAt: null,
        dataDigest: releaseContextDigest(manifest),
        policyDigest: hash(policy),
        ...(i === 1
          ? {
              supportingFiles: [
                {
                  ref: "fixture/raw-receipt",
                  digest: sha256Digest(support["fixture/raw-receipt"] ?? ""),
                },
              ],
            }
          : {}),
      }),
    );
  manifest.evidenceIds = artifacts.map((item) => item.id);
  manifest.evidenceDigests = Object.fromEntries(
    artifacts.map((item) => [item.id, evidenceDigest(item)]),
  );
  const trust: AdmittedReleaseTrust = { ...f.admission.release, policyDigest: hash(policy) };
  const files = [
    { path: "manifest.json", role: "manifest", content: canonicalJson(manifest) },
    { path: "policy.json", role: "policy", content: canonicalJson(policy) },
    ...artifacts.map((item) => ({
      path: `evidence/${item.id}.json`,
      role: "evidence",
      content: canonicalJson(item),
    })),
    ...Object.entries(support).map(([ref, content], i) => ({
      path: `supporting/ref-${i}.txt`,
      role: "supporting",
      content,
      references: [ref],
    })),
  ];
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  const source = { schemaVersion: 1, files: files.map(({ content: _content, ...file }) => file) };
  const inventory = join(directory, "inventory.json");
  writeFileSync(inventory, canonicalJson(source));
  const signing = () => ({ keyId: keys.machineKeyId, privateKey: keys.machine.privateKey });
  const candidate = {
    policy,
    manifest,
    evidence: files
      .filter((item) => item.role === "evidence")
      .map((item) => ({ file: item.path, content: item.content })),
  };
  const capture = (out = join(directory, "captured")) =>
    captureEvidenceBundle({ root, source, out, trust, signing, now });
  const verify = (
    inputRoot = join(directory, "captured"),
    out = join(directory, "verified"),
    at = now,
    approval?: string,
  ) =>
    verifyEvidenceBundle({
      root: inputRoot,
      out,
      trust,
      signing,
      now: at,
      ...(approval === undefined ? {} : { approval }),
    });
  const ownerReview = (
    verified = join(directory, "verified"),
    at = new Date(now.getTime() + 1),
  ) => {
    const digests = Object.fromEntries(
      [
        ["bundleIndex", "index.json"],
        ["bundleCapture", "capture.json"],
        ["bundleVerification", "verification.json"],
      ].map(([name, path]) => [name, sha256Digest(readFileSync(join(verified, path ?? "")))]),
    );
    return keys.signArtifact({
      ...f.candidate.evidence.find((item: EvidenceArtifact) => item.type === "release_attestation"),
      id: "synthetic-current-owner-review",
      observedAt: at.toISOString(),
      expiresAt: null,
      dataDigest: releaseContextDigest(manifest),
      policyDigest: hash(policy),
      attestedEvidenceDigest: hash(manifest.evidenceDigests),
      digests: { ...manifest.artifacts, ...digests },
      assertions: [...singleOperatorReviewAssertions, "AT67"].map((id) => ({ id, passed: true })),
    }) as EvidenceArtifact;
  };
  const keyFile = join(directory, "synthetic-signer.pem");
  const marker = "SYNTHETIC_SIGNER_SECRET_MUST_NEVER_BE_COPIED";
  writeFileSync(
    keyFile,
    `${keys.machine.privateKey.export({ format: "pem", type: "pkcs8" })}\n# ${marker}\n`,
    { mode: 0o600 },
  );
  const environment = {
    ...process.env,
    MS_REALTY_EXECUTION_ADMISSION: canonicalJson({
      schemaVersion: 2,
      mode: "single_operator_owner_review",
      leaseAuthority: "watchdog_durable_state",
      release: trust,
      keys: { owner: f.admission.keys.owner, verifier: f.admission.keys.verifier },
    }),
    LAUNCH_OWNER_PUBLIC_KEY: f.production.bundle.trustedKeys.owner,
    LAUNCH_CONTROLLER_PUBLIC_KEY: f.production.bundle.trustedKeys.controller,
    MS_REALTY_BUNDLE_SIGNING_KEY_PATH: keyFile,
    MS_REALTY_BUNDLE_SIGNING_KEY_ID: keys.machineKeyId,
  };
  const cli = (
    operation: "capture" | "verify",
    args: string[],
    env: NodeJS.ProcessEnv = environment,
  ) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", `scripts/release-evidence-${operation}.mjs`, ...args],
      { encoding: "utf8", env },
    );
  return {
    directory,
    root,
    source,
    inventory,
    policy,
    manifest,
    artifacts,
    candidate,
    trust,
    now,
    signing,
    capture,
    verify,
    ownerReview,
    keys,
    cli,
    environment,
    keyFile,
    marker,
  };
}

describe("R10 local bundle capture and separate verification", () => {
  it("copies complete payloads, verifies in another process, and exports only a genuinely signed synthetic owner candidate", () => {
    const f = fixture();
    const captured = join(f.directory, "captured"),
      verified = join(f.directory, "verified"),
      final = join(f.directory, "final");
    const a = f.cli("capture", ["--root", f.root, "--inventory", f.inventory, "--out", captured]);
    expect(a.status, a.stderr).toBe(0);
    expect(JSON.parse(a.stdout)).toMatchObject({
      r00ToR10: "blocked",
      approval: "missing",
      overallRelease: "blocked",
      execution: "unavailable",
    });
    const b = f.cli("verify", ["--bundle", captured, "--out", verified]);
    expect(b.status, b.stderr).toBe(0);
    expect(JSON.parse(b.stdout).approval).toBe("missing");
    const approval = f.ownerReview(verified, new Date());
    const approvalFile = join(f.directory, "actual-synthetic-owner-review.json");
    writeFileSync(approvalFile, canonicalJson(approval));
    const c = f.cli("verify", ["--bundle", verified, "--out", final, "--approval", approvalFile]);
    expect(c.status, c.stderr).toBe(0);
    const receipt = JSON.parse(c.stdout);
    expect(receipt).toMatchObject({
      r00ToR10: "pass",
      overallRelease: "blocked",
      execution: "unavailable",
      approval: "verified",
    });
    const candidate = JSON.parse(readFileSync(join(final, "candidate.json"), "utf8"));
    expect(
      evaluateRelease({
        ...candidate,
        admittedTrust: f.trust,
        now: new Date(candidate.snapshot.evaluatedAt),
      }),
    ).toEqual(candidate.snapshot);
    expect(candidate.evidence).toHaveLength(f.artifacts.length + 1);
    expect(candidate.manifest.approvals).toHaveLength(1);
    expect(readFileSync(join(final, "readiness.md"), "utf8")).toContain(receipt.snapshotId);
    expect(JSON.parse(readFileSync(join(final, "readiness.json"), "utf8")).snapshotId).toBe(
      receipt.snapshotId,
    );
    expect(statSync(captured).mode & 0o777).toBe(0o700);
    for (const path of inventoryBundleTree(final, bundleLimits.entries + 12, 1).keys()) {
      expect(statSync(join(final, path)).mode & 0o777).toBe(0o600);
      const bytes = readFileSync(join(final, path), "utf8");
      expect(bytes).not.toContain(f.marker);
      expect(bytes).not.toContain("PRIVATE KEY");
    }
    expect(a.stdout + b.stdout + c.stdout + a.stderr + b.stderr + c.stderr).not.toContain(f.marker);
  });

  it.each(["corrupt", "delete", "add", "symlink", "swap"])(
    "a separately invoked verifier rejects %s payload bytes",
    (kind) => {
      const f = fixture();
      f.capture();
      const root = join(f.directory, "captured");
      const payload = join(root, "payload"),
        file = join(payload, "supporting/ref-0.txt");
      if (kind === "corrupt") writeFileSync(file, "corrupted bytes");
      if (kind === "delete") rmSync(file);
      if (kind === "add") writeFileSync(join(payload, "unlisted.txt"), "extra");
      if (kind === "symlink") {
        rmSync(file);
        symlinkSync(join(f.root, "supporting/ref-0.txt"), file);
      }
      if (kind === "swap") writeFileSync(file, readFileSync(join(payload, "policy.json")));
      const out = join(f.directory, "rejected");
      const result = f.cli("verify", ["--bundle", root, "--out", out]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(() => readFileSync(join(out, "result.json"))).toThrow();
      expect(readdirSync(f.directory).some((name) => name.startsWith("r10-failure-"))).toBe(true);
    },
  );

  it("never overwrites a successful package and removes a failed signing attempt", () => {
    const f = fixture();
    f.capture();
    const root = join(f.directory, "captured");
    const original = readFileSync(join(root, "capture.json"));
    expect(() => f.capture()).toThrow();
    expect(readFileSync(join(root, "capture.json"))).toEqual(original);
    const out = join(f.directory, "failed-signing");
    expect(() =>
      captureEvidenceBundle({
        root: f.root,
        source: f.source,
        out,
        trust: f.trust,
        now: f.now,
        signing: () => {
          throw new Error("synthetic signer failure");
        },
      }),
    ).toThrow();
    expect(() => statSync(out)).toThrow();
    // A new attempt at the previously failed identity cannot resurrect an old success marker.
    expect(f.capture(out).outcome).toBe("verified");
  });

  it("does not publish partial success after an exclusive output write fails", () => {
    const f = fixture(),
      out = join(f.directory, "write-failure");
    const sentinel = join(f.directory, "sentinel.json");
    writeFileSync(sentinel, "external bytes must survive");
    expect(() =>
      captureEvidenceBundle({
        root: f.root,
        source: f.source,
        out,
        trust: f.trust,
        now: f.now,
        signing: () => {
          symlinkSync(sentinel, join(out, "readiness.json"));
          return f.signing();
        },
      }),
    ).toThrow();
    expect(() => statSync(out)).toThrow();
    expect(readFileSync(sentinel, "utf8")).toBe("external bytes must survive");
  });

  it.each(["readiness.json", "readiness.md", "result.json"])(
    "detects changed saved %s instead of trusting its success label",
    (file) => {
      const f = fixture();
      f.capture();
      const path = join(f.directory, "captured", file);
      if (file.endsWith(".md")) writeFileSync(path, "caller-authored pass");
      else {
        const value = JSON.parse(readFileSync(path, "utf8"));
        value.snapshotId = sha256Digest("other snapshot");
        writeFileSync(path, canonicalJson(value));
      }
      const r = f.cli("verify", [
        "--bundle",
        join(f.directory, "captured"),
        "--out",
        join(f.directory, "rejected-views"),
      ]);
      expect(r.status).toBe(1);
      expect(() => readFileSync(join(f.directory, "rejected-views/result.json"))).toThrow();
    },
  );

  it("retains an earlier owner decision in E0 instead of excluding all human or R10 proof", () => {
    const f = fixture();
    f.capture();
    f.verify();
    const earlier = f.ownerReview();
    f.manifest.evidenceIds.push(earlier.id);
    f.manifest.evidenceDigests[earlier.id] = evidenceDigest(earlier);
    const path = "evidence/earlier-owner-review.json";
    writeFileSync(join(f.root, path), canonicalJson(earlier));
    writeFileSync(join(f.root, "manifest.json"), canonicalJson(f.manifest));
    f.source.files.push({ path, role: "evidence" });
    const out = join(f.directory, "with-prior-decision");
    expect(f.capture(out).outcome).toBe("verified");
    const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
    expect(
      index.entries.some((entry: { evidenceId?: string }) => entry.evidenceId === earlier.id),
    ).toBe(true);
    expect(index.evidenceSetDigest).toBe(hash(f.manifest.evidenceDigests));
    expect(index.evidenceSetDigest).not.toBe(
      JSON.parse(readFileSync(join(f.directory, "captured/index.json"), "utf8")).evidenceSetDigest,
    );
  });

  it("copies original verified bytes and ignores later caller/source changes", () => {
    const f = fixture();
    f.capture();
    const captured = join(f.directory, "captured");
    f.source.files.length = 0;
    writeFileSync(join(f.root, "supporting/ref-0.txt"), "changed later input");
    expect(f.verify().outcome).toBe("verified");
    expect(readFileSync(join(captured, "payload/supporting/ref-0.txt"), "utf8")).toBe(
      "synthetic fixture bytes",
    );
  });

  it("retains the frozen copy when the signing boundary changes caller inputs during capture", () => {
    const f = fixture(),
      out = join(f.directory, "mutated-during-capture");
    const expectedCount = f.source.files.length;
    const receipt = captureEvidenceBundle({
      root: f.root,
      source: f.source,
      out,
      trust: f.trust,
      now: f.now,
      signing: () => {
        f.source.files.length = 0;
        writeFileSync(join(f.root, "supporting/ref-0.txt"), "changed source during invocation");
        return f.signing();
      },
    });
    expect(receipt.outcome).toBe("verified");
    expect(JSON.parse(readFileSync(join(out, "index.json"), "utf8")).entries).toHaveLength(
      expectedCount,
    );
    expect(readFileSync(join(out, "payload/supporting/ref-0.txt"), "utf8")).toBe(
      "synthetic fixture bytes",
    );
    expect(f.verify(out, join(f.directory, "independently-reopened")).outcome).toBe("verified");
  });

  it("requires the later owner's exact transport digests and preserves the original evidence expiry", () => {
    const f = fixture();
    f.capture();
    f.verify();
    const verified = join(f.directory, "verified");
    const owner = f.ownerReview();
    for (const field of ["bundleIndex", "bundleCapture", "bundleVerification"] as const) {
      const bad = f.keys.signArtifact({
        ...owner,
        digests: { ...owner.digests, [field]: sha256Digest("wrong witness") },
      });
      expect(() =>
        f.verify(
          verified,
          join(f.directory, `wrong-${field}`),
          new Date(f.now.getTime() + 1),
          canonicalJson(bad),
        ),
      ).toThrow("candidate_not_qualified");
    }
    const late = new Date(f.now.getTime() + 3_600_000);
    expect(
      f.verify(verified, join(f.directory, "expired"), late, canonicalJson(owner)).outcome,
    ).toBe("blocked");
    expect(() => readFileSync(join(f.directory, "expired/candidate.json"))).toThrow();
    const forged = signEvidence(
      {
        ...owner,
        actor: { kind: "machine", name: "Fixture checker", version: "1" },
        purpose: "machine_observation",
      },
      f.keys.machine.privateKey,
      f.keys.machineKeyId,
    );
    expect(() =>
      f.verify(
        verified,
        join(f.directory, "fake-owner"),
        new Date(f.now.getTime() + 1),
        canonicalJson(forged),
      ),
    ).toThrow("owner_review_required");
  });

  it.each(Array.from({ length: 11 }, (_, i) => `R${String(i).padStart(2, "0")}`))(
    "cannot sign while %s prerequisite proof is missing",
    (gate) => {
      const f = fixture();
      const candidate = {
        ...f.candidate,
        evidence: f.candidate.evidence.filter((file) => JSON.parse(file.content).gate !== gate),
      };
      expect(bundlePrerequisites(candidate, f.trust, f.now).reasons.length).toBeGreaterThan(0);
    },
  );

  it("blocks valid zero-key draft inputs without reading a signer; malformed policy and installed trust fail", () => {
    const directory = temp(),
      root = join(directory, "input");
    mkdirSync(root);
    const policy = JSON.parse(readFileSync("release/policy.single-operator.proposed.json", "utf8"));
    const manifest = JSON.parse(readFileSync("release/manifest.template.json", "utf8"));
    manifest.policies.policyRevision = policy.policyRevision;
    writeFileSync(join(root, "manifest.json"), canonicalJson(manifest));
    writeFileSync(join(root, "policy.json"), canonicalJson(policy));
    const source = {
      schemaVersion: 1,
      files: [
        { path: "manifest.json", role: "manifest" },
        { path: "policy.json", role: "policy" },
      ],
    };
    const out = join(directory, "blocked");
    const receipt = captureEvidenceBundle({
      root,
      source,
      out,
      now: new Date(),
      signing: () => {
        throw new Error("signer must not be touched");
      },
    });
    expect(receipt).toMatchObject({
      outcome: "blocked",
      r00ToR10: "blocked",
      overallRelease: "blocked",
    });
    expect(readdirSync(out).sort()).toEqual(["readiness.json", "readiness.md", "result.json"]);
    const f = fixture();
    for (const trust of [undefined, "", "{}", "malformed"]) {
      const environment = { ...f.environment, MS_REALTY_EXECUTION_ADMISSION: trust };
      const r = f.cli(
        "capture",
        [
          "--root",
          f.root,
          "--inventory",
          f.inventory,
          "--out",
          join(f.directory, `trust-${String(trust).length}`),
        ],
        environment,
      );
      expect(r.status, r.stderr).toBe(trust === undefined || trust === "" ? 2 : 1);
      expect(r.stdout + r.stderr).not.toContain(f.marker);
    }
    writeFileSync(join(root, "policy.json"), '{"invalid":true}');
    expect(() =>
      captureEvidenceBundle({
        root,
        source,
        out: join(directory, "bad"),
        now: new Date(),
        signing: f.signing,
      }),
    ).toThrow("input_schema");
  });

  it("rejects credentials inside evidence and prohibits CLI trust or time overrides", () => {
    const f = fixture();
    writeFileSync(join(f.root, "key.pem"), readFileSync(f.keyFile));
    const result = f.cli(
      "capture",
      ["--root", f.root, "--inventory", f.inventory, "--out", join(f.directory, "secrets")],
      {
        ...f.environment,
        MS_REALTY_BUNDLE_SIGNING_KEY_PATH: join(f.root, "key.pem"),
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(f.marker);
    expect(result.stderr).toContain("overlapping_trees");
    for (const option of ["--now", "--trust"]) {
      const rejected = f.cli("capture", [
        option,
        "diagnostic",
        "--out",
        join(f.directory, "override"),
      ]);
      expect(rejected.status).toBe(1);
    }
  });

  it("redacts a failing signer and leaves no usable output or credential bytes", () => {
    const f = fixture();
    writeFileSync(f.keyFile, f.marker);
    const out = join(f.directory, "bad-signer");
    const failed = f.cli("capture", ["--root", f.root, "--inventory", f.inventory, "--out", out]);
    expect(failed.status).toBe(1);
    expect(failed.stdout + failed.stderr).not.toContain(f.marker);
    expect(() => statSync(out)).toThrow();
    for (const name of readdirSync(f.directory).filter((name) => name.startsWith("r10-failure-")))
      expect(readFileSync(join(f.directory, name), "utf8")).not.toContain(f.marker);
  });
});

describe("R10 bounded filesystem boundary", () => {
  it.each([
    "root-link",
    "parent-link",
    "file-link",
    "hard-link",
    "collision",
    "nested-collision",
    "traversal",
    "absolute",
    "special",
  ])("rejects %s input aliases", (kind) => {
    const f = fixture();
    const out = join(f.directory, "aliased");
    if (kind === "root-link") {
      const link = join(f.directory, "link");
      symlinkSync(f.root, link);
      expect(() => bundleRoot(link)).toThrow();
      return;
    }
    if (kind === "parent-link") {
      const link = join(f.directory, "link");
      symlinkSync(f.directory, link);
      expect(() => bundleRoot(join(link, "input"))).toThrow();
      return;
    }
    if (kind === "file-link")
      symlinkSync(join(f.root, "manifest.json"), join(f.root, "alias.json"));
    if (kind === "hard-link") linkSync(join(f.root, "manifest.json"), join(f.root, "alias.json"));
    if (kind === "collision") writeFileSync(join(f.root, "POLICY.JSON"), "{}");
    if (kind === "nested-collision") {
      mkdirSync(join(f.root, "Evidence"), { recursive: true });
      writeFileSync(join(f.root, "Evidence/alias.json"), "{}");
    }
    const first = f.source.files[0];
    if (!first) throw new Error("Missing fixture path");
    if (kind === "traversal") first.path = "../escape.json";
    if (kind === "absolute") first.path = "/absolute.json";
    if (kind === "special") {
      const command = spawnSync("mkfifo", [join(f.root, "special")]);
      expect(command.status).toBe(0);
    }
    expect(() => f.capture(out)).toThrow();
  });

  it("enforces inclusive file, aggregate and entry bounds before reading oversized payloads", () => {
    const directory = temp(),
      file = join(directory, "large.bin");
    writeFileSync(file, "");
    truncateSync(file, bundleLimits.fileBytes);
    expect(readBundleFile(directory, "large.bin")).toHaveLength(bundleLimits.fileBytes);
    truncateSync(file, bundleLimits.fileBytes + 1);
    expect(() => readBundleFile(directory, "large.bin")).toThrow("file_size");
    truncateSync(file, bundleLimits.fileBytes);
    for (let i = 0; i < 15; i++) {
      const p = join(directory, `large-${i}.bin`);
      writeFileSync(p, "");
      truncateSync(p, bundleLimits.fileBytes);
    }
    expect(inventoryBundleTree(directory).size).toBe(16);
    writeFileSync(join(directory, "excess.bin"), "x");
    expect(() => inventoryBundleTree(directory)).toThrow("payload_size");
    const many = temp();
    for (let i = 0; i < bundleLimits.entries; i++) writeFileSync(join(many, `item-${i}`), "");
    expect(inventoryBundleTree(many).size).toBe(bundleLimits.entries);
    writeFileSync(join(many, "extra"), "");
    expect(() => inventoryBundleTree(many)).toThrow("entry_count");
  });

  it("rejects duplicate/ambiguous raw JSON and overlapping output before publication", () => {
    const f = fixture();
    const p = join(f.root, "manifest.json");
    writeFileSync(
      p,
      readFileSync(p, "utf8").replace(
        '"product":"ms-realty"',
        '"product":"ms-realty","product":"ms-realty"',
      ),
    );
    expect(() => f.capture()).toThrow("duplicate_json_key");
    writeFileSync(p, canonicalJson(f.manifest));
    expect(() => f.capture(join(f.root, "output"))).toThrow("overlapping_trees");
    expect(() => parseBundleJson(Buffer.from([0x22, 0xff, 0x22]))).toThrow("invalid_utf8");
  });
});
