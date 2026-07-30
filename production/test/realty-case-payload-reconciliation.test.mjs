import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendRealtyCaseAction,
  openRealtyCase,
  readRealtyCaseEvents,
  resetRealtyCaseLedger,
} from "../lib/realty-cases.mjs";
import {
  buildRealtyCasePayloadManifest,
  detectRealtyCasePayloadDrift,
  readRealtyCasePayloadManifest,
} from "../lib/realty-case-payload-reconciliation.mjs";
import { fromRoot } from "../lib/paths.mjs";

function ledger() {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-manifest-")), "cases.jsonl");
  resetRealtyCaseLedger(filePath);
  return filePath;
}

function mandate(ref) {
  return {
    ref,
    grantedByRef: "contact-owner-1",
    signedAt: "2026-07-30T08:00:00.000Z",
    signedEvidenceRef: `evidence-signed-${ref}`,
    capabilities: ["case:*"],
  };
}

function seededEvents(filePath) {
  const opened = openRealtyCase(
    {
      id: "case-payload-1",
      jurisdiction: "BG",
      caseType: "seller_sale",
      assetKind: "residential",
      clientRef: "contact-owner-1",
      propertyRef: "property-1",
      executionMode: "manual",
      mandate: mandate("mandate-1"),
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  appendRealtyCaseAction(
    {
      caseId: opened.case.id,
      action: "mode_changed",
      executionMode: "autonomous",
      assuranceRef: "assurance://trusted-agents/sandanski-1",
      authorityRef: "authority-mode-change-1",
      mandate: mandate("mandate-2"),
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:10:00.000Z" },
  );
  return readRealtyCaseEvents(filePath);
}

function withoutSignedEvidence(events) {
  return events.map((event) =>
    ["case_opened", "mode_changed"].includes(event.action)
      ? {
          ...event,
          mandate: Object.fromEntries(
            Object.entries(event.mandate).filter(([key]) => key !== "signed_evidence_ref"),
          ),
        }
      : event,
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("payload manifest is deterministic and projects the current mandate version without database IDs", () => {
  const events = seededEvents(ledger());
  const first = buildRealtyCasePayloadManifest(events, { workspaceId: "workspace-sandanski" });
  const second = buildRealtyCasePayloadManifest(clone(events), { workspaceId: "workspace-sandanski" });

  assert.deepEqual(first, second);
  assert.equal(first.reconciliation.ready_for_import, true);
  assert.equal(first.collections.realty_cases.length, 1);
  assert.equal(first.collections.realty_case_events.length, 2);
  assert.equal(first.collections.realty_case_mandate_versions.length, 2);
  assert.match(first.collections.realty_cases[0].manifest_id, /^mrc_[a-f0-9]{32}$/);
  assert.equal(first.collections.realty_cases[0].data.mandate_ref, "mandate-2");
  assert.equal(first.collections.realty_cases[0].data.mandate_version_number, 2);
  assert.deepEqual(
    first.collections.realty_case_mandate_versions.map((row) => row.data.status),
    ["superseded", "active"],
  );
  assert.equal(first.collections.realty_case_events[0].references.case.match.case_id, "case-payload-1");
  assert.equal(first.collections.realty_case_events[0].data.case, undefined);
});

test("manifest reports missing signed mandate evidence instead of fabricating an importable row", () => {
  const filePath = ledger();
  const events = seededEvents(filePath);
  const currentManifest = readRealtyCasePayloadManifest({ filePath, workspaceId: "workspace-sandanski" });
  const manifest = buildRealtyCasePayloadManifest(withoutSignedEvidence(events), { workspaceId: "workspace-sandanski" });

  assert.equal(currentManifest.reconciliation.ready_for_import, true);
  assert.equal(manifest.reconciliation.ready_for_import, false);
  assert.equal(manifest.reconciliation.source_gaps.length, 2);
  assert.equal(manifest.collections.realty_case_mandate_versions.every((row) => row.importable === false), true);
  assert.throws(() => buildRealtyCasePayloadManifest(events), /workspaceId/i);

  const report = detectRealtyCasePayloadDrift(manifest, manifest);
  assert.equal(report.in_sync, true);
  assert.equal(report.clean, false);
  assert.equal(report.source_gaps.length, 2);
  assert.equal(events.length, 2);
});

test("reconciliation detects changed, missing, and unexpected records from their projected content", () => {
  const manifest = buildRealtyCasePayloadManifest(seededEvents(ledger()), {
    workspaceId: "workspace-sandanski",
  });
  const observed = clone(manifest);
  observed.collections.realty_cases[0].data.status = "frozen";
  observed.collections.realty_case_events.pop();
  observed.collections.realty_cases.push({
    ...clone(observed.collections.realty_cases[0]),
    manifest_id: "mrc_unexpected",
  });

  const report = detectRealtyCasePayloadDrift(manifest, observed);
  assert.equal(report.clean, false);
  assert.equal(report.changed.length, 1);
  assert.equal(report.missing.length, 1);
  assert.equal(report.unexpected.length, 1);
});

test("the export rejects obvious private fields and never copies unrecognised source text", () => {
  const events = seededEvents(ledger());
  const privateEvent = clone(events);
  privateEvent[0].email = "customer@example.test";
  assert.throws(
    () => buildRealtyCasePayloadManifest(privateEvent, { workspaceId: "workspace-sandanski" }),
    /private field/i,
  );

  const extraText = clone(events);
  extraText[0].notes = "do-not-export@example.test";
  const manifest = buildRealtyCasePayloadManifest(extraText, { workspaceId: "workspace-sandanski" });
  assert.equal(JSON.stringify(manifest).includes("do-not-export@example.test"), false);
});

test("manifest CLI requires explicit workspace scope and emits a reference-only plan", () => {
  const filePath = ledger();
  seededEvents(filePath);
  const run = (env) =>
    spawnSync(process.execPath, [fromRoot("production", "scripts", "build-realty-case-payload-manifest.mjs")], {
      cwd: fromRoot(),
      encoding: "utf8",
      env: { ...process.env, MS_REALTY_CASE_LEDGER_PATH: filePath, ...env },
    });

  const missingScope = run({});
  assert.notEqual(missingScope.status, 0);
  assert.match(missingScope.stderr, /workspaceId/i);

  const emitted = run({ MS_REALTY_WORKSPACE_ID: "workspace-sandanski" });
  assert.equal(emitted.status, 0, emitted.stderr);
  const manifest = JSON.parse(emitted.stdout);
  assert.equal(manifest.workspace_id, "workspace-sandanski");
  assert.equal(JSON.stringify(manifest).includes("contact-owner-1"), true);
  assert.equal(JSON.stringify(manifest).includes("do-not-export@example.test"), false);
});
