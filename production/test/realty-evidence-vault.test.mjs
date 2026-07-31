import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REALTY_EVIDENCE_VAULT_KEY_ENV,
  appendRealtyEvidence,
  readRealtyEvidence,
  readRealtyEvidenceMetadata,
} from "../lib/realty-evidence-vault.mjs";

const SECRET = "test-only-realty-evidence-vault-key-32-characters-minimum";

function vaultPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-evidence-vault-")), "evidence.jsonl");
}

function scope() {
  return { workspaceId: "workspace-bg-1", caseId: "case-bg-1" };
}

function evidence(overrides = {}) {
  return {
    ...scope(),
    ref: "evidence-title-1",
    type: "property_title_extract",
    producerKind: "registry",
    issuedAt: "2026-07-30T08:00:00.000Z",
    retention: { retainUntil: "2031-07-30T08:00:00.000Z", policyRef: "retention-legal-7y" },
    payloadText: "Private title document: Noa Levi, cadastral 12345.",
    accessScope: scope(),
    ...overrides,
  };
}

test("realty evidence vault encrypts payloads while returning reference-only metadata", () => {
  const filePath = vaultPath();
  const payload = "Private title document: Noa Levi, cadastral 12345.";
  const stored = appendRealtyEvidence(evidence({ payloadText: payload }), {
    filePath,
    env: { [REALTY_EVIDENCE_VAULT_KEY_ENV]: SECRET },
    storedAt: "2026-07-30T09:00:00.000Z",
  });

  assert.deepEqual(stored, {
    workspace_id: "workspace-bg-1",
    case_id: "case-bg-1",
    ref: "evidence-title-1",
    type: "property_title_extract",
    producer_kind: "registry",
    digest: `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`,
    issued_at: "2026-07-30T08:00:00.000Z",
    stored_at: "2026-07-30T09:00:00.000Z",
    retention: { retain_until: "2031-07-30T08:00:00.000Z", policy_ref: "retention-legal-7y", legal_hold: false },
    encrypted: true,
    idempotent: false,
  });
  const raw = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(raw, /Noa Levi|cadastral 12345|Private title document/);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  const metadata = { ...stored };
  delete metadata.idempotent;
  assert.deepEqual(readRealtyEvidenceMetadata({ ...scope(), accessScope: scope() }, { filePath, secret: SECRET }), [metadata]);
  const restored = readRealtyEvidence(
    { ...scope(), ref: "evidence-title-1", accessScope: scope() },
    { filePath, secret: SECRET },
  );
  assert.deepEqual(restored.metadata, metadata);
  assert.equal(restored.payload, payload);

  const bytes = Buffer.from([0, 255, 1, 2]);
  appendRealtyEvidence(
    evidence({ ref: "evidence-binary-1", type: "signed_pdf", payloadBytes: bytes, payloadText: undefined }),
    { filePath, secret: SECRET },
  );
  const binary = readRealtyEvidence(
    { ...scope(), ref: "evidence-binary-1", accessScope: scope() },
    { filePath, secret: SECRET },
  );
  assert.deepEqual(binary.payload, bytes);
});

test("realty evidence vault validates digest and rejects weak key configuration before writing", () => {
  const filePath = vaultPath();
  assert.throws(
    () =>
      appendRealtyEvidence(
        evidence({ digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
        { filePath, secret: SECRET },
      ),
    /digest does not match/i,
  );
  assert.throws(() => appendRealtyEvidence(evidence(), { filePath, env: { [REALTY_EVIDENCE_VAULT_KEY_ENV]: "short" } }), /at least 32 characters/);
  assert.equal(fs.existsSync(filePath), false);
});

test("realty evidence vault makes exact retries idempotent and refuses conflicting ref reuse", () => {
  const filePath = vaultPath();
  const first = appendRealtyEvidence(evidence(), { filePath, secret: SECRET, storedAt: "2026-07-30T09:00:00.000Z" });
  const retry = appendRealtyEvidence(evidence(), { filePath, secret: SECRET, storedAt: "2026-07-30T09:01:00.000Z" });
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.stored_at, first.stored_at);
  assert.equal(fs.readFileSync(filePath, "utf8").trim().split("\n").length, 1);
  assert.throws(
    () => appendRealtyEvidence(evidence({ payloadText: "Different private title document." }), { filePath, secret: SECRET }),
    /conflicts with existing evidence/i,
  );
  assert.throws(
    () => appendRealtyEvidence(evidence({ type: "different_type" }), { filePath, secret: SECRET }),
    /conflicts with existing evidence/i,
  );
});

test("realty evidence vault binds payloads to the requested workspace and case scope", () => {
  const filePath = vaultPath();
  appendRealtyEvidence(evidence(), { filePath, secret: SECRET });
  const wrongScope = { workspaceId: "workspace-bg-1", caseId: "case-bg-2" };
  assert.throws(
    () => readRealtyEvidence({ ...scope(), ref: "evidence-title-1", accessScope: wrongScope }, { filePath, secret: SECRET }),
    /access scope does not match/i,
  );
  assert.throws(
    () => appendRealtyEvidence(evidence({ accessScope: wrongScope }), { filePath, secret: SECRET }),
    /access scope does not match/i,
  );
  assert.throws(
    () => readRealtyEvidence({ ...scope(), ref: "evidence-title-1", accessScope: scope() }, { filePath, secret: `${SECRET}-wrong` }),
    /authenticate data|Unsupported state/i,
  );

  const row = JSON.parse(fs.readFileSync(filePath, "utf8"));
  row.case_id = "case-tampered";
  fs.writeFileSync(filePath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  assert.throws(
    () =>
      readRealtyEvidence(
        { workspaceId: "workspace-bg-1", caseId: "case-tampered", ref: "evidence-title-1", accessScope: { workspaceId: "workspace-bg-1", caseId: "case-tampered" } },
        { filePath, secret: SECRET },
      ),
    /authenticate data|Unsupported state/i,
  );
});
