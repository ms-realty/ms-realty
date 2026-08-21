import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BRIDGE_GUARDRAILS,
  DESKTOP_BRIDGE_PROVIDER,
  bridgeNextTasks,
  bridgeStatus,
  bridgeSubmitDraft,
} from "../lib/hermes-desktop-bridge.mjs";
import { assertHermesDraftWorkerReport, readHermesDraftDispatch } from "../lib/hermes-draft-worker.mjs";

const dispatch = readHermesDraftDispatch();

function draftFor(row) {
  const factLine = Object.values(row.prompt.propertyFacts || {}).filter(Boolean).join(" ");
  return {
    title: `${row.object_id} ${row.prompt.targetLocale}`,
    body: `${factLine} ${row.prompt.targetLocale} draft`,
    seo_title: `${row.object_id} ${row.prompt.targetLocale}`,
    meta_description: `${factLine} ${row.prompt.targetLocale} draft`,
    citations: row.citations,
  };
}

function scratchPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-bridge-"));
  return {
    dir,
    filePath: path.join(dir, "translations.jsonl"),
    auditPath: path.join(dir, "translations-audit.jsonl"),
    auditLogPath: path.join(dir, "audit-log.jsonl"),
    reportPath: path.join(dir, "hermes-worker-report.json"),
  };
}

test("bridge advertises a non-sensitive desktop provider with guardrails", () => {
  assert.equal(DESKTOP_BRIDGE_PROVIDER.mode, "desktop_subscription");
  assert.equal(DESKTOP_BRIDGE_PROVIDER.sensitiveDataAllowed, false);
  const status = bridgeStatus({ dispatch });
  assert.ok(status.eligible_for_desktop > 0, "expected desktop-eligible dispatch rows");
  assert.equal(status.eligible_for_desktop + status.withheld_sensitive, dispatch.rows.length);
  assert.deepEqual(status.guardrails, BRIDGE_GUARDRAILS);
});

test("next tasks carry the hosted worker's exact model messages", () => {
  const tasks = bridgeNextTasks({ dispatch, limit: 2 });
  assert.equal(tasks.length, 2);
  for (const task of tasks) {
    assert.ok(Array.isArray(task.messages) && task.messages.length >= 2, "expected system+user messages");
    assert.equal(task.messages[0].role, "system");
    assert.ok(task.id && task.target_locale && task.reviewer_role);
  }
  const locale = tasks[0].target_locale;
  for (const filtered of bridgeNextTasks({ dispatch, limit: 5, targetLocale: locale })) {
    assert.equal(filtered.target_locale, locale);
  }
});

test("submit validates, persists draft-only, audits, and writes launch evidence", async () => {
  const { filePath, auditPath, auditLogPath, reportPath } = scratchPaths();
  const row = dispatch.rows.find((candidate) => candidate.data_classification === "non_sensitive_listing_translation");
  const result = await bridgeSubmitDraft({
    dispatch,
    id: row.id,
    draft: draftFor(row),
    model: "claude-test",
    filePath,
    auditPath,
    auditLogPath,
    reportPath,
    recordedAt: "2026-08-09T00:00:00Z",
  });
  assert.equal(result.persisted.status, "hermes_drafted");
  assert.equal(result.persisted.requires_human_approval, true);
  assert.equal(result.persisted.public_indexable, false);

  const ledgerRows = fs.readFileSync(filePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(ledgerRows.at(-1).id, row.id);
  const auditRows = fs.readFileSync(auditLogPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const entry = auditRows.at(-1);
  assert.equal(entry.action, "hermes_model_call");
  assert.equal(entry.actor, "hermes_worker");
  assert.equal(entry.metadata.provider, "desktop_subscription");
  assert.equal(entry.metadata.model, "claude-test");
  assert.equal(entry.metadata.sensitive_data, false);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(assertHermesDraftWorkerReport(report), true);
  assert.equal(report.provider.mode, "desktop_subscription");
  assert.equal(report.summary.persisted, 1);
  assert.equal(result.report.path, reportPath);
});

test("submit rejects unknown rows, fact drift, and sensitive classifications", async () => {
  const { filePath, auditPath, auditLogPath } = scratchPaths();
  const row = dispatch.rows[0];

  await assert.rejects(
    () => bridgeSubmitDraft({ dispatch, id: "missing-row", draft: draftFor(row), filePath, auditPath, auditLogPath }),
    /Unknown dispatch row/,
  );

  const drifted = { ...draftFor(row), body: "no facts here", meta_description: "no facts here" };
  await assert.rejects(() => bridgeSubmitDraft({ dispatch, id: row.id, draft: drifted, filePath, auditPath, auditLogPath }));

  const sensitiveRow = JSON.parse(JSON.stringify(row));
  sensitiveRow.id = "sensitive-fixture";
  sensitiveRow.data_classification = "sensitive_lead_reply";
  const sensitiveDispatch = { ...dispatch, rows: [sensitiveRow] };
  await assert.rejects(() =>
    bridgeSubmitDraft({
      dispatch: sensitiveDispatch,
      id: sensitiveRow.id,
      draft: draftFor(sensitiveRow),
      filePath,
      auditPath,
      auditLogPath,
    }),
  );
  assert.equal(bridgeStatus({ dispatch: sensitiveDispatch }).eligible_for_desktop, 0);
});
