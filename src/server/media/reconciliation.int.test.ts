// O13/AT10/AT11: request-key readback remains scoped to its actor, listing and exact
// photo subject. Status reads never execute another command. Synthetic disposable data.
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grants, mediaRelations, operations, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { createListingFixture } from "../publication/testing";
import {
  mediaForListing,
  mediaOperationResult,
  placeMedia,
  reorderMedia,
  reviewMedia,
  saveMediaDetails,
} from "./commands";

let t: TestDatabase;
let staff: Awaited<ReturnType<typeof staffFixture>>;
let colleague: Awaited<ReturnType<typeof staffFixture>>;
beforeAll(async () => {
  t = await createTestDatabase();
  staff = await staffFixture(t.db);
  colleague = await staffFixture(t.db);
});
afterAll(async () => t?.drop());
const kinds = ["details", "review", "placement", "order"] as const;
type Kind = (typeof kinds)[number];
async function fixture(owner = staff) {
  const created = await createListingFixture(t.db, { reviewerId: owner.id, photos: 2 });
  return { ...created, ...(await mediaForListing(t.db, owner.session, created.reference)) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const typeOf = (kind: Kind) =>
  kind === "details" ? "media.details.save" : kind === "review" ? "media.review" : "media.place";
function subject(f: Fixture, kind: Kind) {
  return kind === "order"
    ? { resultType: "listing", resultId: f.listingId }
    : kind === "placement"
      ? { resultType: "media_relation", resultId: f.assets[0]?.relation.id }
      : { resultType: "media_asset", resultId: f.assets[0]?.asset.id };
}
async function record(
  f: Fixture,
  kind: Kind,
  status: "accepted" | "in_progress" | "outcome_unknown" | "succeeded",
) {
  const requestKey = randomUUID();
  await t.db.insert(operations).values({
    actorKind: staff.actor.kind,
    actorId: staff.id,
    operationType: typeOf(kind),
    idempotencyKey: requestKey,
    requestHash: "synthetic-pending-request",
    status,
    ...subject(f, kind),
  });
  return requestKey;
}
function read(
  f: Fixture,
  key: unknown,
  kind: unknown,
  placement = f.assets[0]?.relation.id,
  session = staff.session,
) {
  return mediaOperationResult(t.db, session, f.reference, key, kind, placement);
}
function execute(f: Fixture, kind: Kind, requestKey: string, stale = false) {
  const first = f.assets[0];
  if (!first) throw new Error("Missing synthetic photo");
  const command = {
    session: staff.session,
    operationId: requestKey,
    expectedRevision:
      (kind === "order" || kind === "placement" ? f.listing.version : first.asset.version) +
      Number(stale),
  };
  if (kind === "order")
    return reorderMedia(t.db, {
      ...command,
      reference: f.reference,
      order: f.assets.map((row) => row.relation.id).reverse(),
    });
  if (kind === "placement")
    return placeMedia(t.db, {
      ...command,
      reference: f.reference,
      relationId: first.relation.id,
      hidden: true,
    });
  const details = {
    caption: "Synthetic readback caption",
    altText: "Synthetic photo description",
    modification: "none",
    modificationDisclosure: "",
  };
  return kind === "details"
    ? saveMediaDetails(t.db, { ...command, id: first.asset.id, input: details })
    : reviewMedia(t.db, {
        ...command,
        id: first.asset.id,
        input: {
          ...details,
          decision: "reject",
          rightsHolder: "",
          rightsReference: "",
          privacyReviewed: false,
          rightsConfirmed: false,
        },
      });
}

describe("O13 typed media operation reconciliation", () => {
  it("separates missing requests from malformed keys, unknown types and absent placements", async () => {
    const f = await fixture();
    for (const kind of kinds) {
      const key = randomUUID();
      expect(await read(f, key, kind)).toEqual({
        requestKey: key,
        status: "missing",
        receipt: null,
      });
      for (const invalid of [undefined, null, "short", "x".repeat(161), {}])
        expect(await read(f, invalid, kind)).toBeNull();
    }
    expect(await read(f, randomUUID(), "document")).toBeNull();
    expect(await read(f, randomUUID(), "review", randomUUID())).toBeNull();
  });

  for (const kind of kinds) {
    it(`${kind}: reads each unresolved status without changing the command`, async () => {
      const f = await fixture();
      for (const state of ["accepted", "in_progress", "outcome_unknown"] as const) {
        const key = await record(f, kind, state);
        const before = await t.db
          .select()
          .from(operations)
          .where(eq(operations.idempotencyKey, key));
        expect(await read(f, key, kind)).toEqual({
          requestKey: key,
          status: "pending",
          receipt: null,
        });
        expect(
          await t.db.select().from(operations).where(eq(operations.idempotencyKey, key)),
        ).toEqual(before);
      }
      expect(await mediaForListing(t.db, staff.session, f.reference)).toEqual({
        listing: f.listing,
        assets: f.assets,
        identity: f.identity,
      });
    });

    it(`${kind}: reads a terminal failure only for its subject`, async () => {
      const f = await fixture();
      const other = await fixture();
      const key = randomUUID();
      await expect(execute(f, kind, key, true)).rejects.toMatchObject({ code: "version_conflict" });
      expect(await read(f, key, kind)).toEqual({
        requestKey: key,
        status: "failed",
        receipt: null,
      });
      expect(await read(other, key, kind)).toBeNull();
      if (kind !== "order") expect(await read(f, key, kind, f.assets[1]?.relation.id)).toBeNull();
    });

    it(`${kind}: resolves its own committed receipt and never invents one from a status row`, async () => {
      const f = await fixture();
      const key = randomUUID();
      const saved = await execute(f, kind, key);
      const result = await read(f, key, kind);
      expect(result).toMatchObject({
        requestKey: key,
        status: "succeeded",
        receipt: { id: saved.operationId },
      });
      expect(saved.operationId).not.toBe(key);
      const before = await t.db.select().from(operations).where(eq(operations.idempotencyKey, key));
      expect(await read(f, key, kind)).toEqual(result);
      expect(
        await t.db.select().from(operations).where(eq(operations.idempotencyKey, key)),
      ).toEqual(before);
      const other = await fixture();
      expect(await read(other, key, kind)).toBeNull();
      if (kind !== "order") expect(await read(f, key, kind, f.assets[1]?.relation.id)).toBeNull();
      const withoutReceipt = await record(f, kind, "succeeded");
      expect(await read(f, withoutReceipt, kind)).toBeNull();
    });
  }

  it("does not reveal another actor's successful or unresolved request", async () => {
    const f = await fixture();
    const savedKey = randomUUID();
    await execute(f, "details", savedKey);
    const pendingKey = await record(f, "review", "in_progress");
    for (const [key, kind] of [
      [savedKey, "details"],
      [pendingKey, "review"],
    ] as const) {
      expect(await read(f, key, kind, f.assets[0]?.relation.id, colleague.session)).toEqual({
        requestKey: key,
        status: "missing",
        receipt: null,
      });
    }
    expect(await read(f, savedKey, "review")).toMatchObject({ status: "missing", receipt: null });
  });

  it("binds placement status to the relation even when one asset is placed twice", async () => {
    const f = await fixture();
    const first = f.assets[0];
    if (!first) throw new Error("Missing synthetic photo");
    const [duplicate] = await t.db
      .insert(mediaRelations)
      .values({ listingId: f.listingId, mediaAssetId: first.asset.id, position: 2 })
      .returning();
    if (!duplicate) throw new Error("Missing duplicate placement");
    const failed = randomUUID();
    await expect(execute(f, "placement", failed, true)).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(await read(f, failed, "placement")).toMatchObject({ status: "failed" });
    expect(await read(f, failed, "placement", duplicate.id)).toBeNull();
    const pending = await record(f, "placement", "in_progress");
    expect(await read(f, pending, "placement")).toMatchObject({ status: "pending" });
    expect(await read(f, pending, "placement", duplicate.id)).toBeNull();
    const key = randomUUID();
    await execute(f, "placement", key);
    expect(await read(f, key, "placement")).toMatchObject({
      status: "succeeded",
      receipt: { relationId: first.relation.id },
    });
    expect(await read(f, key, "placement", duplicate.id)).toBeNull();
    const details = randomUUID();
    await execute(f, "details", details);
    expect(await read(f, details, "details", duplicate.id)).toMatchObject({
      status: "succeeded",
      receipt: { relationId: duplicate.id },
    });
    await t.db
      .update(mediaRelations)
      .set({ removedAt: new Date() })
      .where(eq(mediaRelations.id, first.relation.id));
    expect(await read(f, key, "placement")).toBeNull();
  });

  it("requires live media grants and a live session before revealing a request", async () => {
    const owner = await staffFixture(t.db);
    const f = await fixture(owner);
    const key = randomUUID();
    const relation = f.assets[0]?.relation.id;
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, owner.id));
    await expect(read(f, key, "review", relation, owner.session)).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, owner.session.id));
    await expect(read(f, key, "review", relation, owner.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(
      await t.db
        .select()
        .from(mediaRelations)
        .where(eq(mediaRelations.listingId, f.listingId))
        .orderBy(asc(mediaRelations.position)),
    ).toHaveLength(2);
  });
});
