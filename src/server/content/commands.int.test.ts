import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvals, contentPages, contentPageVersions, grants, passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { readInquiryContent } from "../inquiries/content-context";
import { createStaff } from "../testing";
import {
  createContent,
  decideContent,
  readContentOperation,
  readContentWorkbench,
  saveContent,
} from "./commands";
import { readApprovedContent } from "./public";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function staff(full = true) {
  const person = await createStaff(t.db, {
    grants: (full
      ? ["content.edit", "listing.review_facts", "claim.approve", "publication.release"]
      : ["content.edit"]
    ).map((capability) => ({ capability: capability as "content.edit" })),
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
const expiry = () => new Date(Date.now() + 86400000).toISOString();
const draft = () => ({
  operationId: randomUUID(),
  kind: "help" as const,
  slug: `synthetic-${randomUUID()}`,
  title: "Синтетични условия за тест",
  text: "Синтетичен текст, не реална политика.\n\nВтори тестов абзац.",
  jurisdiction: "Synthetic test jurisdiction",
  reviewScope: "Synthetic integration test only",
});
async function publish(actor: Awaited<ReturnType<typeof staff>>, id: string) {
  for (const decision of ["claims", "editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(t.db, actor.session, id);
    await decideContent(t.db, actor.session, {
      id,
      expectedVersion: page.version,
      operationId: randomUUID(),
      decision,
      note: "Explicit synthetic human review",
      reviewed: true,
      expiresAt: expiry(),
    });
  }
}
describe("O21 editorial content authority", () => {
  it("reads a durable decision receipt only for its actor, exact page and current authority", async () => {
    const actor = await staff(),
      other = await staff();
    const { outcome } = await createContent(t.db, actor.session, draft());
    const second = await createContent(t.db, actor.session, draft());
    const input = {
      id: outcome.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      decision: "claims" as const,
      note: "Synthetic reviewed edition",
      reviewed: true as const,
      expiresAt: expiry(),
    };
    const done = await decideContent(t.db, actor.session, input);
    const receipt = await readContentOperation(
      t.db,
      actor.session,
      "decide",
      input.operationId,
      outcome.id,
    );
    expect(receipt).toMatchObject({
      status: "succeeded",
      id: outcome.id,
      operationId: done.operationId,
      recordedAt: done.outcome.recordedAt,
    });
    expect(
      await readContentOperation(t.db, actor.session, "decide", input.operationId, outcome.id),
    ).toEqual(receipt);
    expect(
      await readContentOperation(t.db, other.session, "decide", input.operationId, outcome.id),
    ).toBeNull();
    expect(
      await readContentOperation(t.db, actor.session, "decide", randomUUID(), outcome.id),
    ).toBeNull();
    await expect(
      readContentOperation(t.db, actor.session, "decide", input.operationId, second.outcome.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, actor.id));
    await expect(
      readContentOperation(t.db, actor.session, "decide", input.operationId, outcome.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("drafts are private; separate exact reviews release BG text; a new draft leaves the published edition intact", async () => {
    const actor = await staff(),
      input = draft();
    const created = await createContent(t.db, actor.session, input);
    expect((await createContent(t.db, actor.session, input)).outcome).toEqual(created.outcome);
    expect(await readApprovedContent(t.db, "help", input.slug, "bg")).toBeNull();
    await expect(
      decideContent(t.db, actor.session, {
        id: created.outcome.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        decision: "publish",
        note: "Cannot skip required reviewers",
        reviewed: true,
        expiresAt: expiry(),
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await publish(actor, created.outcome.id);
    const published = await readApprovedContent(t.db, "help", input.slug, "bg");
    expect(published?.title).toBe(input.title);
    expect(published?.version.id).toBeTruthy();
    if (!published) throw new Error("Expected an approved test content version");
    const reference = { kind: "help" as const, slug: input.slug, versionId: published.version.id };
    expect(await t.db.transaction((tx) => readInquiryContent(tx, reference, "bg"))).toMatchObject({
      ...reference,
      title: input.title,
      locale: "bg",
    });
    await expect(
      t.db.transaction((tx) =>
        readInquiryContent(tx, { ...reference, versionId: randomUUID() }, "bg"),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      t.db.transaction((tx) => readInquiryContent(tx, reference, "en")),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(await readApprovedContent(t.db, "help", input.slug, "en")).toBeNull();
    const { page } = await readContentWorkbench(t.db, actor.session, created.outcome.id);
    await saveContent(t.db, actor.session, {
      ...input,
      id: page.id,
      expectedVersion: page.version,
      operationId: randomUUID(),
      title: "Нова непубликувана чернова",
    });
    expect((await readApprovedContent(t.db, "help", input.slug, "bg"))?.version).toEqual(
      published?.version,
    );
    expect((await readApprovedContent(t.db, "help", input.slug, "bg"))?.title).toBe(input.title);
    const after = await readContentWorkbench(t.db, actor.session, page.id);
    expect(after.current.reviewedAt).toBeNull();
    expect(after.page.editorialState).toBe("draft");
    await expect(
      decideContent(t.db, actor.session, {
        id: page.id,
        expectedVersion: after.page.version,
        operationId: randomUUID(),
        decision: "publish",
        note: "Old reviews cannot approve changed text",
        reviewed: true,
        expiresAt: expiry(),
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await decideContent(t.db, actor.session, {
      id: page.id,
      expectedVersion: after.page.version,
      operationId: randomUUID(),
      decision: "withdraw",
      note: "Synthetic withdrawal",
      reviewed: true,
    });
    expect(await readApprovedContent(t.db, "help", input.slug, "bg")).toBeNull();
    await expect(
      t.db.transaction((tx) => readInquiryContent(tx, reference, "bg")),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });
  it("editor-only authority cannot approve claims or publish; stale edits preserve existing text", async () => {
    const actor = await staff(false),
      input = draft();
    const { outcome } = await createContent(t.db, actor.session, input);
    for (const decision of ["claims", "publish"] as const)
      await expect(
        decideContent(t.db, actor.session, {
          id: outcome.id,
          expectedVersion: 1,
          operationId: randomUUID(),
          decision,
          note: "Not authorized",
          reviewed: true,
          expiresAt: expiry(),
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    await saveContent(t.db, actor.session, {
      ...input,
      id: outcome.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      text: "Current draft",
    });
    await expect(
      saveContent(t.db, actor.session, {
        ...input,
        id: outcome.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        text: "Stale overwrite",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(
      (await readContentWorkbench(t.db, actor.session, outcome.id)).current.body,
    ).toMatchObject({ paragraphs: ["Current draft"] });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, actor.id));
    await expect(readContentWorkbench(t.db, actor.session, outcome.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("expired claim approval removes public content and evidence remains immutable", async () => {
    const actor = await staff(),
      input = draft();
    const { outcome } = await createContent(t.db, actor.session, input);
    await publish(actor, outcome.id);
    const { current } = await readContentWorkbench(t.db, actor.session, outcome.id);
    await expect(
      t.db
        .update(contentPageVersions)
        .set({ body: { title: "Corrupt", paragraphs: ["changed"] } })
        .where(eq(contentPageVersions.id, current.id)),
    ).rejects.toThrow();
    await t.db
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvals.subjectId, current.id));
    expect(await readApprovedContent(t.db, "help", input.slug, "bg")).toBeNull();
    expect(
      (await t.db.select().from(contentPages).where(eq(contentPages.id, outcome.id)))[0]
        ?.publicationState,
    ).toBe("active");
  });
});
