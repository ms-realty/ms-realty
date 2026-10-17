// Synthetic browser fixtures only. Refuse any database outside the disposable E2E namespace.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { caseFixture } from "../cases/testing";
import { hashRequest } from "../crypto";
import { nextReference } from "../references";

const url = process.env.DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable E2E database required");
const client = postgres(url, { max: 1 }),
  db = drizzle(client, { schema });
try {
  const f = await caseFixture(db);
  await db.insert(schema.grants).values(
    ["claim.approve", "compliance.review", "document.review"].map((capability) => ({
      principalId: f.staff.id,
      capability: capability as "claim.approve",
      reason: "Explicit synthetic test grant",
    })),
  );
  const versions: Record<string, string> = {};
  for (const purpose of ["process_policy", "service_agreement", "express_start", "case_check"]) {
    const [doc] = await db
      .insert(schema.documents)
      .values({
        reference: await nextReference(db, "document"),
        caseId: f.record.id,
        purpose,
        classification: "contract",
        currentVersionNumber: 1,
      })
      .returning();
    if (!doc) throw new Error("Fixture document missing");
    const digest = hashRequest({ synthetic: purpose, unique: randomUUID() });
    const [file] = await db
      .insert(schema.documentVersions)
      .values({
        documentId: doc.id,
        versionNumber: 1,
        state: "reviewed",
        sealedKey: `synthetic/${randomUUID()}`,
        sha256: digest,
        byteSize: 5,
        fileName: `${purpose}-synthetic.pdf`,
        contentType: "application/pdf",
        uploadedByKind: "staff",
        uploadedById: f.staff.id,
        scan: "clean",
        scannedAt: new Date(),
        scannerVersion: "synthetic-fixture-only",
        scannedSha256: digest,
        reviewType: "accepted_for_purpose",
        reviewedById: f.staff.id,
        reviewedAt: new Date(),
      })
      .returning();
    if (!file) throw new Error("Fixture version missing");
    versions[purpose] = file.id;
  }
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffToken: f.staff.token,
      staffId: f.staff.id,
      clientPartyId: f.client.partyId,
      versions,
    }),
  );
} finally {
  await client.end();
}
