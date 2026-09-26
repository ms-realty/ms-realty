// Fixtures for the work-service integration tests. Test data only: example.test addresses and
// invented names, inserted straight into the schema.
import {
  appointments,
  approvals,
  contactMethods,
  inquiries,
  listings,
  messages,
  outboxMessages,
  persons,
  servicePolicies,
  tasks,
} from "@/db/schema";
import type { InquiryState } from "@/domain/inquiry";
import type { MessageState } from "@/domain/message";
import type { Executor } from "../db";
import { createProperty } from "../testing";

let sequence = 0;
const next = () => {
  sequence += 1;
  return sequence;
};

export async function createPerson(
  db: Executor,
  options: {
    name?: string;
    email?: string;
    verification?: "unverified" | "verified" | "failed";
  } = {},
): Promise<{ personId: string; contactMethodId: string; email: string }> {
  const [person] = await db
    .insert(persons)
    .values({ displayName: options.name ?? `Test Person ${next()}` })
    .returning({ id: persons.id });
  if (!person) throw new Error("person insert failed");
  const email = options.email ?? `person-${Date.now().toString(36)}-${next()}@example.test`;
  const [method] = await db
    .insert(contactMethods)
    .values({
      personId: person.id,
      kind: "email",
      value: email,
      normalizedValue: email.toLowerCase(),
      verification: options.verification ?? "unverified",
    })
    .returning({ id: contactMethods.id });
  if (!method) throw new Error("contact method insert failed");
  return { personId: person.id, contactMethodId: method.id, email };
}

export async function createInquiry(
  db: Executor,
  options: {
    state?: InquiryState;
    ownerStaffId?: string;
    personId?: string | null;
    contactMethodId?: string | null;
    purpose?: "question" | "callback" | "viewing_help" | "selling_letting" | "other_service";
    listingId?: string;
    createdAt?: Date;
    firstResponseAt?: Date;
    followUpAt?: Date;
    message?: string;
  } = {},
): Promise<{ id: string; reference: string; version: number }> {
  const n = next();
  let personId = options.personId;
  let contactMethodId = options.contactMethodId;
  if (personId === undefined && contactMethodId === undefined) {
    const person = await createPerson(db);
    personId = person.personId;
    contactMethodId = person.contactMethodId;
  }
  const reference = `RQ-2026-${String(900000 + n).padStart(6, "0")}`;
  const [row] = await db
    .insert(inquiries)
    .values({
      reference,
      state: options.state ?? (options.ownerStaffId ? "assigned" : "received"),
      purpose: options.purpose ?? "question",
      source: "website",
      submissionId: `submission-${Date.now().toString(36)}-${n}`,
      personId: personId ?? null,
      contactMethodId: contactMethodId ?? null,
      ownerStaffId: options.ownerStaffId,
      listingId: options.listingId,
      preferredLocale: "en",
      preferredName: "Test Visitor",
      message: options.message ?? "Is the apartment still available?",
      context: { page: "listing" },
      firstResponseAt: options.firstResponseAt,
      followUpAt: options.followUpAt,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: inquiries.id, version: inquiries.version });
  if (!row) throw new Error("inquiry insert failed");
  return { id: row.id, reference, version: row.version };
}

export async function createListing(db: Executor): Promise<{ id: string; reference: string }> {
  const propertyId = await createProperty(db);
  const reference = `MS-${String(90000 + next()).padStart(5, "0")}`;
  const [row] = await db
    .insert(listings)
    .values({ reference, propertyId, purpose: "sale", commercialState: "available" })
    .returning({ id: listings.id });
  if (!row) throw new Error("listing insert failed");
  return { id: row.id, reference };
}

/** An outbound message that went through approval, with its outbox row in `deliveryState`. */
export async function createSentMessage(
  db: Executor,
  options: {
    inquiryId?: string;
    caseId?: string;
    authorStaffId: string;
    deliveryState: MessageState;
    recipient?: string;
    lastErrorCode?: string;
    dispatchStartedAt?: Date;
    body?: string;
    createdAt?: Date;
  },
): Promise<{ messageId: string; outboxId: string }> {
  const [approval] = await db
    .insert(approvals)
    .values({
      kind: "message_send",
      state: "approved",
      subjectType: "message",
      subjectId: crypto.randomUUID(),
      subjectVersion: 1,
      subjectHash: "hash",
      requestedByKind: "staff",
      requestedById: options.authorStaffId,
      decidedByKind: "staff",
      decidedById: options.authorStaffId,
      decidedAt: new Date(),
    })
    .returning({ id: approvals.id });
  const [message] = await db
    .insert(messages)
    .values({
      kind: "external",
      direction: "outbound",
      channel: "email",
      state: "queued",
      inquiryId: options.inquiryId,
      caseId: options.caseId,
      authorKind: "staff",
      authorId: options.authorStaffId,
      body: options.body ?? "Thank you for your question.",
      recipients: [],
      contentHash: "hash",
      approvalId: approval?.id,
      approvedContentHash: "hash",
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: messages.id });
  if (!message) throw new Error("message insert failed");
  const [outbox] = await db
    .insert(outboxMessages)
    .values({
      idempotencyKey: `message:${message.id}`,
      messageId: message.id,
      channel: "email",
      recipient: options.recipient ?? "client@example.test",
      template: "message.reply",
      state: options.deliveryState,
      lastErrorCode: options.lastErrorCode,
      dispatchStartedAt: options.dispatchStartedAt,
    })
    .returning({ id: outboxMessages.id });
  if (!outbox) throw new Error("outbox insert failed");
  return { messageId: message.id, outboxId: outbox.id };
}

