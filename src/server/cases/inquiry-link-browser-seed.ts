// Synthetic O03 / C02 browser fixtures. Never accepts a persistent or production database.
// An owned website inquiry shares an email with the party of two active Cases (one buyer, one
// seller); a second owned inquiry has a contact that matches nothing.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Session } from "../auth/sessions";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "../inquiries/intake";
import { nextReference } from "../references";
import { relate } from "../testing";
import { acceptInquiry } from "../work/commands";
import { caseFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("O03 link browser seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });

async function ownedInquiry(session: Session, email: string) {
  const submissionKey = issueSubmissionKey();
  await submitInquiry(
    db,
    {
      submissionKey,
      purpose: "question",
      locale: "bg",
      name: "Synthetic returning visitor",
      contact: { kind: "email", value: email },
      message: "Synthetic follow-up about an earlier conversation.",
      privacyNotice: true,
    },
    {
      ip: `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`,
      receiptSession: newReceiptSession(),
    },
  );
  const [received] = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.submissionKey, submissionKey));
  if (!received?.partyId) throw new Error("Missing synthetic inquiry party");
  const accepted = await acceptInquiry(db, session, {
    id: received.id,
    expectedVersion: received.version,
    operationId: randomUUID(),
    nextAction: "Synthetic call back about the earlier conversation",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  return { ...received, taskId: accepted.outcome.taskId };
}

try {
  const target = await caseFixture(db);
  const email = `o03-link-${randomUUID()}@example.test`;
  await db.insert(schema.contactMethods).values({
    partyId: target.client.partyId,
    kind: "email",
    value: email,
    normalizedValue: email,
  });
  const [second] = await db
    .insert(schema.cases)
    .values({
      reference: await nextReference(db, "case"),
      kind: "seller",
      stage: "assessment",
      title: "Synthetic seller case",
      ownerId: target.staff.id,
      nextAction: "Review the synthetic seller documents",
    })
    .returning({ id: schema.cases.id, reference: schema.cases.reference });
  if (!second) throw new Error("Missing second synthetic Case");
  await relate(db, { partyId: target.client.partyId, role: "seller", caseId: second.id });
  const inquiry = await ownedInquiry(target.staff.session, email);
  // A promise to the client must survive the link unchanged.
  await db
    .update(schema.tasks)
    .set({ promisedToClient: true })
    .where(eq(schema.tasks.id, inquiry.taskId));
  const lonely = await ownedInquiry(target.staff.session, `o03-alone-${randomUUID()}@example.test`);
  console.log(
    JSON.stringify({
      staffId: target.staff.id,
      token: target.staff.token,
      inquiryId: inquiry.id,
      inquiryReference: inquiry.reference,
      partyId: inquiry.partyId,
      taskId: inquiry.taskId,
      caseA: { id: target.record.id, reference: target.record.reference },
      caseB: second,
      lonelyInquiryId: lonely.id,
    }),
  );
} finally {
  await connection.end();
}
