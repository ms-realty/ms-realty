import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyTimeZone } from "@/config/tenant";
import {
  auditEvents,
  caseCompletions,
  caseParticipants,
  casePathSteps,
  caseStageHistory,
  cases,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { calendarDate } from "@/domain/deal-path";
import { recordProposalDecision } from "../proposals/service";
import {
  prepareProposalAgreement,
  proposalCounterparty,
  proposalFixture,
  publishProposalForTest,
} from "../proposals/testing";
import { casePath, completeDealFromPath, recordPathStep } from "./path";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const today = () => calendarDate(new Date(), agencyTimeZone);
const caseVersion = async (id: string) =>
  (await t.db.select({ version: cases.version }).from(cases).where(eq(cases.id, id)))[0]?.version ??
  0;
const step = (
  id: string,
  expectedVersion: number,
  stepKey: string,
  action: "done" | "skip" | "reopen" | "expect",
  extra: Partial<{
    date: string;
    clientNote: string;
    internalNote: string;
    reason: string;
    evidenceVersionId: string;
  }> = {},
) => ({
  id,
  expectedVersion,
  operationId: randomUUID(),
  stepKey,
  action,
  date: "",
  clientNote: "",
  internalNote: "",
  reason: "",
  evidenceVersionId: "",
  ...extra,
});

/** A buyer Deal whose proposal both parties agreed through the real decision command. */
async function agreedDeal() {
  const f = await proposalFixture(t.db);
  const seller = await proposalCounterparty(t.db, f);
  await publishProposalForTest(t.db, f);
  await prepareProposalAgreement(t.db, f);
  const decision = {
    id: f.proposal.id,
    revisionId: f.revision.id,
    state: "agreed_for_next_step" as const,
    reason: "Synthetic exact-terms agreement",
  };
  await recordProposalDecision(t.db, f.client.session, {
    ...decision,
    expectedVersion: 3,
    operationId: randomUUID(),
  });
  await recordProposalDecision(t.db, seller.session, {
    ...decision,
    expectedVersion: 4,
    operationId: randomUUID(),
  });
  return { ...f, seller };
}

async function closeIntakeTasks(caseId: string) {
  await t.db
    .update(tasks)
    .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
    .where(eq(tasks.caseId, caseId));
}

describe("Deal path (ADR 0013)", () => {
  it("records the template's steps when terms are agreed and shows the client only their view", async () => {
    const f = await agreedDeal();
    const rows = await t.db
      .select()
      .from(casePathSteps)
      .where(eq(casePathSteps.caseId, f.record.id));
    expect(rows.map((r) => [r.template, r.position, r.stepKey, r.state])).toEqual(
      [
        "identity_checks",
        "deposit_preliminary_contract",
        "property_checks",
        "funds_ready",
        "notary_deed",
        "registration",
        "keys_handed_over",
      ].map((key, position) => ["BG.sale", position, key, "pending"]),
    );
    const client = await casePath(t.db, f.client.session, f.record.id);
    expect(client?.recorded).toBe(true);
    expect(client?.steps.map((s) => [s.key, s.status])).toEqual([
      ["request_received", "done"],
      ["needs_agreed", "not_recorded"],
      ["homes_shortlisted", "done"],
      ["viewings", "not_recorded"],
      ["terms_agreed", "done"],
      ["identity_checks", "current"],
      ["deposit_preliminary_contract", "next"],
      ["property_checks", "upcoming"],
      ["funds_ready", "upcoming"],
      ["notary_deed", "upcoming"],
      ["registration", "upcoming"],
      ["keys_handed_over", "upcoming"],
    ]);
    expect(client?.canRecord).toBe(false);
    expect(client?.evidenceOptions).toEqual([]);

    const version = await caseVersion(f.record.id);
    await recordPathStep(
      t.db,
      f.staff.session,
      step(f.record.id, version, "identity_checks", "done", {
        date: today(),
        clientNote: "Both passports checked at the office.",
        internalNote: "Copies in the restricted folder.",
      }),
    );
    const seen = await casePath(t.db, f.client.session, f.record.id);
    const checked = seen?.steps.find((s) => s.key === "identity_checks");
    expect(checked).toMatchObject({
      status: "done",
      doneAt: today(),
      clientNote: "Both passports checked at the office.",
    });
    expect(checked).not.toHaveProperty("internalNote");
    expect(JSON.stringify(seen)).not.toContain("restricted folder");
    expect(seen?.current).toBe("deposit_preliminary_contract");
    const staff = await casePath(t.db, f.staff.session, f.record.id);
    expect(staff?.steps.find((s) => s.key === "identity_checks")?.internalNote).toBe(
      "Copies in the restricted folder.",
    );
    expect(staff?.canRecord).toBe(true);
    expect(staff?.canComplete).toBe(false);
    expect(staff?.completionBlocked).toBe("steps_open");
  });

  it("is idempotent per operation, refuses a stale version and allows only valid step moves", async () => {
    const f = await caseFixture(t.db);
    const before = await casePath(t.db, f.staff.session, f.record.id);
    expect(before).toMatchObject({ recorded: false, template: "generic.sale" });
    const version = await caseVersion(f.record.id);
    // The first staff action records the path lazily, from the generic template here.
    const input = step(f.record.id, version, "contract_signed", "expect", { date: "2031-05-01" });
    const first = await recordPathStep(t.db, f.staff.session, input);
    const replay = await recordPathStep(t.db, f.staff.session, input);
    expect(replay.outcome).toEqual(first.outcome);
    expect(replay.replayed).toBe(true);
    expect(await caseVersion(f.record.id)).toBe(version + 1);
    const stored = await t.db
      .select()
      .from(casePathSteps)
      .where(eq(casePathSteps.caseId, f.record.id));
    expect(stored.map((s) => s.stepKey)).toEqual([
      "identity_checks",
      "contract_signed",
      "keys_handed_over",
    ]);
    expect(stored.find((s) => s.stepKey === "contract_signed")?.expectedOn).toBe("2031-05-01");
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, version, "identity_checks", "done", { date: today() }),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const current = version + 1;
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, current, "identity_checks", "done", { date: "2999-01-01" }),
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      recordPathStep(t.db, f.staff.session, step(f.record.id, current, "identity_checks", "skip")),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, current, "identity_checks", "reopen", { reason: "Not done yet" }),
      ),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, current, "not_a_step", "done", { date: today() }),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await recordPathStep(
      t.db,
      f.staff.session,
      step(f.record.id, current, "identity_checks", "skip", {
        reason: "Checked on the previous deal with the same people",
      }),
    );
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, current + 1, "identity_checks", "done", { date: today() }),
      ),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await recordPathStep(
      t.db,
      f.staff.session,
      step(f.record.id, current + 1, "identity_checks", "reopen", {
        reason: "The client asked for a fresh check",
      }),
    );
    const [reopened] = await t.db
      .select()
      .from(casePathSteps)
      .where(
        and(eq(casePathSteps.caseId, f.record.id), eq(casePathSteps.stepKey, "identity_checks")),
      );
    expect(reopened).toMatchObject({ state: "pending", skipReason: null, doneOn: null });
    const audit = await t.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.recordId, f.record.id));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["case.path.expect", "case.path.skip", "case.path.reopen"]),
    );
  });

  it("keeps clients to their own Deals and staff commands away from clients", async () => {
    const f = await caseFixture(t.db);
    const other = await caseFixture(t.db);
    await expect(casePath(t.db, other.client.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(casePath(t.db, f.client.session, randomUUID())).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      recordPathStep(
        t.db,
        f.client.session,
        step(f.record.id, await caseVersion(f.record.id), "identity_checks", "done", {
          date: today(),
        }),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      completeDealFromPath(t.db, f.client.session, {
        id: f.record.id,
        expectedVersion: await caseVersion(f.record.id),
        operationId: randomUUID(),
        completedOn: today(),
        registryReference: "",
        evidenceVersionId: "",
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // A revoked participant is a non-participant: the Deal is not found, not forbidden.
    expect(await casePath(t.db, f.client.session, f.record.id)).not.toBeNull();
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    await expect(casePath(t.db, f.client.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("completes the Deal from its path and closes the Case with a structured outcome", async () => {
    const f = await agreedDeal();
    const complete = async (expectedVersion: number) =>
      completeDealFromPath(t.db, f.staff.session, {
        id: f.record.id,
        expectedVersion,
        operationId: randomUUID(),
        completedOn: today(),
        registryReference: "Synthetic entry 2026/123",
        evidenceVersionId: "",
        reviewed: true,
      });
    await expect(complete(await caseVersion(f.record.id))).rejects.toMatchObject({
      code: "transition_denied",
    });
    const keys = [
      "identity_checks",
      "deposit_preliminary_contract",
      "property_checks",
      "funds_ready",
      "notary_deed",
      "registration",
      "keys_handed_over",
    ];
    for (const key of keys)
      await recordPathStep(
        t.db,
        f.staff.session,
        key === "funds_ready"
          ? step(f.record.id, await caseVersion(f.record.id), key, "skip", {
              reason: "Cash buyer; funds shown at the preliminary contract",
            })
          : step(f.record.id, await caseVersion(f.record.id), key, "done", { date: today() }),
      );
    expect((await casePath(t.db, f.staff.session, f.record.id))?.canComplete).toBe(true);
    // An open commitment blocks completion exactly as it blocks the existing close flow.
    await expect(complete(await caseVersion(f.record.id))).rejects.toMatchObject({
      code: "transition_denied",
    });
    await closeIntakeTasks(f.record.id);
    const done = await complete(await caseVersion(f.record.id));
    const [row] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
    expect(row).toMatchObject({
      disposition: "closed",
      stage: "completed",
      closureOutcome: "deal_completed",
      dispositionReason: "Deal path completed",
    });
    const [completion] = await t.db
      .select()
      .from(caseCompletions)
      .where(eq(caseCompletions.caseId, f.record.id));
    expect(completion).toMatchObject({
      id: done.outcome.completionId,
      template: "BG.sale",
      completedOn: today(),
      registryReference: "Synthetic entry 2026/123",
      recordedById: f.staff.id,
    });
    const [history] = await t.db
      .select()
      .from(caseStageHistory)
      .where(
        and(eq(caseStageHistory.caseId, f.record.id), eq(caseStageHistory.toStage, "completed")),
      );
    expect(history?.evidence).toMatchObject({
      kind: "deal_path_completed",
      toDisposition: "closed",
      completionId: completion?.id,
    });
    const client = await casePath(t.db, f.client.session, f.record.id);
    expect(client?.completion).toEqual({
      completedOn: today(),
      registryReference: "Synthetic entry 2026/123",
    });
    expect(client?.steps.find((s) => s.key === "funds_ready")?.status).toBe("skipped");
    expect(client?.current).toBeNull();
    await expect(
      recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, row?.version ?? 0, "keys_handed_over", "reopen", { reason: "Closed" }),
      ),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });

  it("refuses completion when the final step was marked not needed", async () => {
    const f = await agreedDeal();
    await closeIntakeTasks(f.record.id);
    const steps = await t.db
      .select()
      .from(casePathSteps)
      .where(eq(casePathSteps.caseId, f.record.id));
    for (const s of steps.sort((a, b) => a.position - b.position))
      await recordPathStep(
        t.db,
        f.staff.session,
        step(f.record.id, await caseVersion(f.record.id), s.stepKey, "skip", {
          reason: "Synthetic skip",
        }),
      );
    const path = await casePath(t.db, f.staff.session, f.record.id);
    expect(path).toMatchObject({ canComplete: false, completionBlocked: "final_step_open" });
    await expect(
      completeDealFromPath(t.db, f.staff.session, {
        id: f.record.id,
        expectedVersion: await caseVersion(f.record.id),
        operationId: randomUUID(),
        completedOn: today(),
        registryReference: "",
        evidenceVersionId: "",
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
});
