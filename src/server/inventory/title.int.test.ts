import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listingRevisions, listings } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createStaff } from "../testing";
import { createListingDraft, freezeListingDraft, saveListingDraft } from "./commands";
import { emptyDraft } from "./contracts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("O12 persists, hashes and freezes the same single-line title", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const draft = {
    ...emptyDraft,
    title: "Начална синтетична чернова",
    description: "Синтетичен тестов имот.\nНе е реална оферта.",
    sourceReference: "synthetic-source-record",
  };
  const created = await createListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      propertyType: "apartment",
      purpose: "sale",
      country: "BG",
      region: "Благоевград",
      settlement: "Сандански",
      exactAddress: "",
      draft,
    },
  });
  const title = "Синтетичен апартамент в Сандански";
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: created.outcome.version,
    reference: created.outcome.reference,
    draft: { ...draft, title: "Синтетичен\r\n\nапартамент\u2028в\u2029Сандански" },
  };
  const saved = await saveListingDraft(t.db, command);
  const replay = await saveListingDraft(t.db, {
    ...command,
    draft: { ...draft, title },
  });
  expect(replay.replayed).toBe(true);
  expect(replay.outcome).toEqual(saved.outcome);
  const [listing] = await t.db
    .select()
    .from(listings)
    .where(eq(listings.reference, command.reference));
  expect(listing?.draft).toEqual({ ...draft, title });
  expect(listing?.version).toBe(saved.outcome.version);
  const frozen = await freezeListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: saved.outcome.version,
    reference: command.reference,
  });
  const [revision] = await t.db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, frozen.outcome.revisionId));
  expect(revision?.sourceCopy).toMatchObject({ text: { title, description: draft.description } });
});