export async function createInboundMessage(
  db: Executor,
  options: { inquiryId: string; body: string; createdAt?: Date },
): Promise<string> {
  const [row] = await db
    .insert(messages)
    .values({
      kind: "external",
      direction: "inbound",
      channel: "email",
      state: "delivered",
      inquiryId: options.inquiryId,
      authorKind: "visitor",
      authorId: "inbound",
      body: options.body,
      contentHash: "inbound",
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: messages.id });
  if (!row) throw new Error("message insert failed");
  return row.id;
}

export async function createTaskRow(
  db: Executor,
  options: {
    title?: string;
    ownerStaffId?: string | null;
    dueAt?: Date | null;
    commitment?: "internal" | "client_promise";
    state?: "open" | "in_progress" | "waiting";
    waitingOn?: string;
    followUpAt?: Date;
    inquiryId?: string;
    caseId?: string;
    evidenceRequired?: boolean;
    type?: "general" | "call" | "follow_up" | "publishing";
  } = {},
): Promise<{ id: string; version: number }> {
  const [row] = await db
    .insert(tasks)
    .values({
      title: options.title ?? `Call the client ${next()}`,
      type: options.type ?? "general",
      commitment: options.commitment ?? "internal",
      state: options.state ?? "open",
      ownerStaffId: options.ownerStaffId ?? null,
      dueAt: options.dueAt ?? null,
      waitingOn: options.waitingOn,
      followUpAt: options.followUpAt,
      inquiryId: options.inquiryId,
      caseId: options.caseId,
      evidenceRequired: options.evidenceRequired ?? false,
    })
    .returning({ id: tasks.id, version: tasks.version });
  if (!row) throw new Error("task insert failed");
  return row;
}

export async function createAppointment(
  db: Executor,
  options: {
    hostStaffId?: string;
    state: "requested" | "proposed" | "confirmed";
    startsAt: Date;
    caseId?: string;
  },
): Promise<{ id: string; reference: string }> {
  const reference = `AP-2026-${String(900000 + next()).padStart(6, "0")}`;
  const endsAt = new Date(options.startsAt.getTime() + 3_600_000);
  const confirmed = options.state === "confirmed";
  const [row] = await db
    .insert(appointments)
    .values({
      reference,
      state: options.state,
      format: "in_person",
      caseId: options.caseId,
      timezone: "Europe/Sofia",
      hostStaffId: options.hostStaffId,
      ...(confirmed
        ? { confirmedStartsAt: options.startsAt, confirmedEndsAt: endsAt }
        : { proposedStartsAt: options.startsAt, proposedEndsAt: endsAt }),
    })
    .returning({ id: appointments.id });
  if (!row) throw new Error("appointment insert failed");
  return { id: row.id, reference };
}

export async function createPendingApproval(
  db: Executor,
  options: { kind: "message_send" | "publication"; requestedBy: string },
): Promise<string> {
  const [row] = await db
    .insert(approvals)
    .values({
      kind: options.kind,
      state: "pending",
      subjectType: options.kind === "publication" ? "publication_release" : "message",
      subjectId: crypto.randomUUID(),
      subjectVersion: 1,
      subjectHash: "hash",
      requestedByKind: "staff",
      requestedById: options.requestedBy,
    })
    .returning({ id: approvals.id });
  if (!row) throw new Error("approval insert failed");
  return row.id;
}

export async function createServicePolicy(
  db: Executor,
  options: { effectiveFrom: Date; serviceHours: unknown; responsePolicy?: unknown },
): Promise<void> {
  await db.insert(servicePolicies).values({
    effectiveFrom: options.effectiveFrom,
    timezone: "Europe/Sofia",
    serviceHours: options.serviceHours,
    coverage: { settlements: ["Sandanski"] },
    responsePolicy: options.responsePolicy ?? {},
  });
}
