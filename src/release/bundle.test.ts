// Synthetic fixture signatures only; these are not owner review or release evidence.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bundleBaseManifest,
  bundleLimits,
  parseBundleIndex,
  parseBundleJson,
  validateBundlePath,
  validateBundleTransport,
} from "./bundle";
import { evaluateRelease } from "./evaluate";
import { inspectExecutionCandidate } from "./execution-bridge";
// @ts-expect-error Shared test-only JavaScript fixture.
import { bundleSigningFixture, executionScenario } from "./execution-fixtures.mjs";
import { canonicalJson, evidenceDigest, sha256Digest } from "./signature";

const evaluate = (f: ReturnType<typeof executionScenario>) =>
  evaluateRelease({
    ...f.preparation.candidate,
    admittedTrust: f.admission.release,
    now: new Date(f.at),
  });
const r10 = (f: ReturnType<typeof executionScenario>) =>
  evaluate(f).gates.find((gate) => gate.id === "R10");

describe("R10 evidence bundle consumer binding", () => {
  it("blocks direct evaluation of boolean bundle claims without raw bundle proof", () => {
    const f = executionScenario();
    const report = evaluateRelease({
      ...f.preparation.candidate,
      bundle: undefined,
      admittedTrust: f.admission.release,
      now: new Date(f.at),
    });
    expect(report.gates.find((gate) => gate.id === "R10")?.status).toBe("blocked");
  });

  it("also rejects absent proof at the direct execution seam", () => {
    const f = executionScenario();
    delete f.packet.candidate.bundle;
    expect(() => inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).toThrow();
  });

  it("rechecks changed raw evidence on each direct evaluation", () => {
    const f = executionScenario();
    expect(r10(f)?.status).toBe("pass");
    const file = f.preparation.candidate.evidence[0];
    const artifact = JSON.parse(file.content);
    file.content = `${file.content.slice(0, -1)},"id":${JSON.stringify(artifact.id)}}`;
    expect(r10(f)?.blockers).toContain("bundle_binding_invalid:duplicate_json_key");
  });

  it.each(["index", "capture", "verification"])(
    "rejects swapped or altered %s controls with otherwise genuine owner assertions",
    (field) => {
      const f = executionScenario();
      const proof = JSON.parse(f.preparation.candidate.bundle[field]);
      if (field === "index") proof.contextDigest = sha256Digest("another context");
      else
        proof.signature.value = `${proof.signature.value[0] === "A" ? "B" : "A"}${proof.signature.value.slice(1)}`;
      f.preparation.candidate.bundle[field] = canonicalJson(proof);
      expect(r10(f)?.status).toBe("blocked");
    },
  );

  it.each(["type", "actor", "purpose", "environment", "key", "expiry", "future", "assertion"])(
    "requires actual witness %s scope and time bindings",
    (field) => {
      const f = executionScenario(),
        keys = bundleSigningFixture();
      const witness = JSON.parse(f.preparation.candidate.bundle.capture);
      if (field === "type") witness.type = "provider_check";
      if (field === "actor") witness.actor = { kind: "human", name: "Ivan" };
      if (field === "purpose") witness.purpose = "candidate_review";
      if (field === "environment") witness.environment = "ci";
      if (field === "key") witness.signature.keyId = keys.ownerKeyId;
      if (field === "expiry") witness.expiresAt = new Date(f.at + 86_400_000).toISOString();
      if (field === "future") witness.observedAt = new Date(f.at + 300_001).toISOString();
      if (field === "assertion") witness.assertions[0].passed = false;
      f.preparation.candidate.bundle.capture = canonicalJson(
        field === "key" ? witness : keys.signArtifact(witness),
      );
      expect(r10(f)?.status).toBe("blocked");
    },
  );

  it("keeps raw file hashes distinct from canonical artifact identity", () => {
    const f = executionScenario();
    const file = f.preparation.candidate.evidence[0];
    const before = JSON.parse(file.content),
      raw = sha256Digest(file.content);
    file.content = JSON.stringify(before, null, 2);
    expect(evidenceDigest(JSON.parse(file.content))).toBe(evidenceDigest(before));
    expect(sha256Digest(file.content)).not.toBe(raw);
    expect(evaluate(f).evidence.every((item) => item.counted)).toBe(true);
    expect(r10(f)?.blockers).toContain("bundle_binding_invalid:evidence_byte_binding");
  });

  it.each([
    "releaseSha",
    "specVersion",
    "environment",
    "artifacts.web",
    "artifacts.worker",
    "artifacts.migration",
    "artifacts.gateway",
    "revisions.dependencies",
    "revisions.model",
    "revisions.prompts",
    "revisions.schemas",
    "providerAccounts.synthetic",
    "database.schemaDigest",
    "database.lastMigration",
    "manifests.domains",
    "manifests.redirects",
    "manifests.media",
    "manifests.dataImport",
    "scope.services",
    "scope.regions",
    "scope.locales",
    "scope.channels",
    "policies.roles",
    "policies.retention",
    "policies.templates",
    "policies.policyRevision",
    "recoveryPoint.id",
    "recoveryPoint.sealedAt",
    "procedures.cutover.digest",
    "procedures.rollback.ref",
  ])("rejects changed complete candidate context %s", (path) => {
    const f = executionScenario();
    const parts = path.split(".");
    let object = f.preparation.candidate.manifest;
    for (const name of parts.slice(0, -1)) object = object[name];
    const name = parts.at(-1) ?? "";
    if (path === "releaseSha") object[name] = "c".repeat(40);
    else if (path === "environment") object[name] = "staging";
    else if (path === "recoveryPoint.sealedAt")
      object[name] = new Date(f.at - 120_000).toISOString();
    else if (Array.isArray(object[name])) object[name] = ["changed"];
    else if (object[name].startsWith("sha256:")) object[name] = sha256Digest("changed");
    else object[name] = "changed";
    expect(r10(f)?.status).toBe("blocked");
  });

  it.each(["missing", "extra", "duplicate", "transport"])(
    "rejects %s evidence without dropping prerequisite decisions",
    (kind) => {
      const f = executionScenario();
      if (kind === "missing") f.preparation.candidate.evidence.shift();
      if (kind === "extra" || kind === "duplicate")
        f.preparation.candidate.evidence.push({
          ...f.preparation.candidate.evidence[0],
          file: "extra.json",
        });
      if (kind === "transport") {
        const proof = JSON.parse(f.preparation.candidate.bundle.capture);
        f.preparation.candidate.manifest.evidenceIds.push(proof.id);
        f.preparation.candidate.manifest.evidenceDigests[proof.id] = evidenceDigest(proof);
        f.preparation.candidate.evidence.push({
          file: "capture-as-evidence.json",
          content: f.preparation.candidate.bundle.capture,
        });
        expect(evaluate(f).evidence.find((item) => item.id === proof.id)?.reasons).toContain(
          "transport_only",
        );
      }
      expect(r10(f)?.status).toBe("blocked");
    },
  );

  it("bounds witness validity by evidence and recovery without freshening either", () => {
    const f = executionScenario();
    const candidate = f.preparation.candidate;
    const proof = candidate.bundle;
    const base = bundleBaseManifest(candidate.manifest);
    const evidence = candidate.evidence.filter(
      (file: { content: string }) => JSON.parse(file.content).type !== "release_attestation",
    );
    const expiry = Date.parse(JSON.parse(proof.capture).expiresAt);
    expect(() =>
      validateBundleTransport({
        ...proof,
        manifest: base,
        policy: candidate.policy,
        evidence,
        now: new Date(expiry),
      }),
    ).toThrow("witness_freshness");
    const frozen = candidate.manifest.recoveryPoint.sealedAt;
    expect(frozen).toBe(base.recoveryPoint?.sealedAt);
    expect(candidate.snapshot.expiresAt).toBe(JSON.parse(proof.verification).expiresAt);
  });

  it("keeps the complete packet within the existing cap", () => {
    const f = executionScenario();
    f.packet.candidateBytes.dependencies = "x".repeat(bundleLimits.jsonBytes);
    expect(() => inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).toThrow(
      "complete packet within 2 MiB",
    );
    const withGrant = executionScenario();
    withGrant.packet.grant.payload = "x".repeat(bundleLimits.jsonBytes);
    expect(() =>
      inspectExecutionCandidate(withGrant.packet, withGrant.admission, new Date(withGrant.at)),
    ).toThrow("complete packet within 2 MiB");
  });
});

