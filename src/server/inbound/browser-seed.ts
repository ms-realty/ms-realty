// Isolated browser fixture. No provider connection or real customer data.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { caseFixture } from "../cases/testing";
import { LocalFileStorage } from "../files/storage";
import { retrieveInboundEmail, reviewInboundEmail } from "./service";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await caseFixture(db),
    emailId = randomUUID(),
    attachmentId = randomUUID();
  const attachmentMode = process.env.E2E_INBOUND_ATTACHMENTS === "1";
  const bytes = Buffer.from("%PDF-1.7\nSynthetic inbound document\n%%EOF\n");
  if (attachmentMode) {
    if (!process.env.E2E_FILE_STORAGE_ROOT) throw new Error("Synthetic storage root required");
    await new LocalFileStorage(process.env.E2E_FILE_STORAGE_ROOT).writeStaging(
      `staging/test-inbound/${emailId}/${attachmentId}`,
      bytes,
    );
    await db.insert(schema.grants).values(
      (["document.review", "document.read_restricted", "compliance.review"] as const).map(
        (capability) => ({
          principalId: f.staff.id,
          capability,
          reason: "Synthetic document intake authority",
        }),
      ),
    );
  }
  const [event] = await db
    .insert(schema.inboxEvents)
    .values({
      provider: attachmentMode ? "test" : "resend",
      eventId: randomUUID(),
      eventType: "email.received",
      signatureVerified: true,
      payload: { emailId },
      state: "received",
    })
    .returning();
  if (!event) throw new Error("Fixture failed");
  await retrieveInboundEmail(
    db,
    {
      name: attachmentMode ? "test" : "resend",
      retrieve: async () => ({
        id: emailId,
        from: "Untrusted Sender <incoming@example.test>",
        senderAddress: null,
        recipients: ["reply@example.test"],
        subject: "Synthetic inbound reply",
        text: "Synthetic plain text. <script>alert('untrusted')</script>",
        receivedAt: new Date().toISOString(),
        htmlOmitted: true,
        authentication: { spf: "fail" },
        attachments: [
          {
            id: attachmentId,
            filename: attachmentMode ? "synthetic-inbound.pdf" : "untrusted.pdf",
            contentType: "application/pdf",
            size: attachmentMode ? bytes.length : 100,
            state: "not_downloaded",
          },
        ],
      }),
    },
    event.id,
    "reply.example.test",
  );
  const [row] = await db
    .select()
    .from(schema.inboundEmails)
    .where(eq(schema.inboundEmails.providerEmailId, emailId));
  if (attachmentMode && row)
    await reviewInboundEmail(db, f.staff.session, {
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
  console.log(
    JSON.stringify({
      id: row?.id,
      attachmentId,
      caseId: f.record.id,
      partyId: f.client.partyId,
      staffToken: f.staff.token,
      clientToken: f.client.token,
    }),
  );
} finally {
  await connection.end();
}
