import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  cases,
  contactMethods,
  documentRequests,
  documents,
  documentVersions,
  grants,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { LocalFileStorage } from "../files/storage";
import { TestMessageProvider } from "../jobs/provider";
import { consentPolicyKey } from "../privacy/preferences";
import { syntheticServiceEmailTerms } from "../privacy/testing";
import { approveCaseEmail, caseEmailWorkbench, draftCaseEmail } from "./email";
import { renderCaseEmail } from "./email-contract";
import { dispatchCaseEmail } from "./email-dispatch";
import { emailFileFixture } from "./email-file-testing";
import { eligibleEmailFile } from "./email-files";

let t: TestDatabase, directory: string, storage: LocalFileStorage;
const config = { from: "MS Realty <service@example.test>", replyDomain: "reply.example.test" };
beforeAll(async () => {
  t = await createTestDatabase();
  directory = await mkdtemp(join(tmpdir(), "msr-email-files-"));
  storage = new LocalFileStorage(directory);
});
afterAll(async () => {
  await t?.drop();
  if (directory) await rm(directory, { recursive: true });
});
async function fixture() {
  const f = await emailFileFixture(t.db, storage),
    terms = await syntheticServiceEmailTerms(t.db);
  const address = `files-${randomUUID()}@example.test`;
  const [contact] = await t.db
    .insert(contactMethods)
    .values({
      partyId: f.client.partyId,
      kind: "email",
      value: address,
      normalizedValue: address,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("Missing contact");
  const [subscription] = await t.db
    .insert(subscriptions)
    .values({
      partyId: f.client.partyId,
      contactMethodId: contact.id,
      purpose: "service_updates",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: consentPolicyKey(terms),
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  const [record] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
  if (!subscription || !record) throw new Error("Missing email fixture");
  return {
    ...f,
    subscription,
    record,
    input: {
      id: record.id,
      expectedVersion: record.version,
      operationId: randomUUID(),
      subscriptionId: subscription.id,
      documentVersionIds: [f.file.id],
      subject: "Review of your document",
      body: "Synthetic attachment correspondence",
    },
  };
}
async function draft(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await draftCaseEmail(t.db, f.staff.session, f.input);
  const view = await caseEmailWorkbench(t.db, f.staff.session, f.record.id, config);
  const item = view.items.find((item) => item.message.id === result.outcome.messageId);
  if (!item?.reviewHash) throw new Error("Missing review");
  return {
    item,
    command: {
      id: f.record.id,
      expectedVersion: result.outcome.version,
      operationId: randomUUID(),
      messageId: item.message.id,
      messageVersion: item.message.version,
      reviewHash: item.reviewHash,
      reviewed: true,
    },
  };
}
it("binds exact reviewed private bytes to one recipient and delivers them only after approval", async () => {
  const f = await fixture(),
    { item, command } = await draft(f);
  expect(item.content?.documents).toMatchObject([{ versionId: f.file.id, sha256: f.file.sha256 }]);
  expect(JSON.stringify(item.content)).not.toContain("sealed/");
  const a = await approveCaseEmail(t.db, f.staff.session, command, config),
    provider = new TestMessageProvider();
  expect(await dispatchCaseEmail(t.db, provider, a.outcome.actionId, { config, storage })).toBe(
    "acknowledged",
  );
  expect(provider.sent).toHaveLength(1);
  const sent = provider.sent[0];
  if (!sent) throw new Error("No email");
  const rendered = renderCaseEmail(sent, config);
  expect(rendered?.attachments).toEqual([
    {
      filename: f.file.fileName,
      content: f.bytes.toString("base64"),
      content_type: "application/pdf",
    },
  ]);
  expect(renderCaseEmail({ ...sent, files: [] }, config)).toBeNull();
  expect(
    renderCaseEmail(
      { ...sent, files: [{ versionId: f.file.id, bytes: Buffer.from("changed") }] },
      config,
    ),
  ).toBeNull();
});
it("rejects another party's document without creating a draft", async () => {
  const f = await fixture(),
    other = await fixture();
  expect(
    await eligibleEmailFile(
      t.db,
      f.staff.session.actor,
      f.record.id,
      other.client.partyId,
      f.file.id,
    ),
  ).toBeNull();
  await expect(
    draftCaseEmail(t.db, f.staff.session, { ...f.input, documentVersionIds: [other.file.id] }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect((await caseEmailWorkbench(t.db, f.staff.session, f.record.id, config)).items).toHaveLength(
    0,
  );
});
it.each(["replacement", "scan", "audience", "grant", "request"] as const)(
  "cancels a queued attachment after %s changes without provider I/O",
  async (change) => {
    const f = await fixture(),
      { command } = await draft(f);
    const a = await approveCaseEmail(t.db, f.staff.session, command, config);
    if (change === "replacement")
      await t.db
        .update(documents)
        .set({ currentVersionNumber: 2 })
        .where(eq(documents.id, f.file.documentId));
    if (change === "scan")
      await t.db
        .update(documentVersions)
        .set({ scannedSha256: "0".repeat(64) })
        .where(eq(documentVersions.id, f.file.id));
    if (change === "audience")
      await t.db
        .update(documents)
        .set({ audience: "internal" })
        .where(eq(documents.id, f.file.documentId));
    if (change === "grant")
      await t.db
        .update(grants)
        .set({ revokedAt: new Date() })
        .where(eq(grants.id, f.documentRequest.grantId));
    if (change === "request")
      await t.db
        .update(documentRequests)
        .set({ expiresAt: new Date(0) })
        .where(eq(documentRequests.id, f.documentRequest.id));
    const provider = new TestMessageProvider();
    expect(await dispatchCaseEmail(t.db, provider, a.outcome.actionId, { config, storage })).toBe(
      "cancelled",
    );
    expect(provider.sent).toHaveLength(0);
  },
);
it("rejects replacement between draft and approval", async () => {
  const f = await fixture(),
    { command } = await draft(f);
  await t.db
    .update(documents)
    .set({ currentVersionNumber: 2 })
    .where(eq(documents.id, f.file.documentId));
  await expect(approveCaseEmail(t.db, f.staff.session, command, config)).rejects.toMatchObject({
    code: "version_conflict",
  });
});
it("never calls the provider when sealed bytes are missing or fail the frozen digest", async () => {
  for (const missing of [false, true]) {
    const f = await fixture(),
      { command } = await draft(f);
    const a = await approveCaseEmail(t.db, f.staff.session, command, config),
      provider = new TestMessageProvider();
    const unavailable = {
      ...storage,
      read: async () => {
        if (missing) throw new Error("Missing object");
        return Buffer.from("wrong bytes");
      },
      writeStaging: storage.writeStaging.bind(storage),
      writeImmutable: storage.writeImmutable.bind(storage),
    };
    expect(
      await dispatchCaseEmail(t.db, provider, a.outcome.actionId, { config, storage: unavailable }),
    ).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
  }
});
