import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REALTY_RULE_SOURCES,
  REALTY_WORKFLOW_VERSION,
  appendRealtyCaseAction,
  assertRealtyCaseEvents,
  buildRealtyCaseQueue,
  openRealtyCase,
  readRealtyCaseEvents,
  resetRealtyCaseLedger,
} from "../lib/realty-cases.mjs";

function ledger() {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-cases-")), "cases.jsonl");
  resetRealtyCaseLedger(filePath);
  return filePath;
}

function mandate(ref = "mandate-1") {
  return {
    ref,
    grantedByRef: "contact-1",
    signedAt: "2026-07-30T08:00:00.000Z",
    signedEvidenceRef: `evidence://${ref}/signed`,
    capabilities: ["case:*"],
  };
}

test("a case mandate requires a signed-evidence reference", () => {
  const filePath = ledger();
  assert.throws(
    () =>
      openRealtyCase(
        {
          id: "case-mandate-evidence-required",
          jurisdiction: "BG",
          caseType: "tenant_rental",
          assetKind: "residential",
          clientRef: "contact-1",
          executionMode: "manual",
          mandate: { ...mandate(), signedEvidenceRef: undefined },
          actor: "broker_bg",
          executorKind: "human",
        },
        { filePath, recordedAt: "2026-07-30T08:05:00.000Z" },
      ),
    /signedEvidenceRef/i,
  );
});

function evidence(step) {
  return [
    {
      ref: `evidence-${step.key}`,
      type: `${step.key}_record`,
      producerKind: step.evidence_producers[0],
      issuedAt: "2026-07-30T09:00:00.000Z",
    },
  ];
}

