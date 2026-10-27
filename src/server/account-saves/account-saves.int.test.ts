import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personalSavedListings, savedSelectionTransfers } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { caseFixture } from "../cases/testing";
import { getEnv } from "../config/env";
import { ownClientWorkflowData } from "../privacy/client-workflow-sources";
import { createListingFixture, publishForTest } from "../publication/testing";
import { newShareCreatorSession } from "../shares/public";
import {
  confirmSavedTransfer,
  createSavedTransfer,
  listPersonalSaves,
  reviewSavedTransfer,
  savedTransferLifetime,
  validateSavedHandoff,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("C05 body-only transfer reviews current account, preserves existing saves and unions once without Case/Interest side effects", async () => {
  const f = await caseFixture(t.db),
    first = await createListingFixture(t.db, { reviewerId: f.staff.id }),
    second = await createListingFixture(t.db, { reviewerId: f.staff.id }),
    unavailable = await createListingFixture(t.db, { reviewerId: f.staff.id });
  await publishForTest(t.db, f.staff.actor, first);
  await publishForTest(t.db, f.staff.actor, second);
  await t.db
    .insert(personalSavedListings)
    .values({ principalId: f.client.id, listingId: first.listingId });
  const creator = newShareCreatorSession(),
    input = {
      locale: "bg" as const,
      references: [first.reference, second.reference, unavailable.reference],
      operationId: randomUUID(),
    };
  const transfer = await createSavedTransfer(t.db, creator, input, "127.0.0.73");
  expect(await createSavedTransfer(t.db, creator, input, "127.0.0.73")).toEqual(transfer);
  expect(transfer.target).toBe(`${getEnv().hosts.client}/bg/saved/handoff`);
  await expect(
    validateSavedHandoff(t.db, transfer.nonce, "https://foreign.example", transfer.target),
  ).rejects.toMatchObject({ code: "not_found" });
  await validateSavedHandoff(t.db, transfer.nonce, getEnv().hosts.public, transfer.target);
  const review = await reviewSavedTransfer(t.db, f.client.session, transfer.nonce, "bg");
  expect(review.consumed).toBe(false);
  expect(
    review.items.map((item) => ({
      reference: item.reference,
      existing: item.existing,
      available: Boolean(item.card),
    })),
  ).toEqual([
    { reference: first.reference, existing: true, available: true },
    { reference: second.reference, existing: false, available: true },
    { reference: unavailable.reference, existing: false, available: false },
  ]);
  expect(await t.db.select().from(personalSavedListings)).toHaveLength(1);
  const operation = randomUUID(),
    result = await confirmSavedTransfer(t.db, f.client.session, transfer.nonce, operation, "bg");
  expect(result.outcome).toEqual({ added: 1, existing: 1, unavailable: 1 });
  expect(
    (await confirmSavedTransfer(t.db, f.client.session, transfer.nonce, operation, "bg")).replayed,
  ).toBe(true);
  expect(
    (await confirmSavedTransfer(t.db, f.client.session, transfer.nonce, randomUUID(), "bg"))
      .outcome,
  ).toEqual(result.outcome);
  expect(await listPersonalSaves(t.db, f.client.session, "bg")).toHaveLength(2);
  const other = await caseFixture(t.db);
  await expect(
    reviewSavedTransfer(t.db, other.client.session, transfer.nonce, "bg"),
  ).rejects.toMatchObject({ code: "not_found" });
  const data = await ownClientWorkflowData(t.db, [f.client.id]);
  expect(data.personalSaves).toHaveLength(2);
  expect(data.savedTransfers).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain(transfer.nonce);
  expect(JSON.stringify(data)).not.toMatch(/nonceHash|creatorSessionHash/);
  const stored = (
    await t.db
      .select()
      .from(savedSelectionTransfers)
      .where(eq(savedSelectionTransfers.id, review.id))
  )[0];
  expect(stored?.nonceHash).not.toBe(transfer.nonce);
});
it("C05 rejects expired and overlarge selection batches without truncation or automatic merge", async () => {
  const creator = newShareCreatorSession();
  await expect(
    createSavedTransfer(
      t.db,
      creator,
      {
        locale: "bg",
        references: Array.from({ length: 101 }, (_, i) => `MS-${String(i).padStart(5, "0")}`),
        operationId: randomUUID(),
      },
      "127.0.0.74",
    ),
  ).rejects.toMatchObject({ code: "validation_failed" });
  const transfer = await createSavedTransfer(
    t.db,
    creator,
    { locale: "bg", references: ["MS-99999"], operationId: randomUUID() },
    "127.0.0.74",
  );
  await t.db
    .update(savedSelectionTransfers)
    .set({
      createdAt: new Date(Date.now() - 2 * 3600000),
      expiresAt: new Date(Date.now() - 3600000),
    })
    .where(
      eq(savedSelectionTransfers.nonceHash, (await import("../crypto")).sha256Hex(transfer.nonce)),
    );
  await expect(
    validateSavedHandoff(t.db, transfer.nonce, getEnv().hosts.public, transfer.target),
  ).rejects.toMatchObject({ code: "not_found" });
});

it("C05 a pruned expired nonce cannot be revived by reusing the old logical key", async () => {
  const creator = newShareCreatorSession(),
    input = { locale: "bg" as const, references: ["MS-99998"], operationId: randomUUID() },
    now = new Date();
  const old = await createSavedTransfer(
    t.db,
    creator,
    input,
    "127.0.0.76",
    new Date(now.getTime() - 31 * 60_000),
  );
  await expect(
    validateSavedHandoff(t.db, old.nonce, getEnv().hosts.public, old.target),
  ).rejects.toMatchObject({ code: "not_found" });
  const fresh = await createSavedTransfer(t.db, creator, input, "127.0.0.76", now);
  expect(fresh.nonce).not.toBe(old.nonce);
  await expect(
    validateSavedHandoff(t.db, old.nonce, getEnv().hosts.public, old.target),
  ).rejects.toMatchObject({ code: "not_found" });
  await validateSavedHandoff(t.db, fresh.nonce, getEnv().hosts.public, fresh.target);
});
it("C05 recovers the original still-valid capability across an expiry epoch boundary", async () => {
  const creator = newShareCreatorSession(),
    input = { locale: "bg" as const, references: ["MS-99997"], operationId: randomUUID() },
    boundary = Math.ceil(Date.now() / savedTransferLifetime) * savedTransferLifetime;
  const first = await createSavedTransfer(
    t.db,
    creator,
    input,
    "127.0.0.77",
    new Date(boundary - 1000),
  );
  expect(
    await createSavedTransfer(t.db, creator, input, "127.0.0.77", new Date(boundary + 1000)),
  ).toEqual(first);
  await expect(
    createSavedTransfer(
      t.db,
      creator,
      { ...input, references: ["MS-99996"] },
      "127.0.0.77",
      new Date(boundary + 1000),
    ),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
});
