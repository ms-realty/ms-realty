// B10 / AT10 / AT40: actual ordinary contact scopes before the native paginated chooser.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { caseParticipants, grants, inquiries, parties, passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "@/server/auth/sessions";
import { nextReference } from "@/server/references";
import { createCase, createStaff } from "@/server/testing";
import { partnerChoices, readPartnerChoice } from "./partner-picker";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function staff() {
  const person = await createStaff(t.db);
  await t.db.insert(passkeys).values({
    principalId: person.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
async function contact(name: string, ownerId: string, permitted = true) {
  const [party] = await t.db
    .insert(parties)
    .values({ kind: "person", displayName: name })
    .returning();
  if (!party) throw new Error("Missing synthetic party");
  const [inquiry] = await t.db
    .insert(inquiries)
    .values({
      reference: await nextReference(t.db, "inquiry"),
      purpose: "question",
      source: "website",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-picker",
      partyId: party.id,
      ownerId,
      message: "Synthetic scoped contact only",
    })
    .returning();
  if (!inquiry) throw new Error("Missing synthetic inquiry");
  if (permitted)
    await t.db.insert(grants).values({
      principalId: ownerId,
      capability: "inquiry.read",
      recordType: "inquiry",
      recordId: inquiry.id,
      reason: "Synthetic exact inquiry scope",
    });
  return party;
}
it("reaches a permitted party beyond page one while keeping an unreadable contact out", async () => {
  const broker = await staff();
  for (let index = 0; index < 31; index++)
    await contact(`A-${String(index).padStart(2, "0")}`, broker.id);
  const target = await contact("Z-Synthetic selected partner", broker.id),
    unreadable = await contact("A-Unreadable", broker.id, false);
  const first = await partnerChoices(t.db, broker.session, 1);
  expect(first.rows).toHaveLength(30);
  expect(first.hasMore).toBe(true);
  expect(first.rows.some((row) => row.id === target.id || row.id === unreadable.id)).toBe(false);
  const later = await partnerChoices(t.db, broker.session, 2);
  expect(later.rows.map((row) => row.id)).toContain(target.id);
  expect(later.hasMore).toBe(false);
  expect(await readPartnerChoice(t.db, broker.session, target.id)).toEqual({
    id: target.id,
    name: target.displayName,
  });
  await expect(readPartnerChoice(t.db, broker.session, unreadable.id)).rejects.toMatchObject({
    code: "not_found",
  });
});
it("keeps paging through held merged originals without revealing or following a canonical party", async () => {
  const broker = await staff();
  const [canonical] = await t.db
    .insert(parties)
    .values({ kind: "person", displayName: "Synthetic canonical identity" })
    .returning();
  if (!canonical) throw new Error("Missing canonical fixture");
  let original = "";
  for (let index = 0; index < 30; index++) {
    const party = await contact(`A-Merged-${String(index).padStart(2, "0")}`, broker.id);
    original = party.id;
    await t.db
      .update(parties)
      .set({ mergedIntoPartyId: canonical.id })
      .where(eq(parties.id, party.id));
  }
  const target = await contact("Z-Permitted later party", broker.id);
  expect(await partnerChoices(t.db, broker.session, 1)).toMatchObject({
    rows: [],
    page: 1,
    hasMore: true,
  });
  expect((await partnerChoices(t.db, broker.session, 2)).rows.map((row) => row.id)).toEqual([
    target.id,
  ]);
  for (const id of [original, canonical.id, randomUUID()])
    await expect(readPartnerChoice(t.db, broker.session, id)).rejects.toMatchObject({
      code: "not_found",
    });
});
it("reuses exact Case authority for a participant without inventing a contact or consumer Case", async () => {
  const broker = await staff(),
    caseId = await createCase(t.db, broker.id);
  await t.db.insert(grants).values({
    principalId: broker.id,
    capability: "case.read",
    recordType: "case",
    recordId: caseId,
    reason: "Synthetic exact Case scope",
  });
  const [party] = await t.db
    .insert(parties)
    .values({ kind: "organization", displayName: "Synthetic Case counterparty" })
    .returning();
  if (!party) throw new Error("Missing Case-only party");
  const [link] = await t.db
    .insert(caseParticipants)
    .values({ caseId, partyId: party.id, role: "seller" })
    .returning();
  if (!link) throw new Error("Missing participant");
  expect((await partnerChoices(t.db, broker.session, 1, caseId)).caseChoices).toEqual([
    { id: party.id, name: party.displayName },
  ]);
  await expect(readPartnerChoice(t.db, broker.session, party.id)).rejects.toMatchObject({
    code: "not_found",
  });
  await t.db
    .update(caseParticipants)
    .set({ revokedAt: new Date() })
    .where(eq(caseParticipants.id, link.id));
  expect((await partnerChoices(t.db, broker.session, 1, caseId)).caseChoices).toEqual([]);
  await expect(readPartnerChoice(t.db, broker.session, party.id, caseId)).rejects.toMatchObject({
    code: "not_found",
  });
});
