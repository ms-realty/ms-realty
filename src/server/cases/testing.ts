import { randomUUID } from "node:crypto";
import { inquiries, passkeys, tasks } from "@/db/schema";
import { createSession } from "../auth/sessions";
import type { Executor } from "../db";
import { createClient, createStaff } from "../testing";
import { createCaseFromInquiry } from "./commands";

export async function staffFixture(db: Executor) {
  const person = await createStaff(db, {
    roles: ["assigned_broker", "publishing_approver", "content_editor"],
    email: `s4-staff-${randomUUID()}@example.test`,
  });
  await db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(db, { kind: "staff", id: person.id })) };
}
export async function caseFixture(db: Executor, broker?: Awaited<ReturnType<typeof staffFixture>>) {
  const staff = broker ?? (await staffFixture(db));
  const client = await createClient(db, { email: `s4-client-${randomUUID()}@example.test` });
  const issued = await createSession(db, { kind: "client", id: client.id });
  const [inquiry] = await db
    .insert(inquiries)
    .values({
      reference: `RQ-S4-${randomUUID()}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "test",
      ownerId: staff.id,
      partyId: client.partyId,
      preferredLocale: "bg",
      message: "Synthetic qualification inquiry",
    })
    .returning();
  if (!inquiry) throw new Error("No inquiry fixture");
  await db.insert(tasks).values({
    inquiryId: inquiry.id,
    ownerId: staff.id,
    title: "Existing intake follow-up",
    dueAt: new Date(Date.now() + 86400000),
  });
  const created = await createCaseFromInquiry(db, staff.session, {
    id: inquiry.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    kind: "buyer",
    title: "Synthetic buyer case",
    nextAction: "Review the client's requirements",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    requirements: "A lift is essential",
    preferences: "Near the town centre",
  });
  return { staff, client: { ...client, ...issued }, inquiry, record: created.outcome };
}
