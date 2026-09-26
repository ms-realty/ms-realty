// Public inquiry intake and its receipt (spec F06, P11, P12, §19.4, §20.3, A16-A19). A receipt
// exists only once the server accepted the request. The client's operation id makes a retry,
// reload or double submit converge on the same inquiry and the same receipt; a timed-out
// submission is reconciled by resending it with the same id. Responses never reveal whether
// the contact address was already known.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  capabilityGrants,
  contactConsents,
  contactMethods,
  inquiries,
  persons,
  staffAccounts,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { type PublicLocale, parseReference, publicLocales } from "@/domain/ids";
import type { InquiryPurpose, InquiryState } from "@/domain/inquiry";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { enqueueMessage } from "../jobs/outbox";
import { listingSlug, loadPublishedListings, localizedTitle } from "../listings/published";
import { findOperation, runOperation } from "../operations";
import { enforceRateLimit } from "../rate-limit";
import { nextReference } from "../references";

export const inquiryTopics = ["question", "viewing", "callback"] as const;
export type InquiryTopic = (typeof inquiryTopics)[number];

const purposeByTopic: Record<InquiryTopic, InquiryPurpose> = {
  question: "question",
  viewing: "viewing_help",
  callback: "callback",
};

/** What happens next, as stable codes the receipt page words per locale. */
export type InquiryNextStep =
  | "team_reviews_request"
  | "reply_by_email"
  | "reply_by_phone"
  | "call_back"
  | "propose_viewing_times"
  | "keep_reference";

export interface InquiryReceipt {
  /** Human reference, e.g. RQ-2026-000042 (src/domain/ids.ts). */
  readonly reference: string;
  /** ISO 8601 instant the server accepted the request. */
  readonly acceptedAt: string;
  readonly topic: InquiryTopic;
  /** received -> in_progress (owned and being answered) -> closed. */
  readonly status: "received" | "in_progress" | "closed";
  readonly listing: {
    readonly reference: string;
    readonly slug: string;
    readonly title: string | null;
    readonly titleLocale: PublicLocale;
  } | null;
  /** The fact the question was asked about, when it came from a fact row (F03). */
  readonly factKey: string | null;
  readonly contact: { readonly route: "email" | "phone"; readonly masked: string };
  readonly responseLocale: PublicLocale;
  readonly callbackWindow: string | null;
  readonly nextSteps: readonly InquiryNextStep[];
  /** Unguessable token that, with the reference, reads this receipt back. */
  readonly receiptToken: string;
}

export interface SubmittedInquiry extends InquiryReceipt {
  /** The server's operation receipt id, a support reference (not the client's operationId). */
  readonly operationReceiptId: string;
  /** True when this answers a retry of an already accepted submission. */
  readonly replayed: boolean;
}

// Validation.

const blankAsUnset = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const text = (max: number) =>
  z.preprocess(blankAsUnset, z.string().trim().max(max, "too_long").optional());

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const e164Pattern = /^\+[1-9]\d{7,14}$/;

/** International format only: a local number cannot be dialled without guessing the country. */
export function normalizePhone(value: string): string | null {
  let phone = value.replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return e164Pattern.test(phone) ? phone : null;
}

