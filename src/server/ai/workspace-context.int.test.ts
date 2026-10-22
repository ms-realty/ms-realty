import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentPages, grants, inquiries, messages, passkeys, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { ContextSelection, SourcePin } from "@/domain/generative";
import { can } from "../authz";
import { caseFixture, staffFixture } from "../cases/testing";
import { createContent, decideContent } from "../content/commands";
import { createListingFixture, publishForTest } from "../publication/testing";
import { createStaff, grantService } from "../testing";
import { assertWorkspaceSourcePinsAuthorized, resolveWorkspaceContext } from "./workspace-context";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const empty: ContextSelection = { caseId: null, inquiryId: null, listingIds: [] };

async function protectedStaff(options: Parameters<typeof createStaff>[1]) {
  const staff = await createStaff(t.db, options);
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return staff;
}

async function internalMessage(caseId: string, staffId: string) {
  const [row] = await t.db
    .insert(messages)
    .values({
      kind: "internal_note",
      direction: "outbound",
      channel: "in_app",
      audience: "internal",
      authorKind: "staff",
      authorId: staffId,
      caseId,
      body: "Confirm the lift. Contact hidden@example.test at +359 888 123 456. Account BG80BNBG96611020345678.",
      recipients: ["private-recipient"],
      attachments: ["restricted-document"],
      payloadDigest: "synthetic",
    })
    .returning();
  if (!row) throw new Error("Missing fixture message");
  return row;
}

