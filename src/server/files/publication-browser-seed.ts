// Synthetic entry conditions only. No files, scans, listing approvals, seller instructions,
// manifests or publication pointers are seeded. Those must be produced by the browser flow.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { hashRequest } from "../crypto";
import { createStaff } from "../testing";

const url = process.env.E2E_DATABASE_URL;
const runId = process.env.E2E_RUN_ID;
if (
  !url ||
  !runId ||
  !/^[a-f0-9]{32}$/.test(runId) ||
  new URL(url).pathname !== `/msr_e2e_${runId}` ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) ||
  process.env.DATABASE_URL !== url ||
  !process.env.E2E_AUTH_SECRET ||
  process.env.AUTH_SECRET !== process.env.E2E_AUTH_SECRET
)
  throw new Error("Publication browser fixtures require this run's disposable loopback database.");

const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const result = await db.transaction(async (tx) => {
    const inquiryId = randomUUID();
    const reviewer = await createStaff(tx, {
      roles: ["content_editor", "publishing_approver"],
      grants: [
        { capability: "document.review" },
        { capability: "document.read_restricted" },
        { capability: "inquiry.read", recordType: "inquiry", recordId: inquiryId },
      ],
      email: `publication-${randomUUID()}@example.test`,
    });
    // Valid-session entry fixture, not browser authentication evidence. The separate identity
    // suite exercises real two-passkey enrollment and authentication on Chromium.
    await tx.insert(schema.passkeys).values(
      [0, 1].map(() => ({
        principalId: reviewer.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
    const sellerName = `Synthetic seller ${randomUUID().slice(0, 8)}`;
    const [seller] = await tx
      .insert(schema.parties)
      .values({
        kind: "person",
        displayName: sellerName,
        preferredLocale: "bg",
      })
      .returning();
    if (!seller) throw new Error("Missing synthetic seller");
    // This reviewer needs only this seller's inquiry. An agency-wide broker grant made the
    // fixture depend on where its seller sorted among other concurrently created contacts.
    await tx.insert(schema.inquiries).values({
      id: inquiryId,
      reference: `INQ-PUB-${randomUUID()}`,
      purpose: "seller_consultation",
      source: "walk_in",
      submissionKey: randomUUID(),
      payloadDigest: hashRequest({ synthetic: true, seller: seller.id }),
      partyId: seller.id,
      preferredName: sellerName,
      preferredLocale: "bg",
      ownerId: reviewer.id,
      message: "Synthetic browser fixture only. No real seller, title or authority is asserted.",
    });
    const { token } = await createSession(tx, { kind: "staff", id: reviewer.id });
    return { token, reviewerId: reviewer.id, sellerId: seller.id, sellerName };
  });
  console.log(JSON.stringify(result));
} finally {
  await connection.end();
}