const inquirySchema = z
  .object({
    /** Client-generated submission id (A18); reused by every retry of this submission. */
    operationId: z
      .string("required")
      .trim()
      .regex(/^[A-Za-z0-9_-]{16,128}$/, "invalid_operation_id"),
    topic: z.enum(inquiryTopics, "required"),
    name: text(120),
    contact: z.discriminatedUnion(
      "route",
      [
        z.object({ route: z.literal("email"), value: z.string("required").trim().max(254) }),
        z.object({ route: z.literal("phone"), value: z.string("required").trim().max(40) }),
      ],
      "required",
    ),
    message: text(4000),
    responseLocale: z.enum(publicLocales, "required"),
    listingReference: text(20),
    factKey: z.preprocess(
      blankAsUnset,
      z
        .string()
        .regex(/^[a-z0-9_.]{1,80}$/, "invalid")
        .optional(),
    ),
    callbackWindow: text(200),
    consent: z.object(
      {
        /** The privacy notice shown next to the submit button was presented (F06 step 4). */
        privacyNotice: z.literal(true, "required"),
        /** Separate and unchecked by default (A16). */
        marketing: z.boolean().default(false),
      },
      "required",
    ),
  })
  .superRefine((input, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (input.contact.route === "email" && !emailPattern.test(input.contact.value)) {
      issue(["contact", "value"], "invalid_email");
    }
    if (input.contact.route === "phone" && !normalizePhone(input.contact.value)) {
      issue(["contact", "value"], "phone_international_format");
    }
    // Phone only when the chosen response is by phone (F06 step 3).
    if (input.topic === "callback" && input.contact.route !== "phone") {
      issue(["contact", "route"], "phone_required_for_callback");
    }
    if (input.topic === "question" && !input.message) issue(["message"], "required");
    if (input.topic !== "question" && !input.name) issue(["name"], "required");
    if (input.listingReference && parseReference(input.listingReference)?.kind !== "listing") {
      issue(["listingReference"], "invalid_reference");
    }
  });

export type InquiryInput = z.input<typeof inquirySchema>;
type ParsedInquiry = z.output<typeof inquirySchema>;

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    const code = /^[a-z_]+$/.test(issue.message) ? issue.message : issue.code;
    errors[key] = [...new Set([...(errors[key] ?? []), code])];
  }
  return errors;
}

export function parseInquiry(input: unknown): ParsedInquiry {
  const result = inquirySchema.safeParse(input);
  if (!result.success) {
    throw new AppError("validation_failed", { fieldErrors: fieldErrorsOf(result.error) });
  }
  return result.data;
}

// Receipt pieces.

