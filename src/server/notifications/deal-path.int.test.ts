// ADR 0014 on the Deal path (ADR 0013): a client-visible step marked done tells the client once,
// in their language, with the step's catalog label; skipping or reopening sends nothing; and a
// completed Deal tells the client once.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { agencyTimeZone } from "@/config/tenant";
import { casePathSteps, cases, externalActions, parties, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { calendarDate } from "@/domain/deal-path";
import { completeDealFromPath, recordPathStep } from "../cases/path";
import { getEnv } from "../config/env";
import type { OutboundMessage } from "../jobs/provider";
import { recordProposalDecision } from "../proposals/service";
import {
  prepareProposalAgreement,
  proposalCounterparty,
  proposalFixture,
  publishProposalForTest,
} from "../proposals/testing";
import { dealStepLabels } from "./deal-path";
import { dealNoticeSubject, dealNoticeTemplate } from "./events";
import { renderDealNotice } from "./template";
import { serviceEmailChoice } from "./testing";

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
  action: "done" | "skip" | "reopen",
) => ({
  id,
  expectedVersion,
  operationId: randomUUID(),
  stepKey,
  action,
  date: action === "done" ? today() : "",
  clientNote: "",
  internalNote: "Synthetic internal note",
  reason: action === "done" ? "" : "Synthetic reason",
  evidenceVersionId: "",
});
async function notices(caseId: string) {
  return t.db
    .select()
    .from(externalActions)
    .where(
      and(
        eq(externalActions.subjectType, dealNoticeSubject),
        eq(externalActions.subjectId, caseId),
      ),
    )
    .orderBy(externalActions.createdAt, externalActions.id);
}
const params = (row: typeof externalActions.$inferSelect) =>
  (
    row.payload as {
      params: {
        event: string;
        step?: string;
        locale: string;
        recipient: { partyId?: string; id?: string };
      };
    }
  ).params;
const to = (partyId: string) => (row: typeof externalActions.$inferSelect) =>
  (params(row).recipient.partyId ?? params(row).recipient.id) === partyId;
function text(row: typeof externalActions.$inferSelect) {
  const payload = row.payload as { recipient: string; params: Record<string, unknown> };
  const message: OutboundMessage = {
    outboxId: row.id,
    idempotencyKey: row.effectKey,
    channel: "email",
    recipient: payload.recipient,
    template: dealNoticeTemplate,
    params: payload.params,
    secretParams: null,
  };
  return renderDealNotice(message, { hosts: getEnv().hosts })?.text ?? "";
}

it("tells the client about done steps in their language, never about skips or reopenings, and once about completion", async () => {
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
  await serviceEmailChoice(t.db, f.client.partyId);
  await t.db.update(parties).set({ preferredLocale: "ru" }).where(eq(parties.id, f.client.partyId));
  const before = (await notices(f.record.id)).length;
  const rows = await t.db
    .select()
    .from(casePathSteps)
    .where(eq(casePathSteps.caseId, f.record.id))
    .orderBy(casePathSteps.position);
  const visible = rows.filter((row) => row.clientVisible).map((row) => row.stepKey);
  const hidden = rows.filter((row) => !row.clientVisible).map((row) => row.stepKey);
  const [first, second] = visible;
  if (!first || !second) throw new Error("Fixture has too few client-visible steps");

  const run = (key: string, action: "done" | "skip" | "reopen") =>
    caseVersion(f.record.id).then((v) =>
      recordPathStep(t.db, f.staff.session, step(f.record.id, v, key, action)),
    );
  const stepNotices = async () =>
    (await notices(f.record.id))
      .slice(before)
      .filter((r) => params(r).event === "deal.step_done" && to(f.client.partyId)(r));

  await run(first, "done");
  const sent = await stepNotices();
  expect(sent).toHaveLength(1);
  expect(params(sent[0] as (typeof sent)[number])).toMatchObject({
    locale: "ru",
    step: dealStepLabels(first).ru,
  });
  expect(text(sent[0] as (typeof sent)[number])).toContain(
    `Выполнено: ${dealStepLabels(first).ru}`,
  );
  expect(JSON.stringify(sent)).not.toContain("Synthetic internal note");

  await run(second, "skip");
  await run(first, "reopen");
  expect(await stepNotices()).toHaveLength(1);
  await run(first, "done");
  expect(await stepNotices()).toHaveLength(2);
  for (const key of hidden) await run(key, "done");
  expect(await stepNotices()).toHaveLength(2);

  // Finish the path (the final step must be done) and complete the Deal.
  for (const row of await t.db
    .select()
    .from(casePathSteps)
    .where(eq(casePathSteps.caseId, f.record.id))
    .orderBy(casePathSteps.position))
    if (row.state === "pending") await run(row.stepKey, "done");
  await t.db
    .update(tasks)
    .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
    .where(eq(tasks.caseId, f.record.id));
  await completeDealFromPath(t.db, f.staff.session, {
    id: f.record.id,
    expectedVersion: await caseVersion(f.record.id),
    operationId: randomUUID(),
    completedOn: today(),
    registryReference: "Synthetic entry",
    evidenceVersionId: "",
    reviewed: true,
  });
  const completed = (await notices(f.record.id)).filter(
    (r) => params(r).event === "deal.completed" && to(f.client.partyId)(r),
  );
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ state: "queued" });
  expect(text(completed[0] as (typeof completed)[number])).toContain("Ваша сделка завершена");
});
