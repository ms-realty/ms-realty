// Anonymous inquiry intake and its receipt (architecture §6.1; P11, P12; AT10–AT13).
//
// The form carries a high-entropy logical submission key the server issued (and can verify).
// The browser holds an anonymous receipt session in a host-only, Secure, HttpOnly cookie. A
// submission validates, passes abuse controls, and then commits in one transaction the Inquiry
// with its original context, the logical receipt, coverage-queue ownership, and the
// `inquiry.received` outbox event. No provider, broker or AI step is needed for acceptance.
//
// The same key with the same payload reconciles to the same Inquiry and receipt (double tap,
// retry, lost response); the same key with another payload is refused. The receipt status is
// readable only with the key and the receipt session that submitted it, and never contains the
// contact details or message.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { contactMethods, inquiries, parties } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { type PublicLocale, parseReference, publicLocales } from "@/domain/ids";
import { type InquiryPurpose, inquiryPurposes } from "@/domain/inquiry";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { type CookieOptions, serializeCookie } from "../auth/cookies";
import { getEnv, type ServerEnv } from "../config/env";
import { hashRequest, keyedHash, randomToken } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { findOperation, runOperation } from "../operations";
import { loadPublishedListings } from "../publication/presentation";
import { enforceRateLimit } from "../rate-limit";
import { nextReference } from "../references";
import { normalizeSearch } from "../search/search";

/**
 * The coverage queue that owns new website inquiries until a named broker accepts one. A
 * single queue until the service-policy settings name more.
 */
export const inquiryCoverageQueue = "intake";

// Submission keys: 256 random bits plus a server MAC, so only keys this server issued count.

const submissionKeyPattern = /^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/;

function submissionMac(nonce: string): string {
  return keyedHash(getEnv().authSecret, `inquiry-submission:${nonce}`).slice(0, 32);
}

/** A fresh logical submission identity for one server-rendered (or enhanced) inquiry form. */
export function issueSubmissionKey(): string {
  const nonce = randomToken();
  return `${nonce}.${submissionMac(nonce)}`;
}

export function isIssuedSubmissionKey(value: string): boolean {
  if (!submissionKeyPattern.test(value)) return false;
  const [nonce = "", mac = ""] = value.split(".");
  return timingSafeEqual(Buffer.from(submissionMac(nonce)), Buffer.from(mac));
}

// Receipt session: an opaque capability that only ever lives in the cookie.

const receiptSessionPattern = /^[A-Za-z0-9_-]{43}$/;
const receiptSessionDays = 30;

export function receiptCookieName(env: ServerEnv): string {
  return env.production ? "__Host-msr_receipt" : "msr_receipt";
}

export function newReceiptSession(): string {
  return randomToken();
}

/** The cookie value when it is a well-formed receipt session, else null. */
export function validReceiptSession(value: string | undefined): string | null {
  return value && receiptSessionPattern.test(value) ? value : null;
}

/** Set-Cookie for a new receipt session: host-only, Secure, HttpOnly, SameSite=Lax. */
export function receiptSetCookie(env: ServerEnv, token: string, now: Date = new Date()): string {
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.production || env.hosts.public.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(now.getTime() + receiptSessionDays * 86_400_000),
  };
  return serializeCookie(receiptCookieName(env), token, options);
}

