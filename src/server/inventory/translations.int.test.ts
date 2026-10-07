import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants, localizedRevisions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { approveFactRevision, approveListingRevision } from "../publication/commands";
import { loadPublishedListings } from "../publication/presentation";
import { createListingFixture, publishLocales } from "../publication/testing";
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

it("O12 stores and publishes the same normalized translated title after human review", async () => {
  const { command, publisher, listing } = await fixture();
  const title = "Synthetic translated apartment in Sandanski";
  const description = "Synthetic translation.\nNot a real offer.";
  const input = {
    ...command,
    title: "  Synthetic\r\ntranslated\u0085apartment\u2028in\u2029Sandanski  ",
    description,
  };
  const saved = await saveTranslation(t.db, input);
  const [row] = await t.db
    .select()
    .from(localizedRevisions)
    .where(eq(localizedRevisions.id, saved.outcome.translationId));
  expect(row).toMatchObject({ title, body: { description }, state: "draft", approvalId: null });
  const replay = await saveTranslation(t.db, { ...input, title });
  expect(replay.replayed).toBe(true);
  expect(replay.outcome).toEqual(saved.outcome);
  expect(await loadPublishedListings(t.db, { ids: [listing.listingId] }, "en")).toEqual([]);

  const submitted = await decideTranslation(t.db, {
    ...command,
    operationId: randomUUID(),
    expectedRevision: saved.outcome.version,
    intent: "submit",
    note: "Ready for language review",
  });
  const workbench = await translationWorkbench(t.db, command.actor, command.reference, "en");
  await decideTranslation(t.db, {
    ...command,
    operationId: randomUUID(),
    expectedRevision: submitted.outcome.version,
    intent: "approve",
    protectedFactsDigest: workbench.protectedFactsDigest,
    note: "Compared exact source facts",
  });
  await approveFactRevision(t.db, {
    actor: publisher.actor,
    operationId: randomUUID(),
    expectedRevision: 1,
    factRevisionId: listing.factRevisionId,
    scope: "All synthetic fixture facts",
  });
  await publishLocales(t.db, publisher.actor, listing, ["en"]);
  const [published] = await loadPublishedListings(t.db, { ids: [listing.listingId] }, "en");
  expect(published).toMatchObject({ title, description, locale: "en" });
});

it("O12 retains translated title requirements and checks length after normalization", async () => {
  const { command } = await fixture();
  for (const title of [" \r\n\u0085\u2028\u2029 ", "a".repeat(181)]) {
    await expect(saveTranslation(t.db, { ...command, title })).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { title: expect.any(Array) },
    });
  }
  const saved = await saveTranslation(t.db, {
    ...command,
    title: `${"a".repeat(90)}\r\n${"b".repeat(89)}`,
  });
  const [row] = await t.db
    .select()
    .from(localizedRevisions)
    .where(eq(localizedRevisions.id, saved.outcome.translationId));
  expect(row?.title).toBe(`${"a".repeat(90)} ${"b".repeat(89)}`);
  expect(row?.title).toHaveLength(180);
});
