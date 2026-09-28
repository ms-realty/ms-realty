// Isolated browser fixture. No provider connection or real customer data.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { caseFixture } from "../cases/testing";
import { retrieveInboundEmail } from "./service";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await caseFixture(db),
    emailId = randomUUID();
  const [event] = await db
    .insert(schema.inboxEvents)
    .values({
      provider: "resend",
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
      name: "resend",
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
            id: randomUUID(),
            filename: "untrusted.pdf",
            contentType: "application/pdf",
            size: 100,
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
  console.log(
    JSON.stringify({
      id: row?.id,
      caseId: f.record.id,
      partyId: f.client.partyId,
      staffToken: f.staff.token,
      clientToken: f.client.token,
    }),
  );
} finally {
  await connection.end();
}
