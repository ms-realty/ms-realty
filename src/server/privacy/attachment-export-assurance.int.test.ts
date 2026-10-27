// O26/C18 · an issued partial metadata export remains bound to its preparer's current assurance.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { inquiries, passkeys, privacyExports } from "@/db/schema";
import { inquiryAttachments } from "@/db/schema/inquiry-attachments";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { createSession } from "../auth/sessions";
import { can } from "../authz";
import { collectInquiryAttachmentPrivacy } from "../inquiries/attachment-privacy";
import { createClient, createStaff } from "../testing";
import {
  clientPrivacyExports,
  issuePrivacyExport,
  preparePrivacyExport,
  privacyExportDownload,
} from "./exports";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("M067 denies a frozen no-manifest partial attachment export after preparer passkey loss while retaining inquiry.read", async () => {
  const preparer = await createStaff(t.db, {
    grants: [{ capability: "privacy.manage" }, { capability: "inquiry.read" }],
  });
  for (let index = 0; index < staffPasskeyMinimum; index++)
    await t.db.insert(passkeys).values({
      principalId: preparer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
  const staffSession = (await createSession(t.db, { kind: "staff", id: preparer.id })).session;
  const person = await createClient(t.db),
    clientSession = (await createSession(t.db, { kind: "client", id: person.id })).session;
  const [inquiry] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-${randomUUID()}`,
      purpose: "seller_consultation",
      source: "website",
      coverageQueue: "synthetic-test-queue",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      partyId: person.partyId,
      message: "Synthetic retained owner inquiry",
    })
    .returning();
  if (!inquiry) throw new Error("Missing synthetic inquiry");
  const digest = "a".repeat(64),
    id = randomUUID();
  await t.db.insert(inquiryAttachments).values({
    id,
    inquiryId: inquiry.id,
    operationId: randomUUID(),
    stagingKey: `staging/PRIVATE-OBJECT-KEY-${id}`,
    sealedKey: `sealed/PRIVATE-OBJECT-KEY-${id}`,
    sha256: digest,
    contentType: "image/png",
    byteSize: 100,
    width: 8,
    height: 6,
    state: "sealed",
    scan: "clean",
    scannedAt: new Date(),
    scannerVersion: "synthetic-scan-evidence",
    scannedSha256: digest,
  });
  const source = await collectInquiryAttachmentPrivacy(t.db, preparer.actor, person.partyId);
  expect(source.rows).toHaveLength(1);
  expect(source.blocked).toBe(false);
  expect(JSON.stringify(source.rows)).not.toContain("PRIVATE-OBJECT-KEY");
  expect(await collectInquiryAttachmentPrivacy(t.db, person.actor, person.partyId)).toMatchObject({
    rows: [],
    blocked: true,
  });
  const submitted = await submitPrivacyRequest(t.db, clientSession, {
    operationId: randomUUID(),
    kind: "export",
    description: "Synthetic own metadata export request",
    confirmed: true,
  });
  const requestId = submitted.outcome.id;
  for (const [expectedVersion, to] of [
    [1, "verifying"],
    [2, "in_progress"],
  ] as const)
    await reviewPrivacyRequest(t.db, staffSession, {
      operationId: randomUUID(),
      id: requestId,
      expectedVersion,
      to,
      responsibleId: preparer.id,
      policyReference: "Synthetic reviewed policy",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      identityReviewed: true,
      legalHoldReason: "Synthetic hold review",
      legalHoldDisposition: "Synthetic retained business evidence",
      holdResolved: true,
      completionEvidence: "No completion is claimed",
      rejectionReason: "Synthetic",
      confirmed: true,
    });
  const draft = await preparePrivacyExport(t.db, staffSession, {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    recipientId: person.id,
    confirmed: true,
  });
  await issuePrivacyExport(t.db, staffSession, {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    exportId: draft.outcome.id,
    exportVersion: 1,
    digest: draft.outcome.sha256,
    expiresMinutes: 60,
    omitTexts: [],
    reviewed: true,
    partialAcknowledged: true,
  });
  const [issued] = await t.db
    .select()
    .from(privacyExports)
    .where(eq(privacyExports.id, draft.outcome.id));
  expect(issued).toMatchObject({
    state: "issued",
    coverageComplete: false,
    encryptedReview: null,
    reviewSha256: null,
  });
  const download = await privacyExportDownload(t.db, clientSession, draft.outcome.id),
    text = download.bytes.toString("utf8");
  expect(text).toContain("inquiryAttachments");
  expect(text).toContain(id);
  expect(text).not.toContain("PRIVATE-OBJECT-KEY");
  expect(text).not.toContain("synthetic-scan-evidence");
  expect(await clientPrivacyExports(t.db, clientSession, requestId)).toHaveLength(1);
  await t.db
    .update(passkeys)
    .set({ revokedAt: new Date() })
    .where(eq(passkeys.principalId, preparer.id));
  expect(await countActivePasskeys(t.db, preparer.id)).toBe(0);
  expect(await can(t.db, preparer.actor, "inquiry.read", { type: "inquiry", id: inquiry.id })).toBe(
    true,
  );
  expect(await collectInquiryAttachmentPrivacy(t.db, preparer.actor, person.partyId)).toMatchObject(
    { rows: [], blocked: true },
  );
  expect(await clientPrivacyExports(t.db, clientSession, requestId)).toEqual([]);
  await expect(privacyExportDownload(t.db, clientSession, draft.outcome.id)).rejects.toMatchObject({
    code: "not_found",
  });
  const [retained] = await t.db
    .select()
    .from(privacyExports)
    .where(eq(privacyExports.id, draft.outcome.id));
  expect(retained?.encryptedPayload).toBe(issued?.encryptedPayload);
});