test("manual and autonomous cases use the same workflow while enforcing their executor boundary", () => {
  const filePath = ledger();
  const opened = openRealtyCase(
    {
      id: "case-manual-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "contact-1",
      propertyRef: "listing-1",
      executionMode: "manual",
      mandate: mandate(),
      actor: "broker_bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  assert.equal(opened.case.execution_mode, "manual");
  const retriedOpen = openRealtyCase(
    {
      id: "case-manual-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "contact-1",
      propertyRef: "listing-1",
      executionMode: "manual",
      mandate: mandate(),
      actor: "broker_bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:06:00.000Z" },
  );
  assert.equal(retriedOpen.idempotent, true);
  assert.equal(retriedOpen.event.actor, "broker_bg");

  const firstStep = opened.case.steps[0];
  appendRealtyCaseAction(
    {
      caseId: opened.case.id,
      action: "step_completed",
      stepKey: firstStep.key,
      evidenceRefs: evidence(firstStep),
      actor: "broker_bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T09:05:00.000Z" },
  );
  assert.throws(
    () =>
      appendRealtyCaseAction(
        {
          caseId: opened.case.id,
          action: "step_completed",
          stepKey: opened.case.steps[1].key,
          evidenceRefs: evidence(opened.case.steps[1]),
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, recordedAt: "2026-07-30T09:06:00.000Z" },
      ),
    /manual case actions require a human executor/i,
  );

  const autonomous = openRealtyCase(
    {
      id: "case-autonomous-1",
      jurisdiction: "GR",
      caseType: "buyer_purchase",
      assetKind: "land",
      clientRef: "contact-2",
      propertyRef: "property-2",
      executionMode: "autonomous",
      mandate: mandate("mandate-2"),
      assuranceRef: "assurance://reliable-agents/profile-1",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:10:00.000Z" },
  );
  const autonomousFirstStep = autonomous.case.steps[0];
  const completed = appendRealtyCaseAction(
    {
      caseId: autonomous.case.id,
      action: "step_completed",
      stepKey: autonomousFirstStep.key,
      evidenceRefs: evidence(autonomousFirstStep),
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T09:10:00.000Z" },
  );
  assert.equal(completed.case.steps[0].status, "completed");
  assert.equal(completed.event.assurance_ref, "assurance://reliable-agents/profile-1");
  const retriedAgentStep = appendRealtyCaseAction(
    {
      id: completed.event.id,
      caseId: autonomous.case.id,
      action: "step_completed",
      stepKey: autonomousFirstStep.key,
      evidenceRefs: evidence(autonomousFirstStep),
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T09:11:00.000Z" },
  );
  assert.equal(retriedAgentStep.idempotent, true);

  assert.throws(
    () =>
      openRealtyCase(
        {
          id: "case-manual-1",
          jurisdiction: "BG",
          caseType: "buyer_purchase",
          assetKind: "land",
          clientRef: "contact-1",
          propertyRef: "listing-1",
          executionMode: "manual",
          mandate: mandate(),
          actor: "broker_bg",
          executorKind: "human",
        },
        { filePath, recordedAt: "2026-07-30T09:12:00.000Z" },
      ),
    /another realty case/,
  );
});

test("Bulgaria and Greece cases embed the applicable dated regulatory evidence workflow", () => {
  const filePath = ledger();
  const bulgariaLand = openRealtyCase(
    {
      id: "case-bg-land",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "land",
      clientRef: "buyer-bg",
      propertyRef: "land-bg",
      executionMode: "manual",
      mandate: mandate("mandate-bg-land"),
      actor: "broker_bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:01:00.000Z" },
  ).case;
  const greeceStr = openRealtyCase(
    {
      id: "case-gr-str",
      jurisdiction: "GR",
      caseType: "short_term_rental",
      assetKind: "residential",
      clientRef: "owner-gr",
      propertyRef: "str-gr",
      executionMode: "autonomous",
      mandate: mandate("mandate-gr-str"),
      assuranceRef: "assurance://reliable-agents/profile-1",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:02:00.000Z" },
  ).case;

  assert.equal(bulgariaLand.workflow_version, REALTY_WORKFLOW_VERSION);
  assert.ok(bulgariaLand.steps.some((row) => row.key === "bg_regulatory_snapshot" && !row.optional));
  assert.ok(bulgariaLand.steps.some((row) => row.key === "bg_foreign_land_eligibility" && row.optional));
  assert.ok(bulgariaLand.steps.some((row) => row.key === "bg_property_register_entry"));
  assert.equal(bulgariaLand.steps.some((row) => row.key.startsWith("gr_")), false);

  assert.ok(greeceStr.steps.some((row) => row.key === "gr_str_registry_eligibility"));
  assert.ok(greeceStr.steps.some((row) => row.key === "gr_ama_registration"));
  assert.ok(greeceStr.steps.some((row) => row.key === "gr_str_safety_compliance"));
  assert.ok(greeceStr.steps.some((row) => row.key === "gr_short_stay_declaration"));
  assert.equal(greeceStr.steps.some((row) => row.key === "gr_cadastre_registration_result"), false);

  for (const caseRecord of [bulgariaLand, greeceStr]) {
    for (const caseStep of caseRecord.steps) {
      for (const ruleRef of caseStep.rule_refs || []) assert.ok(REALTY_RULE_SOURCES[ruleRef]);
    }
  }
});

test("autonomous agents can close a complete case but cannot bypass phase or external-evidence gates", () => {
  const filePath = ledger();
  const opened = openRealtyCase(
    {
      id: "case-autonomous-close",
      jurisdiction: "BG",
      caseType: "seller_sale",
      assetKind: "commercial",
      clientRef: "contact-seller",
      propertyRef: "property-commercial",
      executionMode: "autonomous",
      mandate: mandate("mandate-seller"),
      assuranceRef: "assurance://reliable-agents/profile-1",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
  const laterPhaseStep = opened.case.steps.find((step) => step.phase !== opened.case.steps[0].phase);
  assert.throws(
    () =>
      appendRealtyCaseAction(
        {
          caseId: opened.case.id,
          action: "step_completed",
          stepKey: laterPhaseStep.key,
          evidenceRefs: evidence(laterPhaseStep),
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, recordedAt: "2026-07-30T08:10:00.000Z" },
      ),
    /earlier phases must be resolved/,
  );

  let at = Date.parse("2026-07-30T09:00:00.000Z");
  for (const step of opened.case.steps) {
    at += 60_000;
    const input = {
      caseId: opened.case.id,
      action: step.optional ? "step_not_applicable" : "step_completed",
      stepKey: step.key,
      actor: "trusted-agent-1",
      executorKind: "agent",
      ...(step.optional
        ? { authorityRef: `authority-${step.key}`, reasonCode: "not_required_for_this_case" }
        : { evidenceRefs: evidence(step) }),
    };
    appendRealtyCaseAction(input, { filePath, recordedAt: new Date(at).toISOString() });
  }
  at += 60_000;
  const closed = appendRealtyCaseAction(
    {
      caseId: opened.case.id,
      action: "case_closed",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: new Date(at).toISOString() },
  );
  assert.equal(closed.case.status, "closed");
  assert.equal(closed.case.progress_percent, 100);
  assert.equal(closed.case.steps.every((step) => ["completed", "not_applicable"].includes(step.status)), true);
  assert.equal(assertRealtyCaseEvents(readRealtyCaseEvents(filePath)), true);
});

test("case mode changes, freeze controls, and idempotent event retries remain attributable", () => {
  const filePath = ledger();
  openRealtyCase(
    {
      id: "case-switch-1",
      jurisdiction: "GR",
      caseType: "tenant_rental",
      assetKind: "residential",
      clientRef: "tenant-1",
      propertyRef: "rental-1",
      executionMode: "manual",
      mandate: mandate("mandate-tenant"),
      actor: "broker_gr",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
  const switched = appendRealtyCaseAction(
    {
      id: "case-switch-event",
      caseId: "case-switch-1",
      action: "mode_changed",
      executionMode: "autonomous",
      assuranceRef: "assurance://reliable-agents/profile-1",
      mandate: mandate("mandate-tenant-autonomous"),
      authorityRef: "client-instruction-1",
      actor: "broker_gr",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  assert.equal(switched.case.execution_mode, "autonomous");

  const retried = appendRealtyCaseAction(
    {
      id: "case-switch-event",
      caseId: "case-switch-1",
      action: "mode_changed",
      executionMode: "autonomous",
      assuranceRef: "assurance://reliable-agents/profile-1",
      mandate: mandate("mandate-tenant-autonomous"),
      authorityRef: "client-instruction-1",
      actor: "broker_gr",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:06:00.000Z" },
  );
  assert.equal(retried.idempotent, true);
  assert.throws(
    () =>
      appendRealtyCaseAction(
        {
          id: "case-switch-event",
          caseId: "case-switch-1",
          action: "mode_changed",
          executionMode: "autonomous",
          assuranceRef: "assurance://reliable-agents/profile-1",
          mandate: { ...mandate("mandate-tenant-autonomous"), capabilities: ["case:case_frozen"] },
          authorityRef: "client-instruction-1",
          actor: "broker_gr",
          executorKind: "human",
        },
        { filePath, recordedAt: "2026-07-30T08:06:30.000Z" },
      ),
    /another action/,
  );

  const frozen = appendRealtyCaseAction(
    {
      caseId: "case-switch-1",
      action: "case_frozen",
      authorityRef: "client-freeze-1",
      reasonCode: "client_requested_pause",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:07:00.000Z" },
  );
  assert.equal(frozen.case.status, "frozen");
  assert.throws(
    () =>
      appendRealtyCaseAction(
        {
          caseId: "case-switch-1",
          action: "step_completed",
          stepKey: frozen.case.steps[0].key,
          evidenceRefs: evidence(frozen.case.steps[0]),
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, recordedAt: "2026-07-30T08:08:00.000Z" },
      ),
    /frozen case must be resumed/,
  );

  const queue = buildRealtyCaseQueue(readRealtyCaseEvents(filePath), {
    now: "2026-07-30T08:10:00.000Z",
  });
  assert.equal(queue.summary.frozen, 1);
  assert.equal(queue.rows[0].next_steps.length > 0, true);
});
