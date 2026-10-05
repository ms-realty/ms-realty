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
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contactMethods, inquiries, listings, parties } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { type PublicLocale, parseReference, publicLocales } from "@/domain/ids";
import { type InquiryPurpose, inquiryPurposes } from "@/domain/inquiry";
import { contentReferenceSchema } from "@/domain/inquiry-content";
import { inquiryContentSnapshotSchema } from "@/domain/inquiry-content-snapshot";
import {
  comparisonReferencesSchema,
  type InquiryListingReceipt,
  inquiryListingReceiptSchema,
  selectedListingsSchema,
} from "@/domain/inquiry-selection";
import { ownerInquiryReceipt, ownerInquirySchema } from "@/domain/owner-inquiry";
import { pastViewingWindows, viewingPreferencesSchema } from "@/domain/viewing-preferences";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { type CookieOptions, serializeCookie } from "../auth/cookies";
import { getEnv, type ServerEnv } from "../config/env";
import { hashRequest, keyedHash, randomToken } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { getPublicListing } from "../listings/detail";
import type { PublicListingDetail } from "../listings/view-models";
import { findOperation, runOperation } from "../operations";
import { listingSlug, loadPublishedListings, presentationOf } from "../publication/presentation";
import { enforceRateLimit } from "../rate-limit";
import { nextReference } from "../references";
import { normalizeSearch } from "../search/search";
import { readInquiryContent } from "./content-context";

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
  return env.hosts.public.startsWith("https://") ? "__Host-msr_receipt" : "msr_receipt";
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
    secure: env.hosts.public.startsWith("https://"),
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

/** The inquiry payload; the transport registry (src/server/transport) publishes it as is. */
export const inquirySchema = z
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
    selectedListings: selectedListingsSchema.optional(),
    /** A bounded return destination, never additional inquiry subjects. */
    comparisonReferences: comparisonReferencesSchema.optional(),
    ownerInput: ownerInquirySchema.optional(),
    viewingPreferences: viewingPreferencesSchema.optional(),
    contentReference: contentReferenceSchema.optional(),
    /** The approved page the visitor actually reviewed. Optional for older/general clients. */
    observedManifestId: z.preprocess(blankAsUnset, z.uuid().optional()),
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
    if (input.selectedListings) {
      if (input.listingReference || input.observedManifestId) {
        issue(["selectedListings"], "ambiguous_listing_context");
      }
      if (input.purpose !== "question") issue(["purpose"], "selection_requires_question");
    }
    if (
      input.comparisonReferences &&
      (input.selectedListings ||
        !input.listingReference ||
        !input.comparisonReferences.includes(
          parseReference(input.listingReference)?.reference ?? "",
        ))
    ) {
      issue(["comparisonReferences"], "invalid_comparison_context");
    }
    if (input.observedManifestId && !input.listingReference) {
      issue(["listingReference"], "required");
    }
    if (input.viewingPreferences && input.purpose !== "viewing_request") {
      issue(["viewingPreferences"], "viewing_purpose_required");
    }
    if (input.ownerInput) {
      if (!["seller_consultation", "landlord_consultation"].includes(input.purpose))
        issue(["ownerInput"], "owner_purpose_required");
      if (input.listingReference || input.selectedListings)
        issue(["ownerInput"], "ambiguous_listing_context");
      const transaction = input.ownerInput.transaction;
      if (
        transaction &&
        transaction !== "unknown" &&
        transaction !== (input.purpose === "seller_consultation" ? "sale" : "long_term_rent")
      )
        issue(["ownerInput", "transaction"], "purpose_mismatch");
    }
    if (input.purpose === "service_consultation" && input.contentReference?.kind !== "service")
      issue(["contentReference"], "approved_service_context_required");
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

/** Structural identity stays stable so elapsed preferences cannot invalidate an accepted replay. */
function parseInquiryIntent(input: unknown): ParsedInquiry {
  const result = inquirySchema.safeParse(input);
  if (!result.success) {
    throw new AppError("validation_failed", { fieldErrors: fieldErrorsOf(result.error) });
  }
  return result.data;
}

