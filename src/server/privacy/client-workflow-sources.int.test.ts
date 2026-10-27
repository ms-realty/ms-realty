import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  personalSavedListings,
  privacySafetyDecisions,
  savedSelectionTransfers,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { hashRequest, sha256Hex } from "../crypto";
import { runOperation } from "../operations";
import { createListingFixture } from "../publication/testing";
import { ownClientWorkflowData } from "./client-workflow-sources";
import { applyPrivacyErasure, readPrivacyErasureWorkbench } from "./erasure";
import {
  syntheticErasureDecisions,
  syntheticErasureFixture,
  syntheticErasurePolicy,
} from "./erasure-testing";
import { applyPrivacySafetyEffect } from "./safety-ledger";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("AT45 inventories own optional saves, deletes only approved IDs, and reapplies exact erasure after a synthetic restore", async () => {
  const f = await syntheticErasureFixture(t.db);
  await syntheticErasurePolicy(t.db, f);
  const property = await createListingFixture(t.db, { reviewerId: f.staff.id });
  const [saved] = await t.db
    .insert(personalSavedListings)
    .values({ principalId: f.client.id, listingId: property.listingId })
    .returning();
  await t.db
    .insert(personalSavedListings)
    .values({ principalId: f.other.id, listingId: property.listingId });
  const operation = await runOperation(
    t.db,
    {
      actor: { kind: "client", id: f.client.id },
      type: "synthetic.saved_merge",
      idempotencyKey: randomUUID(),
      requestHash: hashRequest({ synthetic: true }),
    },
    async () => ({ added: 1 }),
  );
  const [transfer] = await t.db
    .insert(savedSelectionTransfers)
    .values({
      nonceHash: sha256Hex(randomUUID()),
      creatorSessionHash: "synthetic-creator",
      sourceOrigin: "https://public.example.test",
      targetOrigin: "https://client.example.test",
      targetPath: "/bg/saved/handoff",
      listingReferences: [property.reference],
      expiresAt: new Date(Date.now() + 1800000),
      consumedAt: new Date(),
      consumedById: f.client.id,
      operationId: operation.operationId,
    })
    .returning();
  if (!saved || !transfer) throw new Error("Missing own saved fixture");
  const work = await readPrivacyErasureWorkbench(t.db, f.staffSession.session, f.request.id);
  expect(work.inventory.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: `saved:${saved.id}:selection`,
        category: "client_profile_copies",
        eligible: true,
      }),
      expect.objectContaining({
        key: `transfer:${transfer.id}:selection`,
        category: "client_profile_copies",
        eligible: true,
      }),
    ]),
  );
  expect(JSON.stringify(await ownClientWorkflowData(t.db, [f.client.id]))).not.toMatch(
    /nonceHash|creatorSessionHash/,
  );
  await applyPrivacyErasure(t.db, f.staffSession.session, {
    operationId: randomUUID(),
    requestId: f.request.id,
    expectedVersion: work.request.version,
    inventoryDigest: work.inventoryDigest,
    purposes: ["search_alerts", "marketing"],
    decisions: syntheticErasureDecisions(work.inventory, ["client_profile_copies"]),
    confirmed: true,
  });
  expect(
    await t.db
      .select()
      .from(personalSavedListings)
      .where(eq(personalSavedListings.principalId, f.client.id)),
  ).toHaveLength(0);
  expect(
    await t.db
      .select()
      .from(personalSavedListings)
      .where(eq(personalSavedListings.principalId, f.other.id)),
  ).toHaveLength(1);
  expect(
    await t.db
      .select()
      .from(savedSelectionTransfers)
      .where(eq(savedSelectionTransfers.id, transfer.id)),
  ).toHaveLength(0);
  const [decision] = await t.db
    .select()
    .from(privacySafetyDecisions)
    .where(eq(privacySafetyDecisions.requestId, f.request.id));
  if (!decision) throw new Error("Missing erasure effect");
  await t.db.insert(personalSavedListings).values(saved);
  await applyPrivacySafetyEffect(
    t.db,
    decision.effect as Parameters<typeof applyPrivacySafetyEffect>[1],
    decision.sequence,
    f.staffSession.session.actor,
  );
  expect(
    await t.db.select().from(personalSavedListings).where(eq(personalSavedListings.id, saved.id)),
  ).toHaveLength(0);
});
