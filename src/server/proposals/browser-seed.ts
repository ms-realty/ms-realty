// Synthetic private-workspace fixtures, never live service or launch evidence.
import { randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { digestOf, LocalFileStorage } from "../files/storage";
import { nextReference } from "../references";
import { prepareProposalAgreement, proposalCounterparty, proposalFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (
  !url ||
  !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname) ||
  !process.env.E2E_FILE_STORAGE_ROOT
)
  throw new Error("Proposal browser fixtures require the disposable database and file root.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const f = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await proposalFixture(tx);
    const suffix = randomUUID();
    await tx
      .update(schema.listings)
      .set({ reference: `MS-PROPOSAL-${suffix}` })
      .where(eq(schema.listings.id, f.listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-PROPOSAL-${suffix}` })
      .where(eq(schema.properties.id, f.listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.sellerInstructions.listingId, f.listing.listingId));
    return f;
  });
  const seller = await proposalCounterparty(db, f);
  await prepareProposalAgreement(db, f);
  const [document] = await db
    .insert(schema.documents)
    .values({
      reference: await nextReference(db, "document"),
      caseId: f.record.id,
      purpose: "client_review",
      classification: "other",
      audience: "case_participants",
      currentVersionNumber: 1,
    })
    .returning();
  if (!document) throw new Error("Missing document fixture");
  const bytes = Buffer.from("%PDF-1.4\nSynthetic private document fixture\n%%EOF\n"),
    digest = digestOf(bytes),
    sealedKey = `sealed/documents/${randomUUID()}.pdf`;
  await new LocalFileStorage(process.env.E2E_FILE_STORAGE_ROOT).writeImmutable(sealedKey, bytes);
  const [version] = await db
    .insert(schema.documentVersions)
    .values({
      documentId: document.id,
      versionNumber: 1,
      state: "ready_for_review",
      sealedKey,
      sha256: digest,
      fileName: "synthetic-client-review.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      uploadedByKind: "staff",
      uploadedById: f.staff.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "synthetic-browser-fixture",
      scannedSha256: digest,
    })
    .returning();
  const [grant] = await db
    .insert(schema.grants)
    .values({
      principalId: f.client.id,
      capability: "portal.document.upload",
      recordType: "document",
      recordId: document.id,
      reason: "Synthetic explicit document audience",
    })
    .returning();
  console.log(
    JSON.stringify({
      proposalId: f.proposal.id,
      revisionId: f.revision.id,
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      sellerToken: seller.token,
      documentId: document.id,
      documentVersionId: version?.id,
      documentGrantId: grant?.id,
    }),
  );
} finally {
  await connection.end();
}