function requireFutureViewingPreferences(input: ParsedInquiry, now = Date.now()) {
  const past = input.viewingPreferences ? pastViewingWindows(input.viewingPreferences, now) : [];
  if (past.length)
    throw new AppError("validation_failed", {
      fieldErrors: Object.fromEntries(
        past.map((index) => [`viewingPreferences.windows.${index}.startsAtLocal`, ["past_time"]]),
      ),
    });
}

/** Review uses the current clock; accepted submission replay uses structural intent. */
export function parseInquiry(input: unknown): ParsedInquiry {
  const parsed = parseInquiryIntent(input);
  requireFutureViewingPreferences(parsed);
  return parsed;
}

// Receipt.

/** Acceptance state only: never the contact details, message or any other personal data. */
export interface InquiryReceipt {
  readonly content?: z.infer<typeof inquiryContentSnapshotSchema>;
  readonly ownerInput?: ReturnType<typeof ownerInquiryReceipt>;
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
  readonly listing: InquiryListingReceipt | null;
  readonly selectedListings: InquiryListingReceipt[];
  readonly listingReference: string | null;
  readonly selectedListingReferences: string[];
  /** Navigation only; does not broaden the subject represented by listingReference. */
  readonly comparisonReferences: string[];
}

export interface SubmittedInquiry {
  readonly receipt: InquiryReceipt;
  /** True when this answers a retry of an already accepted submission. */
  readonly replayed: boolean;
  /** Operation id, a support reference for this command. */
  readonly operationId: string;
}

// Older saved contexts can lack a name or source locale. Keep the reference, but do not
// invent a title, substitute another locale, or consult a now-changed public listing.
const savedListingReceiptSchema = inquiryListingReceiptSchema.extend({
  title: inquiryListingReceiptSchema.shape.title.optional().catch(null),
  locale: inquiryListingReceiptSchema.shape.locale.optional().catch(null),
});

function receiptListing(value: unknown): InquiryListingReceipt | null {
  const parsed = savedListingReceiptSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    reference: parsed.data.reference,
    title: parsed.data.title ?? null,
    locale: parsed.data.locale ?? null,
  };
}