describe("F29 scoped minimized workspace context", () => {
  it("returns stable source pins, current brief and commitments without contacts or private relations", async () => {
    const f = await caseFixture(t.db);
    await internalMessage(f.record.id, f.staff.id);
    await t.db
      .update(inquiries)
      .set({
        preferredName: "Private inquiry identity",
        preferredChannel: "Private channel",
        message: "Apartment near the centre. Email secret@example.test. Call +359 888 123 456.",
      })
      .where(eq(inquiries.id, f.inquiry.id));
    const selected = { ...empty, caseId: f.record.id, inquiryId: f.inquiry.id };
    const first = await resolveWorkspaceContext(t.db, f.staff.actor, selected);
    const locked = await t.db.transaction((tx) =>
      resolveWorkspaceContext(tx, f.staff.actor, selected, { lock: true }),
    );
    expect(locked).toEqual(first);
    expect(first.truncated).toBe(false);
    expect(first.sources.some((source) => source.key.startsWith("brief:"))).toBe(true);
    expect(first.sources.some((source) => source.type === "task")).toBe(true);
    expect(first.sources.some((source) => source.type === "message")).toBe(true);
    expect(
      first.sources.find((source) => source.key === `case:${f.record.id}`)?.facts.version,
    ).toBe("1");
    const serialized = JSON.stringify(first);
    for (const secret of [
      "secret@example.test",
      "hidden@example.test",
      "+359 888 123 456",
      "BG80BNBG96611020345678",
      "Private inquiry identity",
      "private-recipient",
      "restricted-document",
    ])
      expect(serialized).not.toContain(secret);
    await t.db
      .update(inquiries)
      .set({ message: "A materially different source request" })
      .where(eq(inquiries.id, f.inquiry.id));
    expect((await resolveWorkspaceContext(t.db, f.staff.actor, selected)).digest).not.toBe(
      first.digest,
    );
  });

  it("filters task scopes before limiting and requires current internal permission for messages", async () => {
    const f = await caseFixture(t.db);
    const other = await caseFixture(t.db);
    await internalMessage(f.record.id, f.staff.id);
    const [visibleTask] = await t.db
      .insert(tasks)
      .values({ caseId: f.record.id, title: "Visible selected task", ownerId: f.staff.id })
      .returning();
    if (!visibleTask) throw new Error("Missing task");
    await t.db.insert(tasks).values(
      Array.from({ length: 25 }, (_, index) => ({
        caseId: f.record.id,
        title: `Hidden record scoped task ${index}`,
        ownerId: f.staff.id,
      })),
    );
    const scoped = await protectedStaff({
      grants: [
        { capability: "case.read", recordType: "case", recordId: f.record.id },
        { capability: "ai.draft", recordType: "case", recordId: f.record.id },
        { capability: "task.manage", recordType: "task", recordId: visibleTask.id },
      ],
    });
    const context = await resolveWorkspaceContext(t.db, scoped.actor, {
      ...empty,
      caseId: f.record.id,
    });
    expect(
      context.sources.filter((source) => source.type === "task").map((source) => source.id),
    ).toEqual([visibleTask.id]);
    expect(context.sources.some((source) => source.type === "message")).toBe(false);
    expect(context.truncated).toBe(false);
    const bounded = await resolveWorkspaceContext(t.db, f.staff.actor, {
      ...empty,
      caseId: f.record.id,
    });
    expect(bounded.truncated).toBe(true);
    expect(bounded.sources.filter((source) => source.type === "task")).toHaveLength(20);
    await expect(
      resolveWorkspaceContext(t.db, scoped.actor, { ...empty, caseId: other.record.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    const [internal] = await t.db
      .insert(grants)
      .values({
        principalId: scoped.id,
        capability: "case.read_internal",
        recordType: "case",
        recordId: f.record.id,
        reason: "Synthetic reviewed permission",
      })
      .returning();
    if (!internal) throw new Error("Missing grant");
    expect(
      (
        await resolveWorkspaceContext(t.db, scoped.actor, { ...empty, caseId: f.record.id })
      ).sources.some((source) => source.type === "message"),
    ).toBe(true);
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, internal.id));
    expect(
      (
        await resolveWorkspaceContext(t.db, scoped.actor, { ...empty, caseId: f.record.id })
      ).sources.some((source) => source.type === "message"),
    ).toBe(false);
  });

  it("reauthorizes AI access on every read and rejects AI services even with grants", async () => {
    const f = await caseFixture(t.db);
    await resolveWorkspaceContext(t.db, f.staff.actor, { ...empty, caseId: f.record.id });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.staff.id));
    await expect(
      resolveWorkspaceContext(t.db, f.staff.actor, { ...empty, caseId: f.record.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await grantService(t.db, "workspace-test", { capability: "ai.draft" });
    await expect(
      resolveWorkspaceContext(t.db, { kind: "ai_service", id: "workspace-test" }, empty),
    ).rejects.toMatchObject({ code: "not_found" });
    const caseOnly = await protectedStaff({
      grants: [{ capability: "ai.draft", recordType: "case", recordId: f.record.id }],
    });
    await expect(resolveWorkspaceContext(t.db, caseOnly.actor, empty)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("allows a global workspace with approved BG plaintext while excluding unapproved CMS editions", async () => {
    const publisher = await staffFixture(t.db);
    await t.db.insert(grants).values({
      principalId: publisher.id,
      capability: "claim.approve",
      reason: "Synthetic qualified claim review",
    });
    const page = await createContent(t.db, publisher.session, {
      operationId: randomUUID(),
      kind: "help",
      slug: `workspace-${randomUUID()}`,
      title: "Synthetic approved guide",
      text: "Read the reviewed public steps.",
      jurisdiction: "Synthetic jurisdiction",
      reviewScope: "Synthetic claims review only",
    });
    await createContent(t.db, publisher.session, {
      operationId: randomUUID(),
      kind: "help",
      slug: `unapproved-${randomUUID()}`,
      title: "Unapproved guide",
      text: "Never share this unapproved claim.",
      jurisdiction: "Synthetic jurisdiction",
      reviewScope: "Draft only",
    });
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const [row] = await t.db
        .select()
        .from(contentPages)
        .where(eq(contentPages.id, page.outcome.id));
      if (!row) throw new Error("Missing page");
      await decideContent(t.db, publisher.session, {
        id: row.id,
        expectedVersion: row.version,
        operationId: randomUUID(),
        decision,
        reviewed: true,
        note: "Explicit synthetic person review",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    const context = await resolveWorkspaceContext(t.db, publisher.actor, empty);
    expect(
      context.sources.some(
        (source) => source.type === "content" && source.text.includes("reviewed public steps"),
      ),
    ).toBe(true);
    expect(JSON.stringify(context)).not.toContain("Never share this unapproved claim");
    expect(context.sources.every((source) => source.audience === "approved_public")).toBe(true);
  });

  it("loads only current approved listing manifests with exact public fact values", async () => {
    const staff = await staffFixture(t.db);
    const listing = await createListingFixture(t.db, { reviewerId: staff.id });
    await expect(
      resolveWorkspaceContext(t.db, staff.actor, { ...empty, listingIds: [listing.listingId] }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
    const [manifestId] = await publishForTest(t.db, staff.actor, listing);
    const context = await resolveWorkspaceContext(t.db, staff.actor, {
      ...empty,
      listingIds: [listing.listingId],
    });
    const source = context.sources.find((item) => item.type === "listing");
    expect(source).toMatchObject({
      id: listing.listingId,
      revision: manifestId,
      audience: "approved_public",
      facts: { manifestId, reference: listing.reference },
    });
    expect(source?.facts.sourceUrl).toContain(`/bg/properties/${listing.reference}/`);
    expect(source?.facts.price).toContain('"amountMinor":');
    expect(JSON.stringify(context)).not.toContain("Fixture street 1 (private)");
    const limited = await protectedStaff({ grants: [{ capability: "ai.draft" }] });
    await expect(
      resolveWorkspaceContext(t.db, limited.actor, { ...empty, listingIds: [listing.listingId] }),
    ).rejects.toMatchObject({ code: "not_found" });
    await assertWorkspaceSourcePinsAuthorized(t.db, staff.actor, context.pins);
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, limited.actor, context.pins),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("denies saved child sources after narrower grants are revoked while parent AI and read rights remain", async () => {
    const f = await caseFixture(t.db);
    await internalMessage(f.record.id, f.staff.id);
    const scoped = await protectedStaff({
      grants: ["case.read", "ai.draft", "task.manage", "case.read_internal"].map((capability) => ({
        capability: capability as "case.read",
        recordType: "case",
        recordId: f.record.id,
      })),
    });
    const selected = { ...empty, caseId: f.record.id };
    const saved = await resolveWorkspaceContext(t.db, scoped.actor, selected);
    await assertWorkspaceSourcePinsAuthorized(t.db, scoped.actor, saved.pins);
    const held = await t.db.select().from(grants).where(eq(grants.principalId, scoped.id));
    const taskGrant = held.find((grant) => grant.capability === "task.manage");
    const internalGrant = held.find((grant) => grant.capability === "case.read_internal");
    if (!taskGrant || !internalGrant) throw new Error("Missing scoped fixture grants");
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, taskGrant.id));
    const taskNarrowed = await resolveWorkspaceContext(t.db, scoped.actor, selected);
    expect(taskNarrowed.sources.some((source) => source.type === "task")).toBe(false);
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, scoped.actor, saved.pins),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db.update(grants).set({ revokedAt: null }).where(eq(grants.id, taskGrant.id));
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, internalGrant.id));
    const messageNarrowed = await resolveWorkspaceContext(t.db, scoped.actor, selected);
    expect(messageNarrowed.sources.some((source) => source.type === "message")).toBe(false);
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, scoped.actor, saved.pins),
    ).rejects.toMatchObject({ code: "not_found" });
    const parent = { type: "case", id: f.record.id };
    expect(await can(t.db, scoped.actor, "case.read", parent)).toBe(true);
    expect(await can(t.db, scoped.actor, "ai.draft", parent)).toBe(true);
    await assertWorkspaceSourcePinsAuthorized(
      t.db,
      scoped.actor,
      saved.pins.filter((pin) => pin.type !== "message"),
    );
  });

  it("keeps authorized historical pins readable when new tasks and messages push them out of the current window", async () => {
    const f = await caseFixture(t.db);
    await internalMessage(f.record.id, f.staff.id);
    const selected = { ...empty, caseId: f.record.id };
    const saved = await resolveWorkspaceContext(t.db, f.staff.actor, selected);
    const oldTask = saved.pins.find((pin) => pin.type === "task");
    const oldMessage = saved.pins.find((pin) => pin.type === "message");
    if (!oldTask || !oldMessage) throw new Error("Missing historical private pins");
    await t.db.insert(tasks).values(
      Array.from({ length: 25 }, (_, index) => ({
        caseId: f.record.id,
        ownerId: f.staff.id,
        title: `New historical-window task ${index}`,
      })),
    );
    for (let index = 0; index < 12; index += 1) await internalMessage(f.record.id, f.staff.id);
    const current = await resolveWorkspaceContext(t.db, f.staff.actor, selected);
    expect(current.pins.some((pin) => pin.key === oldTask.key)).toBe(false);
    expect(current.pins.some((pin) => pin.key === oldMessage.key)).toBe(false);
    expect(current.truncated).toBe(true);
    await assertWorkspaceSourcePinsAuthorized(t.db, f.staff.actor, [...saved.pins, ...saved.pins]);
  });

  it("checks actual current parents and missing records without trusting saved source keys or revisions", async () => {
    const f = await caseFixture(t.db);
    const other = await caseFixture(t.db);
    const message = await internalMessage(f.record.id, f.staff.id);
    const scoped = await protectedStaff({
      grants: ["case.read", "ai.draft", "task.manage", "case.read_internal", "inquiry.read"].map(
        (capability) => ({
          capability: capability as "case.read",
          recordType: "case",
          recordId: f.record.id,
        }),
      ),
    });
    const saved = await resolveWorkspaceContext(t.db, scoped.actor, {
      ...empty,
      caseId: f.record.id,
      inquiryId: f.inquiry.id,
    });
    const taskPin = saved.pins.find((pin) => pin.type === "task");
    const messagePin = saved.pins.find((pin) => pin.id === message.id);
    const inquiryPin = saved.pins.find((pin) => pin.type === "inquiry");
    if (!taskPin || !messagePin || !inquiryPin) throw new Error("Missing fixture pins");
    await t.db.update(tasks).set({ caseId: other.record.id }).where(eq(tasks.id, taskPin.id));
    await t.db
      .update(messages)
      .set({ caseId: other.record.id })
      .where(eq(messages.id, messagePin.id));
    await t.db
      .update(inquiries)
      .set({ caseId: other.record.id })
      .where(eq(inquiries.id, inquiryPin.id));
    for (const pin of [taskPin, messagePin, inquiryPin])
      await expect(
        assertWorkspaceSourcePinsAuthorized(t.db, scoped.actor, [pin]),
      ).rejects.toMatchObject({ code: "not_found" });
    const missing: SourcePin = {
      key: "case:missing",
      type: "case",
      id: randomUUID(),
      revision: "1",
      digest: "synthetic",
    };
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, f.staff.actor, [missing]),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, f.staff.actor, [{ ...missing, id: "invalid" }]),
    ).rejects.toMatchObject({ code: "not_found" });
    const goalId = randomUUID();
    await assertWorkspaceSourcePinsAuthorized(t.db, f.staff.actor, [
      { ...missing, key: `intent:${goalId}`, type: "message", id: goalId },
    ]);
    await expect(
      assertWorkspaceSourcePinsAuthorized(t.db, f.staff.actor, [
        { ...missing, key: `intent:${goalId}`, type: "message" },
      ]),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
