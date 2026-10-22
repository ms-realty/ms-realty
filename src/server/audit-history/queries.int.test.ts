import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, grants, operations, principals, staffMemberships } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { recordAudit } from "../audit";
import { restrictPublication } from "../publication/commands";
import { createListingFixture, listingVersion, publishForTest } from "../publication/testing";
import { createClient, createStaff } from "../testing";
import { listListingHistory, readListingHistory } from "./queries";
import { historyListingFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const f = await historyListingFixture(t.db);
  const editor = await createStaff(t.db, { roles: ["content_editor"] });
  const eventId = await recordAudit(t.db, {
    actor: editor.actor,
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: f.listing.id,
    payload: {
      newVersion: 3,
      reason: "Synthetic recorded source correction",
      token: "PRIVATE_TOKEN",
      contact: "PRIVATE_CONTACT",
    },
  });
  return { ...f, editor, eventId };
}
const reader = () => createStaff(t.db, { roles: ["manager"] });

describe("O26/O26L current authorized listing history (W14-T3)", () => {
  it("requires both audit.read and listing.read and never opens a client history identity", async () => {
    const f = await fixture();
    await expect(readListingHistory(t.db, f.editor.actor, f.eventId)).rejects.toMatchObject({
      code: "forbidden",
    });
    const auditOnly = await createStaff(t.db, { grants: [{ capability: "audit.read" }] });
    await expect(listListingHistory(t.db, auditOnly.actor)).rejects.toMatchObject({
      code: "forbidden",
    });
    const client = await createClient(t.db);
    await t.db.insert(grants).values([
      {
        principalId: client.id,
        capability: "audit.read",
        recordType: "listing",
        recordId: f.listing.id,
        reason: "Synthetic invalid client audit grant",
      },
      {
        principalId: client.id,
        capability: "listing.read",
        recordType: "listing",
        recordId: f.listing.id,
        reason: "Synthetic invalid client audit grant",
      },
    ]);
    await expect(readListingHistory(t.db, client.actor, f.eventId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("intersects scoped history and current listing visibility before filtering or pagination", async () => {
    const visible = await fixture(),
      hidden = await fixture();
    const person = await createStaff(t.db, {
      grants: [
        { capability: "audit.read", recordType: "property", recordId: visible.property.id },
        { capability: "listing.read", recordType: "listing", recordId: visible.listing.id },
      ],
    });
    const result = await listListingHistory(t.db, person.actor, { pageSize: 1 });
    expect(result.entries.map((entry) => entry.id)).toEqual([visible.eventId]);
    expect(result.nextCursor).toBeNull();
    await expect(readListingHistory(t.db, person.actor, hidden.eventId)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      (await listListingHistory(t.db, person.actor, { reference: hidden.listing.reference }))
        .entries,
    ).toEqual([]);
    const caseEvent = await recordAudit(t.db, {
      actor: visible.editor.actor,
      action: "case.transition",
      recordType: "case",
      recordId: visible.listing.id,
      payload: { secret: "PRIVATE_CASE" },
    });
    await expect(readListingHistory(t.db, person.actor, caseEvent)).rejects.toMatchObject({
      code: "not_found",
    });
    const detail = await readListingHistory(t.db, person.actor, visible.eventId);
    expect(detail.change).toMatchObject({
      reason: "Synthetic recorded source correction",
      fields: [{ key: "version", value: 3 }],
    });
    expect(detail.publication.state).toBe("working");
    expect(JSON.stringify(detail)).not.toMatch(/PRIVATE_/);
  });

  it("resolves today's matching staff name without attributing missing or client identities", async () => {
    const f = await fixture(),
      person = await reader();
    await t.db
      .update(principals)
      .set({ displayName: "Synthetic current editor name" })
      .where(eq(principals.id, f.editor.id));
    expect((await readListingHistory(t.db, person.actor, f.eventId)).actor.currentName).toBe(
      "Synthetic current editor name",
    );
    for (const actor of [
      { kind: "staff" as const, id: randomUUID() },
      (await createClient(t.db)).actor,
    ]) {
      const id = await recordAudit(t.db, {
        actor,
        action: "listing.draft.saved",
        recordType: "listing",
        recordId: f.listing.id,
      });
      const event = await readListingHistory(t.db, person.actor, id);
      expect(event.actor.currentName).toBeNull();
      expect(event.change.reason).toBeNull();
      expect(event.technical.actorId).toBe(actor.kind === "staff" ? actor.id : null);
    }
  });

  it("reauthorizes expired, revoked and ended membership access on each read", async () => {
    const f = await fixture();
    const person = await createStaff(t.db, {
      grants: [{ capability: "audit.read" }, { capability: "listing.read" }],
    });
    await readListingHistory(t.db, person.actor, f.eventId);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, person.id), eq(grants.capability, "audit.read")));
    await expect(readListingHistory(t.db, person.actor, f.eventId)).rejects.toMatchObject({
      code: "forbidden",
    });
    const expired = await createStaff(t.db, {
      grants: [
        { capability: "audit.read", expiresAt: new Date(Date.now() - 1000) },
        { capability: "listing.read" },
      ],
    });
    await expect(listListingHistory(t.db, expired.actor)).rejects.toMatchObject({
      code: "forbidden",
    });
    const ended = await reader();
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, ended.id));
    await expect(readListingHistory(t.db, ended.actor, f.eventId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("pages stable timestamp ties and rejects invalid or differently bound queries", async () => {
    const f = await fixture(),
      person = await reader();
    const ids = [randomUUID(), randomUUID()];
    await t.db.insert(auditEvents).values(
      ids.map((id) => ({
        id,
        actorKind: "staff" as const,
        actorId: f.editor.id,
        action: "listing.draft.saved",
        recordType: "listing",
        recordId: f.listing.id,
        payload: {},
        occurredAt: sql`date_trunc('second', now()) + interval '1 second 123456 microseconds'`,
      })),
    );
    const first = await listListingHistory(t.db, person.actor, {
      reference: f.listing.reference.toLowerCase(),
      pageSize: 1,
    });
    if (!first.nextCursor) throw new Error("Missing next cursor");
    const second = await listListingHistory(t.db, person.actor, {
      reference: f.listing.reference,
      pageSize: 1,
      cursor: first.nextCursor,
    });
    expect(new Set([first.entries[0]?.id, second.entries[0]?.id])).toEqual(new Set(ids));
    for (const input of [
      { cursor: "not-json" },
      { pageSize: 51 },
      { reference: [f.listing.reference] },
      { reference: "x".repeat(81) },
      { reference: "DIFFERENT", pageSize: 1, cursor: first.nextCursor },
    ])
      await expect(listListingHistory(t.db, person.actor, input)).rejects.toMatchObject({
        code: "validation_failed",
      });
    await expect(readListingHistory(t.db, person.actor, "bad-id")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("binds publication proof to the exact successful command and verified website delivery", async () => {
    const publisher = await createStaff(t.db, {
      roles: ["content_editor", "publishing_approver", "manager"],
    });
    const f = await createListingFixture(t.db, { reviewerId: publisher.id });
    const [manifestId] = await publishForTest(t.db, publisher.actor, f);
    const events = await listListingHistory(t.db, publisher.actor, { reference: f.reference });
    const activation = events.entries.find(
      (event) => event.change.action === "publicationDecision",
    );
    const preparation = events.entries.find((event) => event.change.action === "packagePrepared");
    if (!activation || !preparation || !manifestId) throw new Error("Missing real command history");
    expect(
      (await readListingHistory(t.db, publisher.actor, preparation.id)).publication.state,
    ).toBe("prepared");
    const published = await readListingHistory(t.db, publisher.actor, activation.id);
    expect(published.publication).toMatchObject({
      state: "published",
      current: "active",
      locale: "bg",
    });
    expect(published.publication.verifiedAt).toBeInstanceOf(Date);
    const faked = await recordAudit(t.db, {
      actor: publisher.actor,
      action: "publication.activate",
      recordType: "listing",
      recordId: f.listingId,
      payload: {
        manifestId,
        generation: published.change.fields.find((field) => field.key === "generation")?.value,
      },
    });
    expect((await readListingHistory(t.db, publisher.actor, faked)).publication.state).toBe(
      "unconfirmed",
    );
    const unrelated = await fixture();
    const mismatched = await recordAudit(t.db, {
      actor: publisher.actor,
      action: "publication.activate",
      recordType: "listing",
      recordId: unrelated.listing.id,
      payload: { manifestId },
    });
    expect(
      (await readListingHistory(t.db, publisher.actor, mismatched)).technical.manifestId,
    ).toBeNull();
    await restrictPublication(t.db, {
      actor: publisher.actor,
      reference: f.reference,
      reason: "Synthetic correction needed",
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      operationId: randomUUID(),
    });
    expect(
      (await readListingHistory(t.db, publisher.actor, activation.id)).publication,
    ).toMatchObject({ state: "published", current: "restricted" });
    // These GET readers do not make a new operation or audit event.
    const [before] = await t.db.select({ count: sql<number>`count(*)::int` }).from(operations);
    await readListingHistory(t.db, publisher.actor, activation.id);
    const [after] = await t.db.select({ count: sql<number>`count(*)::int` }).from(operations);
    expect(after).toEqual(before);
  });
});
