import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants, localizedRevisions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { approveListingRevision } from "../publication/commands";
import { createListingFixture } from "../publication/testing";
import { createStaff } from "../testing";
import { decideTranslation, saveTranslation, translationWorkbench } from "./translations";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const publisher = await createStaff(t.db, { roles: ["publishing_approver"] });
  const translator = await createStaff(t.db, {
    grants: [{ role: "translation_reviewer", locales: ["en"] }],
  });
  const listing = await createListingFixture(t.db, { reviewerId: publisher.id });
  await approveListingRevision(t.db, {
    actor: publisher.actor,
    operationId: randomUUID(),
    expectedRevision: 1,
    reference: listing.reference,
    revisionId: listing.revisionId,
  });
  const command = {
    actor: translator.actor,
    reference: listing.reference,
    sourceRevisionId: listing.revisionId,
    locale: "en" as const,
    operationId: randomUUID(),
    expectedRevision: 0,
    title: "Synthetic translated title",
    description: "Synthetic translation for a database test.",
  };
  return { publisher, translator, listing, command };
}
it("keeps draft, language review and publication separate; checks exact protected facts before approval", async () => {
  const { command } = await fixture();
  const saved = await saveTranslation(t.db, command);
  expect((await saveTranslation(t.db, command)).replayed).toBe(true);
  const submitted = await decideTranslation(t.db, {
    ...command,
    operationId: randomUUID(),
    expectedRevision: saved.outcome.version,
    intent: "submit",
    note: "Ready for language review",
  });
  await expect(
    decideTranslation(t.db, {
      ...command,
      operationId: randomUUID(),
      expectedRevision: submitted.outcome.version,
      intent: "approve",
      protectedFactsDigest: "wrong",
      note: "Reviewed text",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  const workbench = await translationWorkbench(t.db, command.actor, command.reference, "en");
  const approved = await decideTranslation(t.db, {
    ...command,
    operationId: randomUUID(),
    expectedRevision: submitted.outcome.version,
    intent: "approve",
    protectedFactsDigest: workbench.protectedFactsDigest,
    note: "Compared exact source facts",
  });
  expect(approved.outcome.state).toBe("approved_for_source");
  const [row] = await t.db
    .select()
    .from(localizedRevisions)
    .where(eq(localizedRevisions.id, saved.outcome.translationId));
  expect(row?.approvalId).toBeTruthy();
  expect(row?.reviewedFacts).toEqual({ protectedFactsDigest: workbench.protectedFactsDigest });
  await expect(
    saveTranslation(t.db, {
      ...command,
      operationId: randomUUID(),
      expectedRevision: approved.outcome.version,
      title: "Changed",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
});
it("resolves simultaneous edits with one saved draft and one revision conflict", async () => {
  const { command } = await fixture();
  const result = await Promise.allSettled([
    saveTranslation(t.db, command),
    saveTranslation(t.db, { ...command, operationId: randomUUID(), title: "Another draft" }),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(result.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "version_conflict" },
  });
});
it("enforces locale scope, current authority on replay and human review", async () => {
  const { command, translator } = await fixture();
  await expect(saveTranslation(t.db, { ...command, locale: "ru" })).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(
    saveTranslation(t.db, { ...command, actor: { kind: "ai_service", id: "hermes" } }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await saveTranslation(t.db, command);
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, translator.id));
  await expect(saveTranslation(t.db, command)).rejects.toMatchObject({ code: "forbidden" });
});
