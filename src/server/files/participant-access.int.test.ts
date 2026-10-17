import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { caseParticipants, documents, documentVersions, grants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { listClientDocuments } from "../documents/client";
import { createCase, createClient, createStaff } from "../testing";
import { documentAccess } from "./access";
import { privateDownload } from "./download";
import { digestOf, LocalFileStorage } from "./storage";

let t: TestDatabase, storage: LocalFileStorage, directory: string;
beforeAll(async () => {
  t = await createTestDatabase();
  directory = await mkdtemp(join(tmpdir(), "msr-participant-files-"));
  storage = new LocalFileStorage(directory);
});
afterAll(async () => {
  await t?.drop();
  if (directory) await rm(directory, { recursive: true });
});

async function fixture() {
  const staff = await createStaff(t.db);
  const client = await createClient(t.db);
  const signed = await createSession(t.db, { kind: "client", id: client.id });
  const caseId = await createCase(t.db, staff.id);
  const [participant] = await t.db
    .insert(caseParticipants)
    .values({ caseId, partyId: client.partyId, role: "buyer" })
    .returning();
  const [document] = await t.db
    .insert(documents)
    .values({
      reference: `DOC-${randomUUID()}`,
      caseId,
      purpose: "client_evidence",
      audience: "case_participants",
      classification: "other",
      currentVersionNumber: 1,
    })
    .returning();
  if (!document || !participant) throw new Error("Missing document fixture");
  const bytes = Buffer.from("Synthetic client evidence; no real identity data.");
  const sealedKey = `sealed/${randomUUID()}`;
  await storage.writeImmutable(sealedKey, bytes);
  const [file] = await t.db
    .insert(documentVersions)
    .values({
      documentId: document.id,
      versionNumber: 1,
      state: "reviewed",
      fileName: "synthetic.txt",
      contentType: "text/plain",
      byteSize: bytes.length,
      sealedKey,
      sha256: digestOf(bytes),
      scan: "clean",
      scannedSha256: digestOf(bytes),
      scannerVersion: "injected-test-scanner",
      scannedAt: new Date(),
      reviewType: "accepted_for_purpose",
      reviewedById: staff.id,
      reviewedAt: new Date(),
      uploadedByKind: "staff",
      uploadedById: staff.id,
    })
    .returning();
  const [grant] = await t.db
    .insert(grants)
    .values({
      principalId: client.id,
      capability: "portal.document.upload",
      recordType: "document",
      recordId: document.id,
      reason: "Synthetic explicit document grant",
    })
    .returning();
  if (!file || !grant) throw new Error("Missing file fixture");
  return { client, signed, caseId, participant, document, file, grant, bytes };
}

it.each(["revoked", "expired", "not_started", "unbounded_specialist"] as const)(
  "denies private bytes and metadata despite a leftover document grant when participation is %s",
  async (condition) => {
    const f = await fixture();
    expect(
      (await privateDownload(t.db, storage, f.signed.session, "document", f.file.id)).bytes,
    ).toEqual(f.bytes);
    await t.db
      .update(caseParticipants)
      .set(
        condition === "revoked"
          ? { revokedAt: new Date() }
          : condition === "expired"
            ? { expiresAt: new Date(Date.now() - 1000) }
            : condition === "not_started"
              ? { validFrom: new Date(Date.now() + 60_000) }
              : { role: "specialist", expiresAt: null },
      )
      .where(eq(caseParticipants.id, f.participant.id));
    const [grant] = await t.db.select().from(grants).where(eq(grants.id, f.grant.id));
    expect(grant?.revokedAt).toBeNull();
    await expect(
      privateDownload(t.db, storage, f.signed.session, "document", f.file.id),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await listClientDocuments(t.db, f.signed.session)).toEqual([]);
  },
);

it("neither a different Case's participation nor a current participant without an exact document grant is sufficient", async () => {
  const f = await fixture();
  const otherCase = await createCase(t.db);
  await t.db
    .update(caseParticipants)
    .set({ caseId: otherCase })
    .where(eq(caseParticipants.id, f.participant.id));
  await expect(documentAccess(t.db, f.signed.session, f.file.id)).rejects.toMatchObject({
    code: "not_found",
  });
  await t.db
    .update(caseParticipants)
    .set({ caseId: f.caseId })
    .where(eq(caseParticipants.id, f.participant.id));
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grant.id));
  await expect(documentAccess(t.db, f.signed.session, f.file.id)).rejects.toMatchObject({
    code: "not_found",
  });
});

it("preserves internal compliance-document restrictions even with current participation and an exact grant", async () => {
  const f = await fixture();
  await t.db
    .update(documents)
    .set({ purpose: "service_agreement", audience: "internal", classification: "contract" })
    .where(eq(documents.id, f.document.id));
  await expect(documentAccess(t.db, f.signed.session, f.file.id)).rejects.toMatchObject({
    code: "not_found",
  });
  expect(await listClientDocuments(t.db, f.signed.session)).toEqual([]);
});