describe("R10 canonical and bounded JSON controls", () => {
  it.each(["string", "bytes"])(
    "preserves raw Unicode, escapes and distinct normalization forms from %s",
    (input) => {
      const text = String.raw`{"e\u0301":"combining","é":"precomposed","raw":"Сандански 🌍","escaped":"quote:\" slash:\\ newline:\n","pair":"\ud83c\udf0d"}`;
      expect(parseBundleJson(input === "string" ? text : Buffer.from(text))).toEqual({
        "e\u0301": "combining",
        é: "precomposed",
        raw: "Сандански 🌍",
        escaped: 'quote:" slash:\\ newline:\n',
        pair: "🌍",
      });
    },
  );

  it.each(["string", "bytes"])(
    "rejects controls, invalid escapes and duplicate decoded keys from %s",
    (input) => {
      for (const text of [
        '"raw\u0000control"',
        '"raw\tcontrol"',
        String.raw`"\q"`,
        String.raw`"\u12xz"`,
        String.raw`"\ud800"`,
        String.raw`"\udc00"`,
        String.raw`"\ud800\u0061"`,
        String.raw`"\ud83c🌍"`,
        String.raw`"🌍\udf0d"`,
        String.raw`{"é":1,"\u00e9":2}`,
        String.raw`{"e\u0301":1,"é":2}`,
        '"trailing\\',
      ])
        expect(() => parseBundleJson(input === "string" ? text : Buffer.from(text))).toThrow();
    },
  );

  it("rejects malformed raw Unicode before decoding any unescaped string", () => {
    expect(() => parseBundleJson('"\ud800"')).toThrow("invalid_utf8");
    expect(() => parseBundleJson(Buffer.from([0x22, 0xed, 0xa0, 0x80, 0x22]))).toThrow(
      "invalid_utf8",
    );
  });

  it("uses the existing canonical dialect with an independently computed expected digest", () => {
    const expected = '{"a":[{"a":2,"z":1},3],"z":{"a":true,"b":null}}';
    const value = { z: { b: null, a: true }, a: [{ z: 1, a: 2 }, 3] };
    expect(canonicalJson(value)).toBe(expected);
    expect(sha256Digest(canonicalJson(value))).toBe(
      `sha256:${createHash("sha256").update(expected).digest("hex")}`,
    );
    expect(parseBundleJson(expected, true)).toEqual(value);
  });

  it.each([
    '{"a":1,"a":2}',
    '{"outer":{"id":1,"\\u0069d":1}}',
    '{"a":1,}',
    "[1,]",
    "true false",
    "1e999",
    '"\\ud800"',
    "\ufeff{}",
  ])("rejects ambiguous JSON %s", (bytes) => {
    expect(() => parseBundleJson(bytes)).toThrow();
  });

  it("bounds JSON bytes/depth and rejects noncanonical control bytes", () => {
    expect(parseBundleJson(`"${"x".repeat(bundleLimits.jsonBytes - 2)}"`)).toHaveLength(
      bundleLimits.jsonBytes - 2,
    );
    expect(() => parseBundleJson(`"${"x".repeat(bundleLimits.jsonBytes - 1)}"`)).toThrow(
      "json_size",
    );
    expect(
      parseBundleJson(
        `${"[".repeat(bundleLimits.jsonDepth)}0${"]".repeat(bundleLimits.jsonDepth)}`,
      ),
    ).toBeDefined();
    expect(() =>
      parseBundleJson(
        `${"[".repeat(bundleLimits.jsonDepth + 1)}0${"]".repeat(bundleLimits.jsonDepth + 1)}`,
      ),
    ).toThrow("json_depth");
    expect(() => parseBundleJson('{ "a": 1 }', true)).toThrow("noncanonical_control");
    const f = executionScenario();
    f.preparation.candidate.bundle.index += "\n";
    expect(r10(f)?.status).toBe("blocked");
  });

  it.each(["", "../a", "a/../b", "/a", "a//b", "a/./b", "a\\b", "a\0b", "a.", "CON.txt", ".env"])(
    "rejects unsafe relative path %s",
    (path) => {
      expect(() => validateBundlePath(path)).toThrow();
    },
  );

  it("checks inclusive path bounds and portable parent collisions in copied inventory", () => {
    expect(() => validateBundlePath("a".repeat(bundleLimits.pathBytes))).not.toThrow();
    expect(() => validateBundlePath("a".repeat(bundleLimits.pathBytes + 1))).toThrow("path_length");
    expect(() => validateBundlePath(Array(8).fill("a").join("/"))).not.toThrow();
    expect(() => validateBundlePath(Array(9).fill("a").join("/"))).toThrow("path_depth");
    const f = executionScenario(),
      index = JSON.parse(f.preparation.candidate.bundle.index);
    const rows = index.entries;
    rows[0].path = "Folder/a.json";
    rows[1].path = "folder/b.json";
    rows.sort((a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : 1));
    expect(() => parseBundleIndex(canonicalJson(index))).toThrow("portable_path_collision");
  });
});
