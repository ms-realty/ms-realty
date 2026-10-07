import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "../inquiries/intake";
import { acceptInquiry } from "./commands";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const broker = await staffFixture(db);
  const submissionKey = issueSubmissionKey();
  const email = `contact-${randomUUID()}@example.test`;
  await submitInquiry(
    db,
    {
      submissionKey,
      purpose: "question",
      locale: "bg",
      name: "Synthetic contact visitor",
      contact: { kind: "email", value: email },
      message: "Please explain the service and its next steps.",
      privacyNotice: true,
    },
    {
      ip: `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`,
      receiptSession: newReceiptSession(),
    },
  );
  const [inquiry] = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.submissionKey, submissionKey));
  if (!inquiry?.contactMethodId) throw new Error("Missing contact fixture");
  await db
    .update(schema.inquiries)
    .set({ createdAt: new Date(Date.now() - 300000) })
    .where(eq(schema.inquiries.id, inquiry.id));
  const accepted = await acceptInquiry(db, broker.session, {
    id: inquiry.id,
    expectedVersion: inquiry.version,
    operationId: randomUUID(),
    nextAction: "Original contact commitment",
    dueAt: new Date(Date.now() + 3600000).toISOString(),
  });
  console.log(
    JSON.stringify({
      id: inquiry.id,
      token: broker.token,
      brokerId: broker.id,
      taskId: accepted.outcome.taskId,
      contactId: inquiry.contactMethodId,
      email,
    }),
  );
} finally {
  await connection.end();
}