function toReceipt(row: typeof inquiries.$inferSelect): InquiryReceipt {
  const context = row.context as {
    listing?: unknown;
    ownerInput?: unknown;
    content?: unknown;
    selection?: unknown;
    comparisonReferences?: string[];
  } | null;
  const listing = receiptListing(context?.listing);
  const selectedListings = Array.isArray(context?.selection)
    ? context.selection.map(receiptListing).filter((item) => item !== null)
    : [];
  const content = inquiryContentSnapshotSchema.safeParse(context?.content);
  return {
    ...(content.success ? { content: content.data } : {}),
    receiptId: row.submissionKey,
    ...(ownerInquiryReceipt(context?.ownerInput)
      ? { ownerInput: ownerInquiryReceipt(context?.ownerInput) }
      : {}),
    status: "accepted",
    reference: row.reference,
    acceptedAt: row.createdAt.toISOString(),
    purpose: row.purpose,
    locale: row.preferredLocale ?? "bg",
    listing,
    selectedListings,
    listingReference: listing?.reference ?? null,
    selectedListingReferences: selectedListings.map((item) => item.reference),
    comparisonReferences: context?.comparisonReferences ?? [],
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
  const input = parseInquiryIntent(rawInput);
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
  if (!(await findOperation(db, actor, operationType, submissionKey))) {
    requireFutureViewingPreferences(input, context.now?.getTime());
    await enforceRateLimit(db, "inquiry.ip", context.ip);
    // Checked before the operation starts so a correctable mistake is not stored as its outcome.
    if (input.listingReference && !input.observedManifestId) {
      await resolveListing(db, input.listingReference, input.locale);
    }
  }

  // Source conflicts and elapsed preferences are correctable before acceptance. Roll back
  // their attempted operation so the same key can be used after an explicit fresh review.
  // Other settled outcomes retain the shared failed, pending and unknown contract.
  const settled = await db.transaction(async (outer) => {
    try {
      const result = await runOperation(
        outer,
        { actor, type: operationType, idempotencyKey: submissionKey, requestHash },
        async ({ tx, operationId }) => {
          // A successful replay never enters this callback; a new execution rechecks the clock.
          requireFutureViewingPreferences(input, context.now?.getTime());
          const now = context.now ?? new Date();
          const content = input.contentReference
            ? await readInquiryContent(tx, input.contentReference, input.locale)
            : null;
          const selection: (PublicListingDetail & { sourceUrl: string })[] = [];
          if (input.selectedListings) {
            // Lock in canonical order to avoid deadlocks; snapshots and intent retain visitor order.
            await tx
              .select({ id: listings.id })
              .from(listings)
              .where(
                inArray(
                  listings.reference,
                  input.selectedListings.map((item) => item.reference),
                ),
              )
              .orderBy(asc(listings.reference))
              .for("share");
            for (const selected of input.selectedListings) {
              const resolved = await getPublicListing(tx, {
                reference: selected.reference,
                locale: input.locale,
                now,
              });
              if (
                resolved.status !== "listing" ||
                resolved.listing.manifestId !== selected.observedManifestId ||
                resolved.listing.availability.primaryAction === "view_similar"
              ) {
                throw new AppError("version_conflict", {
                  current: { reason: "selection_changed" },
                });
              }
              selection.push({
                ...resolved.listing,
                sourceUrl: `${getEnv().canonicalOrigin}/${input.locale}/properties/${resolved.listing.reference}/${resolved.listing.slug}`,
              });
            }
          }
          let listing: Awaited<ReturnType<typeof resolveListing>> | null = null;
          if (input.listingReference) {
            // Publication commands take this row's update lock. Hold a share lock through the
            // inquiry commit, so approval/current-manifest changes cannot race the snapshot.
            await tx
              .select({ id: listings.id })
              .from(listings)
              .where(
                eq(listings.reference, parseReference(input.listingReference)?.reference ?? ""),
              )
              .for("share");
            try {
              listing = await resolveListing(tx, input.listingReference, input.locale);
            } catch (error) {
              if (
                !input.observedManifestId ||
                !(error instanceof AppError) ||
                error.code !== "validation_failed"
              )
                throw error;
              throw new AppError("version_conflict", { current: { reason: "listing_changed" } });
            }
            if (
              (input.observedManifestId && listing.manifestId !== input.observedManifestId) ||
              ((input.observedManifestId ||
                input.comparisonReferences ||
                input.purpose === "viewing_request") &&
                presentationOf(listing, now).primaryAction === "view_similar")
            ) {
              throw new AppError("version_conflict", { current: { reason: "listing_changed" } });
            }
          }
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
                      sourceUrl: `${getEnv().canonicalOrigin}/${listing.locale}/properties/${listing.reference}/${listingSlug(listing.reference)}`,
                    }
                  : null,
                ...(selection.length ? { selection } : {}),
                ...(input.comparisonReferences
                  ? { comparisonReferences: input.comparisonReferences }
                  : {}),
                criteria,
                ...(content ? { content } : {}),
                ...(input.ownerInput ? { ownerInput: input.ownerInput } : {}),
                ...(input.viewingPreferences
                  ? { viewingPreferences: input.viewingPreferences }
                  : {}),
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
          const about = selection.length
            ? ` about ${selection.map((item) => item.reference).join(", ")}`
            : listing
              ? ` about ${listing.reference}`
              : "";
          await recordActivity(tx, {
            recordType: "inquiry",
            recordId: row.id,
            reference,
            messageKey: "activity.inquiry.received",
            params: {
              purpose: input.purpose,
              listingReference: listing?.reference ?? null,
              selectedListingReferences: selection.map((item) => item.reference),
            },
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
      return { kind: "success" as const, result };
    } catch (error) {
      if (
        isAppError(error) &&
        (error.code === "version_conflict" ||
          (error.code === "validation_failed" &&
            Object.keys(error.fieldErrors ?? {}).some((field) =>
              field.startsWith("viewingPreferences.windows."),
            )))
      )
        throw error;
      return { kind: "error" as const, error };
    }
  });
  if (settled.kind === "error") throw settled.error;
  const result = settled.result;
  // Operation identity alone is not the receipt capability. This also fences a concurrent
  // replay from a different browser, and normalizes receipts created before selection support.
  const receipt = await readInquiryReceipt(db, {
    submissionKey,
    receiptSession: context.receiptSession,
  });
  return { receipt, replayed: result.replayed, operationId: result.operationId };
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