export function maskContact(route: "email" | "phone", value: string): string {
  if (route === "email") {
    const [local = "", domain = ""] = value.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `${value.slice(0, 4)}•••${value.slice(-3)}`;
}

function nextSteps(topic: InquiryTopic, route: "email" | "phone"): InquiryNextStep[] {
  const reply: InquiryNextStep = route === "email" ? "reply_by_email" : "reply_by_phone";
  const answer: Record<InquiryTopic, InquiryNextStep> = {
    question: reply,
    callback: "call_back",
    viewing: "propose_viewing_times",
  };
  return ["team_reviews_request", answer[topic], "keep_reference"];
}

const statusByState: Record<InquiryState, InquiryReceipt["status"]> = {
  received: "received",
  assigned: "in_progress",
  awaiting_client: "in_progress",
  ready_for_case: "in_progress",
  suspected_duplicate: "in_progress",
  case_linked: "closed",
  resolved_without_case: "closed",
  discarded: "closed",
};

/** Derived from the inquiry id with the server secret: nothing to store, nothing to leak. */
function receiptTokenFor(inquiryId: string): string {
  return keyedHash(getEnv().authSecret, `inquiry-receipt:${inquiryId}`);
}

/** What the receipt shows, as accepted; stored on the inquiry so a read-back matches. */
interface ReceiptContext {
  readonly topic: InquiryTopic;
  readonly listing: InquiryReceipt["listing"];
  readonly factKey: string | null;
  readonly contact: InquiryReceipt["contact"];
  readonly nextSteps: readonly InquiryNextStep[];
}

function toReceipt(
  row: Pick<
    typeof inquiries.$inferSelect,
    "id" | "reference" | "createdAt" | "state" | "preferredLocale" | "callbackWindow"
  >,
  context: ReceiptContext,
): InquiryReceipt {
  return {
    reference: row.reference,
    acceptedAt: row.createdAt.toISOString(),
    topic: context.topic,
    status: statusByState[row.state],
    listing: context.listing,
    factKey: context.factKey,
    contact: context.contact,
    responseLocale: row.preferredLocale ?? "bg",
    callbackWindow: row.callbackWindow,
    nextSteps: context.nextSteps,
    receiptToken: receiptTokenFor(row.id),
  };
}

// Intake.

async function resolveParty(
  tx: Transaction,
  input: ParsedInquiry,
  normalized: string,
): Promise<{ personId: string; contactMethodId: string }> {
  const kind = input.contact.route;
  // Linking proposes an identity for staff to review; it never merges parties by itself.
  const [known] = await tx
    .select({ id: contactMethods.id, personId: contactMethods.personId })
    .from(contactMethods)
    .where(and(eq(contactMethods.kind, kind), eq(contactMethods.normalizedValue, normalized)))
    .orderBy(asc(contactMethods.createdAt))
    .limit(1);
  if (known?.personId) return { personId: known.personId, contactMethodId: known.id };
  const [person] = await tx
    .insert(persons)
    .values({
      displayName: input.name ?? "Website visitor",
      preferredLocale: input.responseLocale,
    })
    .returning({ id: persons.id });
  if (!person) throw new Error("Person insert returned no row.");
  const [method] = await tx
    .insert(contactMethods)
    .values({
      personId: person.id,
      kind,
      value: kind === "phone" ? normalized : input.contact.value,
      normalizedValue: normalized,
    })
    .returning({ id: contactMethods.id });
  if (!method) throw new Error("Contact method insert returned no row.");
  return { personId: person.id, contactMethodId: method.id };
}

/** Active staff who can take ownership of new inquiries, as notification recipients. */
async function inquiryOwners(tx: Transaction, now: Date) {
  return tx
    .selectDistinct({ id: staffAccounts.id, email: staffAccounts.email })
    .from(capabilityGrants)
    .innerJoin(staffAccounts, eq(staffAccounts.id, capabilityGrants.staffAccountId))
    .where(
      and(
        eq(staffAccounts.status, "active"),
        isNull(capabilityGrants.revokedAt),
        isNull(capabilityGrants.recordId),
        or(isNull(capabilityGrants.expiresAt), gt(capabilityGrants.expiresAt, now)),
        or(
          inArray(capabilityGrants.role, ["assigned_broker", "manager"]),
          eq(capabilityGrants.capability, "inquiry.assign"),
        ),
      ),
    );
}

/** A listing an inquiry may be about: one live on the website. */
async function resolveListing(db: Executor, reference: string, locale: PublicLocale) {
  const parsed = parseReference(reference)?.reference ?? "";
  const [live] = await loadPublishedListings(db, { references: [parsed] }, locale);
  if (!live) {
    throw new AppError("validation_failed", { fieldErrors: { listingReference: ["not_found"] } });
  }
  return {
    id: live.listingId,
    summary: {
      reference: live.reference,
      slug: listingSlug(live.reference),
      ...localizedTitle(live),
    },
  };
}

export interface IntakeContext {
  /** Client IP for rate limiting; only its keyed hash is stored. */
  readonly ip: string;
  readonly correlationId?: string;
  readonly now?: Date;
}

const operationType = "inquiry.submit";

export async function submitInquiry(
  db: Executor,
  rawInput: unknown,
  context: IntakeContext,
): Promise<SubmittedInquiry> {
  const input = parseInquiry(rawInput);
  const actor: Actor = { kind: "visitor", id: `submission:${input.operationId}` };
  let listing: { id: string; summary: NonNullable<InquiryReceipt["listing"]> } | null = null;
  // A retry of an accepted submission is answered from its receipt, never rate limited.
  if (!(await findOperation(db, actor, operationType, input.operationId))) {
    await enforceRateLimit(db, "inquiry.ip", context.ip);
    // Checked before the operation starts so a correctable mistake is not stored as its outcome.
    listing = input.listingReference
      ? await resolveListing(db, input.listingReference, input.responseLocale)
      : null;
  }
  const result = await runOperation(
    db,
    {
      actor,
      type: operationType,
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async ({ tx, operationId }) => {
      const now = context.now ?? new Date();
      const route = input.contact.route;
      const normalized =
        route === "phone"
          ? (normalizePhone(input.contact.value) ?? "")
          : input.contact.value.toLowerCase();

      const party = await resolveParty(tx, input, normalized);
      const reference = await nextReference(tx, "inquiry", now);
      const receiptContext: ReceiptContext = {
        topic: input.topic,
        listing: listing?.summary ?? null,
        factKey: input.factKey ?? null,
        contact: { route, masked: maskContact(route, normalized) },
        nextSteps: nextSteps(input.topic, route),
      };
      const [row] = await tx
        .insert(inquiries)
        .values({
          reference,
          purpose: purposeByTopic[input.topic],
          source: "website",
          submissionId: input.operationId,
          listingId: listing?.id ?? null,
          context: { receipt: receiptContext },
          preferredName: input.name ?? null,
          contactMethodId: party.contactMethodId,
          personId: party.personId,
          preferredLocale: input.responseLocale,
          callbackWindow: input.callbackWindow ?? null,
          message: input.message ?? null,
          marketingOptIn: input.consent.marketing,
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error("Inquiry insert returned no row.");

      await tx.insert(contactConsents).values([
        // Answering this request is the service the person asked for.
        {
          contactMethodId: party.contactMethodId,
          purpose: "service_updates",
          state: "granted",
          source: `inquiry:${reference}`,
          recordedAt: now,
        },
        ...(input.consent.marketing
          ? [
              {
                contactMethodId: party.contactMethodId,
                purpose: "marketing" as const,
                state: "granted" as const,
                source: `inquiry:${reference}`,
                recordedAt: now,
              },
            ]
          : []),
      ]);
      const about = listing ? ` about ${listing.summary.reference}` : "";
      await recordActivity(tx, {
        recordType: "inquiry",
        recordId: row.id,
        reference,
        messageKey: "activity.inquiry.received",
        params: { topic: input.topic, listingReference: listing?.summary.reference ?? null },
        summary: `Inquiry ${reference} received from the website (${input.topic}${about}).`,
        actor,
        operationId,
        at: now,
      });
      await recordAudit(tx, {
        action: "inquiry.submit",
        actor,
        capability: "inquiry.submit",
        recordType: "inquiry",
        recordId: row.id,
        operationId,
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        payload: { topic: input.topic, contactRoute: route, listingId: listing?.id ?? null },
        at: now,
      });
      // No personal data in the notification: staff open the inquiry in the inbox (O02).
      for (const owner of await inquiryOwners(tx, now)) {
        await enqueueMessage(tx, {
          idempotencyKey: `inquiry.received:${row.id}:${owner.id}`,
          channel: "email",
          recipient: owner.email,
          template: "staff.inquiry_received",
          params: {
            inquiryReference: reference,
            topic: input.topic,
            listingReference: listing?.summary.reference ?? null,
          },
        });
      }
      const { receiptToken: _token, ...stored } = toReceipt(row, receiptContext);
      return { inquiryId: row.id, receipt: stored };
    },
  );
  const { inquiryId, receipt } = result.outcome;
  return {
    ...receipt,
    receiptToken: receiptTokenFor(inquiryId),
    operationReceiptId: result.operationId,
    replayed: result.replayed,
  };
}

function sameToken(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads a receipt back by reference and token; any mismatch is indistinguishable not_found. */
export async function getInquiryReceipt(
  db: Executor,
  input: { readonly reference: string; readonly token: string },
): Promise<{ status: "found"; receipt: InquiryReceipt } | { status: "not_found" }> {
  const parsed = parseReference(input.reference);
  if (parsed?.kind !== "inquiry") return { status: "not_found" };
  const [row] = await db.select().from(inquiries).where(eq(inquiries.reference, parsed.reference));
  const context = (row?.context as { receipt?: ReceiptContext } | undefined)?.receipt;
  if (!row || !context || !sameToken(receiptTokenFor(row.id), input.token)) {
    return { status: "not_found" };
  }
  return { status: "found", receipt: toReceipt(row, context) };
}