function receiptSessionHash(token: string): string {
  return keyedHash(getEnv().authSecret, `inquiry-receipt-session:${token}`);
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
    submissionKey: z.string("required").trim().refine(isIssuedSubmissionKey, "invalid"),
    purpose: z.enum(inquiryPurposes, "required"),
    /** Preferred language for the reply; also the locale the page was read in. */
    locale: z.enum(publicLocales, "required"),
    name: text(120),
    /** One reachable contact method; its kind is the preferred channel. */
    contact: z.object(
      {
        kind: z.enum(["email", "phone"], "required"),
        value: z.string("required").trim().min(1, "required").max(254, "too_long"),
      },
      "required",
    ),
    message: text(4000),
    listingReference: text(20),
    /** The search the visitor asked from, as its public filters (never a private brief). */
    criteria: z.record(z.string(), z.unknown()).optional(),
    /** A preference in an explicit timezone, not an appointment. */
    callbackWindow: text(200),
    /** The privacy notice next to the submit button was presented. */
    privacyNotice: z.literal(true, "required"),
    /** Separate from the service request and unchecked by default. */
    marketingOptIn: z.boolean().default(false),
    /** Honeypot: people never see or fill it. */
    website: z.string().max(500).optional(),
  })
  .superRefine((input, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (input.contact.kind === "email" && !emailPattern.test(input.contact.value)) {
      issue(["contact", "value"], "invalid_email");
    }
    if (input.contact.kind === "phone" && !normalizePhone(input.contact.value)) {
      issue(["contact", "value"], "phone_international_format");
    }
    if (input.purpose === "callback" && input.contact.kind !== "phone") {
      issue(["contact", "kind"], "phone_required_for_callback");
    }
    if (input.purpose === "question" && !input.message) issue(["message"], "required");
    if (input.purpose === "viewing_request" && !input.listingReference) {
      issue(["listingReference"], "required");
    }
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

// Receipt.

/** Acceptance state only: never the contact details, message or any other personal data. */
export interface InquiryReceipt {
  /** The logical submission identity (the submission key). */
  readonly receiptId: string;
  readonly status: "accepted";
  /** Human reference, e.g. RQ-2026-000042. */
  readonly reference: string;
  /** ISO 8601 instant the server committed the request. */
  readonly acceptedAt: string;
  readonly purpose: InquiryPurpose;
  readonly locale: PublicLocale;
  /** The public listing the request is about, if any. */
  readonly listingReference: string | null;
}

export interface SubmittedInquiry {
  readonly receipt: InquiryReceipt;
  /** True when this answers a retry of an already accepted submission. */
  readonly replayed: boolean;
  /** Operation id, a support reference for this command. */
  readonly operationId: string;
}

function toReceipt(row: typeof inquiries.$inferSelect): InquiryReceipt {
  const listing = (row.context as { listing?: { reference?: unknown } } | null)?.listing;
  return {
    receiptId: row.submissionKey,
    status: "accepted",
    reference: row.reference,
    acceptedAt: row.createdAt.toISOString(),
    purpose: row.purpose,
    locale: row.preferredLocale ?? "bg",
    listingReference: typeof listing?.reference === "string" ? listing.reference : null,
  };
}

// Intake.

export interface IntakeContext {
  /** Client IP for rate limiting; only its keyed hash is stored. */
  readonly ip: string;
  /** The browser's receipt session (from the cookie, or newly created for this response). */
  readonly receiptSession: string;
  readonly correlationId?: string;
  readonly now?: Date;
}

const operationType = "inquiry.receive";

/** The public listing a request may be about: one published in the page's locale. */
async function resolveListing(db: Executor, reference: string, locale: PublicLocale) {
  const parsed = parseReference(reference)?.reference ?? "";
  const [listing] = await loadPublishedListings(db, { references: [parsed] }, locale);
  if (!listing) {
    throw new AppError("validation_failed", { fieldErrors: { listingReference: ["not_found"] } });
  }
  return listing;
}

export async function submitInquiry(
  db: Executor,
  rawInput: unknown,
  context: IntakeContext,
): Promise<SubmittedInquiry> {
  const input = parseInquiry(rawInput);
  const criteria = input.criteria
    ? (() => {
        const { cursor: _cursor, ...normalized } = normalizeSearch({
          ...input.criteria,
          locale: input.locale,
        });
        return normalized;
      })()
    : null;
  const { submissionKey, website, ...payload } = input;
  const actor: Actor = { kind: "visitor", id: `submission:${submissionKey}` };
  const requestHash = hashRequest({ ...payload, criteria });

  // A retry of an accepted submission is answered from its receipt, never rate limited.
  let listing: Awaited<ReturnType<typeof resolveListing>> | null = null;
  if (!(await findOperation(db, actor, operationType, submissionKey))) {
    await enforceRateLimit(db, "inquiry.ip", context.ip);
    // Checked before the operation starts so a correctable mistake is not stored as its outcome.
    listing = input.listingReference
      ? await resolveListing(db, input.listingReference, input.locale)
      : null;
  }

  const result = await runOperation(
    db,
    { actor, type: operationType, idempotencyKey: submissionKey, requestHash },
    async ({ tx, operationId }) => {
      const now = context.now ?? new Date();
      const kind = input.contact.kind;
      const normalized =
        kind === "phone"
          ? (normalizePhone(input.contact.value) ?? "")
          : input.contact.value.toLowerCase();
      // Every request gets its own party: matching it to an existing one is a human triage
      // decision, never an automatic merge on a typed address.
      const [party] = await tx
        .insert(parties)
        .values({
          kind: "person",
          displayName: input.name ?? "Website visitor",
          preferredLocale: input.locale,
          contactPreferences: {
            channel: kind,
            ...(input.callbackWindow ? { callbackWindow: input.callbackWindow } : {}),
          },
        })
        .returning({ id: parties.id });
      if (!party) throw new Error("Party insert returned no row.");
      const [method] = await tx
        .insert(contactMethods)
        .values({
          partyId: party.id,
          kind,
          value: kind === "phone" ? normalized : input.contact.value,
          normalizedValue: normalized,
        })
        .returning({ id: contactMethods.id });
      if (!method) throw new Error("Contact method insert returned no row.");

      // A filled honeypot is held for human review, not silently dropped; the sender sees the
      // same receipt as anyone else.
      const automated = Boolean(website?.trim());
      const reference = await nextReference(tx, "inquiry", now);
      const [row] = await tx
        .insert(inquiries)
        .values({
          reference,
          state: automated ? "suspected_spam" : "received",
          purpose: input.purpose,
          source: "website",
          submissionKey,
          payloadDigest: requestHash,
          receiptSessionHash: receiptSessionHash(context.receiptSession),
          listingId: listing?.listingId ?? null,
          listingRevisionId: listing?.listingRevisionId ?? null,
          context: {
            listing: listing
              ? {
                  reference: listing.reference,
                  manifestId: listing.manifestId,
                  title: listing.title,
                  locale: listing.locale,
                }
              : null,
            criteria,
          },
          preferredName: input.name ?? null,
          contactMethodId: method.id,
          partyId: party.id,
          preferredLocale: input.locale,
          preferredChannel: kind,
          callbackWindow: input.callbackWindow ?? null,
          message: input.message ?? null,
          marketingOptIn: input.marketingOptIn,
          coverageQueue: inquiryCoverageQueue,
          dispositionReason: automated ? "automated_submission_signal" : null,
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error("Inquiry insert returned no row.");

      // Identifiers only: staff open the inquiry in triage, so no personal data travels.
      await recordOutboxEvent(tx, {
        eventType: "inquiry.received",
        subjectType: "inquiry",
        subjectId: row.id,
        payload: { reference, purpose: input.purpose, coverageQueue: inquiryCoverageQueue },
        operationId,
      });
      const about = listing ? ` about ${listing.reference}` : "";
      await recordActivity(tx, {
        recordType: "inquiry",
        recordId: row.id,
        reference,
        messageKey: "activity.inquiry.received",
        params: { purpose: input.purpose, listingReference: listing?.reference ?? null },
        summary: `Inquiry ${reference} received from the website (${input.purpose}${about}).`,
        actor,
        operationId,
        at: now,
      });
      await recordAudit(tx, {
        action: operationType,
        actor,
        capability: "inquiry.submit",
        recordType: "inquiry",
        recordId: row.id,
        operationId,
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        payload: {
          purpose: input.purpose,
          contactKind: kind,
          listingId: listing?.listingId ?? null,
          state: row.state,
        },
        at: now,
      });
      return toReceipt(row);
    },
  );
  return { receipt: result.outcome, replayed: result.replayed, operationId: result.operationId };
}

/**
 * The receipt of a submission, readable only by the receipt session that submitted it. Any
 * mismatch is the same not_found: a key or reference alone reveals nothing.
 */
export async function readInquiryReceipt(
  db: Executor,
  input: { readonly submissionKey: string; readonly receiptSession: string | null },
): Promise<InquiryReceipt> {
  if (!input.receiptSession || !isIssuedSubmissionKey(input.submissionKey)) {
    throw new AppError("not_found");
  }
  const [row] = await db
    .select()
    .from(inquiries)
    .where(
      and(
        eq(inquiries.submissionKey, input.submissionKey),
        eq(inquiries.receiptSessionHash, receiptSessionHash(input.receiptSession)),
      ),
    );
  if (!row) throw new AppError("not_found");
  return toReceipt(row);
}
