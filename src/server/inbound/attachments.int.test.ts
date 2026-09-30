import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  caseParticipants,
  cases,
  documents,
  documentVersions,
  grants,
  inboundAttachmentImports,
  inboundEmails,
  inboxEvents,
  operations,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { caseFixture } from "../cases/testing";
import { reviewDocument } from "../documents/commands";
import type { FileServices } from "../files/config";
import { privateDownload } from "../files/download";
import { processFile } from "../files/process";
import { digestOf, LocalFileStorage } from "../files/storage";
import { JobQueue } from "../jobs/queue";
import type { AttachmentProvider } from "../jobs/resend-attachment";
import type { ReceivedEmail } from "../jobs/resend-receiving";
import { attachmentImportScope, importInboundAttachment } from "./attachments";
import { retrieveInboundEmail, reviewInboundEmail } from "./service";

let t: TestDatabase, root: string, queue: JobQueue, files: FileServices;
const bytes = Buffer.from("%PDF-1.7\nSynthetic inbound document\n%%EOF\n");
beforeAll(async () => {
  t = await createTestDatabase();
  queue = new JobQueue(t.url, { producer: true });
  await queue.start();
  root = await mkdtemp(join(tmpdir(), "msr-inbound-files-"));
  files = {
    storage: new LocalFileStorage(root),
    scanner: {
      scan: async (data) => ({
        state: "clean",
        sha256: digestOf(data),
        scannedAt: new Date(),
        scannerVersion: "injected-test-scanner",
      }),
    },
  };
});
afterAll(async () => {
  await queue?.stop();
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const f = await caseFixture(t.db),
    emailId = randomUUID(),
    attachmentId = randomUUID();
  await t.db.insert(grants).values(
    (["document.review", "document.read_restricted", "compliance.review"] as const).map(
      (capability) => ({
        principalId: f.staff.id,
        capability,
        reason: "Synthetic explicit document intake authority",
      }),
    ),
  );
  const email: ReceivedEmail = {
    id: emailId,
    from: "untrusted@example.test",
    senderAddress: "untrusted@example.test",
    recipients: ["reply@example.test"],
    subject: "Synthetic document",
    text: "Please review this synthetic document",
    receivedAt: new Date().toISOString(),
    htmlOmitted: false,
    authentication: { spf: "fail" },
    attachments: [
      {
        id: attachmentId,
        filename: "untrusted.pdf",
        contentType: "application/pdf",
        size: bytes.length,
        state: "not_downloaded",
      },
    ],
  };
  const [event] = await t.db
    .insert(inboxEvents)
    .values({
      provider: "resend",
      eventId: randomUUID(),
      eventType: "email.received",
      signatureVerified: true,
      payload: { emailId },
    })
    .returning();
  if (!event) throw new Error("Fixture failed");
  await retrieveInboundEmail(
    t.db,
    { name: "resend", retrieve: async () => email },
    event.id,
    "reply.example.test",
  );
  const [row] = await t.db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.providerEmailId, emailId));
  if (!row) throw new Error("Fixture failed");
  await reviewInboundEmail(t.db, f.staff.session, {
    operationId: randomUUID(),
    id: row.id,
    expectedVersion: 1,
    decision: "assign",
    caseId: f.record.id,
    caseVersion: f.record.version,
    partyId: f.client.partyId,
    reviewed: true,
    reason: "Manually bound synthetic message to this participant",
  });
  const provider = {
    name: "resend",
    retrieveAttachment: vi.fn<AttachmentProvider["retrieveAttachment"]>().mockResolvedValue({
      emailId,
      id: attachmentId,
      fileName: "untrusted.pdf",
      contentType: "application/pdf",
      bytes,
    }),
  };
  return {
    ...f,
    row,
    email,
    provider,
    input: {
      operationId: randomUUID(),
      id: row.id,
      attachmentId,
      caseId: f.record.id,
      expectedVersion: 2,
      caseVersion: f.record.version + 1,
      fileName: "case-check.pdf",
      purpose: "case_check",
      classification: "property",
      reviewed: true,
      reason: "Retain this selected attachment for a human case check",
    },
  };
}
async function importFile(f: Awaited<ReturnType<typeof fixture>>, input: unknown = f.input) {
  return importInboundAttachment(t.db, f.staff.session, input, {
    provider: f.provider,
    files,
    queue,
  });
}
it("imports one sealed private version with immutable provenance, a durable receipt and a real queued scan", async () => {
  const f = await fixture(),
    result = await importFile(f);
  const [link] = await t.db
    .select()
    .from(inboundAttachmentImports)
    .where(eq(inboundAttachmentImports.inboundEmailId, f.row.id));
  if (!link) throw new Error("Missing import provenance");
  expect(link).toMatchObject({
    sourceDigest: f.row.sourceDigest,
    attachmentId: f.input.attachmentId,
    caseId: f.record.id,
    senderPartyId: f.client.partyId,
    documentVersionId: result.outcome.versionId,
    sha256: digestOf(bytes),
    importedById: f.staff.id,
  });
  const [file] = await t.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, result.outcome.versionId));
  if (!file) throw new Error("Missing imported version");
  expect(file).toMatchObject({
    state: "sealed",
    scan: "pending",
    reviewType: null,
    professionalValidation: "not_requested",
  });
  expect(
    await t.sql`select data from pgboss.job where name='files.process' and data->>'id'=${file.id}`,
  ).toHaveLength(1);
  await expect(
    privateDownload(t.db, files.storage, f.staff.session, "document", file.id),
  ).rejects.toMatchObject({ code: "not_found" });
  expect((await importFile(f)).outcome).toEqual(result.outcome);
  expect(f.provider.retrieveAttachment).toHaveBeenCalledTimes(1);
  await expect(
    t.db
      .update(inboundAttachmentImports)
      .set({ reason: "Changed source" })
      .where(eq(inboundAttachmentImports.id, link.id)),
  ).rejects.toThrow();
  await expect(
    t.db.delete(inboundAttachmentImports).where(eq(inboundAttachmentImports.id, link.id)),
  ).rejects.toThrow();
  await processFile(t.db, files, f.staff.session, "document", file.id);
  const [scanned] = await t.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, file.id));
  if (!scanned) throw new Error("Missing scanned version");
  expect(scanned).toMatchObject({ scan: "clean", state: "ready_for_review", reviewType: null });
  await reviewDocument(t.db, {
    session: f.staff.session,
    operationId: randomUUID(),
    versionId: file.id,
    expectedRevision: scanned.version,
    input: {
      reviewType: "accepted_for_purpose",
      note: "Human reviewed the exact synthetic file for this purpose",
      confirmed: true,
      expiresAt: null,
    },
  });
  await expect(
    privateDownload(t.db, files.storage, f.client.session, "document", file.id),
  ).rejects.toMatchObject({ code: "not_found" });
  expect(
    (await privateDownload(t.db, files.storage, f.staff.session, "document", file.id)).bytes,
  ).toEqual(bytes);
});
it.each(["unreviewed", "foreign-case", "unlisted", "triage", "participant", "closed"])(
  "rejects %s before reading attachment bytes",
  async (kind) => {
    const f = await fixture();
    const input = { ...f.input };
    if (kind === "unreviewed") input.reviewed = false;
    if (kind === "foreign-case") input.caseId = (await caseFixture(t.db)).record.id;
    if (kind === "unlisted") input.attachmentId = randomUUID();
    if (kind === "triage")
      await t.db
        .update(inboundEmails)
        .set({ state: "triage" })
        .where(eq(inboundEmails.id, f.row.id));
    if (kind === "participant")
      await t.db
        .update(caseParticipants)
        .set({ revokedAt: new Date() })
        .where(eq(caseParticipants.caseId, f.record.id));
    if (kind === "closed")
      await t.db
        .update(cases)
        .set({
          disposition: "closed",
          dispositionReason: "Synthetic closure",
          closureOutcome: "Synthetic outcome",
          commitmentDispositions: [],
        })
        .where(eq(cases.id, f.record.id));
    await expect(importFile(f, input)).rejects.toThrow();
    expect(f.provider.retrieveAttachment).not.toHaveBeenCalled();
  },
);
it("rechecks document authority after receipt replay and after provider retrieval", async () => {
  const f = await fixture();
  await importFile(f);
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(and(eq(grants.principalId, f.staff.id), eq(grants.capability, "document.review")));
  await expect(importFile(f)).rejects.toMatchObject({ code: "not_found" });
  const g = await fixture();
  g.provider.retrieveAttachment.mockImplementation(async () => {
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, g.staff.id), eq(grants.capability, "document.review")));
    return {
      emailId: g.email.id,
      id: g.input.attachmentId,
      fileName: "untrusted.pdf",
      contentType: "application/pdf",
      bytes,
    };
  });
  await expect(importFile(g)).rejects.toMatchObject({ code: "not_found" });
  expect(await t.db.select().from(documents).where(eq(documents.caseId, g.record.id))).toHaveLength(
    0,
  );
});
it("rejects Case changes during retrieval and preserves no partial document", async () => {
  const f = await fixture();
  f.provider.retrieveAttachment.mockImplementation(async () => {
    await t.db
      .update(cases)
      .set({ version: sql`${cases.version}+1` })
      .where(eq(cases.id, f.record.id));
    return {
      emailId: f.email.id,
      id: f.input.attachmentId,
      fileName: "untrusted.pdf",
      contentType: "application/pdf",
      bytes,
    };
  });
  await expect(importFile(f)).rejects.toMatchObject({ code: "version_conflict" });
  expect(await t.db.select().from(documents).where(eq(documents.caseId, f.record.id))).toHaveLength(
    0,
  );
});
it.each(["wrong-id", "wrong-size", "wrong-name", "unsupported"])(
  "rejects %s bytes without creating evidence",
  async (kind) => {
    const f = await fixture();
    f.provider.retrieveAttachment.mockResolvedValue({
      emailId: f.email.id,
      id: kind === "wrong-id" ? randomUUID() : f.input.attachmentId,
      fileName: kind === "wrong-name" ? "changed.pdf" : "untrusted.pdf",
      contentType: "application/pdf",
      bytes:
        kind === "wrong-size"
          ? Buffer.alloc(2)
          : kind === "unsupported"
            ? Buffer.alloc(bytes.length)
            : bytes,
    });
    await expect(importFile(f)).rejects.toMatchObject({ code: "validation_failed" });
    expect(
      await t.db.select().from(documents).where(eq(documents.caseId, f.record.id)),
    ).toHaveLength(0);
  },
);
it("allows a safe retry after provider failure without a partial receipt or document", async () => {
  const f = await fixture();
  f.provider.retrieveAttachment.mockRejectedValueOnce(new Error("signed-url-must-not-leak"));
  await expect(importFile(f)).rejects.toMatchObject({ code: "unavailable" });
  expect(
    await t.db
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.operationType, attachmentImportScope),
          eq(operations.idempotencyKey, f.input.operationId),
        ),
      ),
  ).toHaveLength(0);
  expect(await t.db.select().from(documents).where(eq(documents.caseId, f.record.id))).toHaveLength(
    0,
  );
  await expect(importFile(f)).resolves.toMatchObject({ replayed: false });
});
it("serializes competing imports of the same attachment without duplicate versions", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    importFile(f),
    importFile(f, { ...f.input, operationId: randomUUID() }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await t.db
      .select()
      .from(inboundAttachmentImports)
      .where(eq(inboundAttachmentImports.inboundEmailId, f.row.id)),
  ).toHaveLength(1);
  expect(await t.db.select().from(documents).where(eq(documents.caseId, f.record.id))).toHaveLength(
    1,
  );
});
it.each(["failed", "infected"] as const)(
  "keeps %s scan bytes unavailable and unaccepted",
  async (state) => {
    const f = await fixture(),
      result = await importFile(f);
    await processFile(
      t.db,
      {
        ...files,
        scanner: {
          scan: async (data) => ({
            state,
            sha256: digestOf(data),
            scannedAt: new Date(),
            scannerVersion: "injected-test-scanner",
          }),
        },
      },
      f.staff.session,
      "document",
      result.outcome.versionId,
    );
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, result.outcome.versionId));
    expect(file?.scan).toBe(state);
    expect(file?.reviewType).toBeNull();
    await expect(
      privateDownload(t.db, files.storage, f.staff.session, "document", result.outcome.versionId),
    ).rejects.toMatchObject({ code: "not_found" });
  },
);
