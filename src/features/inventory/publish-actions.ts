"use server";
// ADR 0012 native form actions: publish one listing on one attestation, unpublish it, and
// publish a selection. Each call rechecks session, authority and input; the commands record.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { publicationPolicy } from "@/config/tenant";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import { requireFreshAuth, requireLiveSession } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { action } from "@/server/http/next";
import { carryOverForListing } from "@/server/media/carry-over";
import { legacyMediaSource } from "@/server/media/legacy-source";
import {
  type AttestedPublishResult,
  type PublishBlockReason,
  publishListingByAttestation,
} from "@/server/publication/attested";
import { withdrawPublication } from "@/server/publication/commands";
import type { FormOutcome, FormState } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";
import { inventoryCopy } from "./copy";
import { blockReason, fillCopy, publishCopy } from "./publish-copy";

export type PublishValues = { attested: string; note: string; rentPeriod: string };
export type UnpublishValues = { confirmed: string };
export type BulkPublishValues = { attested: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function envelope(form: FormData) {
  const operationId = String(form.get(formFields.operationId) ?? "");
  const expectedRevision = Number(form.get(formFields.expectedRevision));
  return { operationId, expectedRevision };
}

async function staffSession(db: Parameters<Parameters<typeof action>[0]>[0]["db"]) {
  const access = await currentStaffAccess();
  if (access.state !== "ready") throw new AppError("unauthenticated");
  return requireLiveSession(db, access.session);
}

/** Where a person fixes a blocker: the editor for content, the detailed review otherwise. */
function recovery(locale: string, reference: string, reason: PublishBlockReason) {
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}`;
  if (reason === "changed_since_opened")
    return { href: `${path}/publish`, label: copy.publishTitle.replace("{reference}", reference) };
  if (
    [
      "title_missing",
      "description_missing",
      "price_undecided",
      "location_missing",
      "facts_incomplete",
    ].includes(reason)
  )
    return { href: path, label: copy.editListing };
  return { href: `${path}?tab=review`, label: copy.detailedReview };
}

function stepUp(locale: string, path: string) {
  return {
    href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`,
    label: inventoryCopy(locale).open,
  };
}

function failure<V extends Record<string, string>>(
  locale: string,
  path: string,
  error: { code: string; message: string; outcome?: string },
  status: { href: string; label: string },
): FormOutcome<V> {
  if (error.outcome === "unknown")
    return {
      kind: "unknown",
      code: "OUTCOME_UNKNOWN",
      message: inventoryCopy(locale).form.unknown,
      status,
    };
  return {
    kind: "rejected",
    code: error.code,
    message: error.code === "STEP_UP_REQUIRED" ? inventoryCopy(locale).blocked : error.message,
    retryable: false,
    recovery:
      error.code === "STEP_UP_REQUIRED"
        ? stepUp(locale, path)
        : { href: path, label: inventoryCopy(locale).open },
  };
}

/** O16 one decision: the attestation and Publish button on the listing's publish screen. */
export async function publishListingAction(
  locale: string,
  reference: string,
  _previous: FormState<PublishValues>,
  form: FormData,
): Promise<FormState<PublishValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/publish`;
  const values: PublishValues = {
    attested: form.get("attested") === "yes" ? "yes" : "",
    note: String(form.get("note") ?? "").slice(0, 1000),
    rentPeriod: form.get("rentPeriod") === "month" ? "month" : "",
  };
  const { operationId, expectedRevision } = envelope(form);
  const status = {
    href: `/${locale}/inventory/operations/${encodeURIComponent(operationId)}?reference=${encodeURIComponent(reference)}`,
    label: inventoryCopy(locale).operation,
  };
  const state: FormState<PublishValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  if (!uuid.test(operationId) || !Number.isSafeInteger(expectedRevision))
    return {
      ...state,
      outcome: failure(
        locale,
        path,
        { code: "VALIDATION_FAILED", message: copy.reasons.other },
        status,
      ),
    };
  if (values.attested !== "yes")
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: inventoryCopy(locale).form.errorSummary,
        fieldErrors: { attested: [copy.attestationRequired] },
      },
    };
  const result = await action(
    async ({ db }) => {
      const session = await staffSession(db);
      return publishListingByAttestation(db, session, {
        reference,
        operationId,
        expectedVersion: expectedRevision,
        attested: true,
        note: values.note,
        locale,
        ...(values.rentPeriod === "month" ? { rentPeriod: "month" as const } : {}),
      });
    },
    { requireSession: true },
  );
  if (result.ok && result.data.status === "published")
    redirect(`${path}?done=${encodeURIComponent(operationId)}`);
  if (
    result.ok &&
    result.data.status === "blocked" &&
    result.data.reason === "rent_period_unconfirmed"
  )
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: inventoryCopy(locale).form.errorSummary,
        fieldErrors: { rentPeriod: [copy.blockers.rent_period_unconfirmed] },
      },
    };
  if (result.ok && result.data.status === "blocked") {
    const reason = result.data.reason;
    return {
      ...state,
      // A blocked decision recorded nothing new; a fresh key lets the person try again later.
      operationId: randomUUID(),
      outcome: {
        kind: "rejected",
        code: "PUBLICATION_INELIGIBLE",
        message: blockReason(locale, reason),
        retryable: false,
        recovery: recovery(locale, reference, reason),
      },
    };
  }
  if (result.ok) throw new Error("Unexpected publishing result.");
  return { ...state, outcome: failure(locale, path, result.error, status) };
}

/** Unpublish: the existing withdrawal from every destination, with a plain recorded reason. */
export async function unpublishListingAction(
  locale: string,
  reference: string,
  _previous: FormState<UnpublishValues>,
  form: FormData,
): Promise<FormState<UnpublishValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/publish`;
  const values: UnpublishValues = { confirmed: form.get("confirmed") === "yes" ? "yes" : "" };
  const { operationId, expectedRevision } = envelope(form);
  const status = {
    href: `/${locale}/inventory/operations/${encodeURIComponent(operationId)}?reference=${encodeURIComponent(reference)}`,
    label: inventoryCopy(locale).operation,
  };
  const state: FormState<UnpublishValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  if (!uuid.test(operationId) || !Number.isSafeInteger(expectedRevision) || !values.confirmed)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: inventoryCopy(locale).form.errorSummary,
        fieldErrors: { confirmed: [copy.attestationRequired] },
      },
    };
  const result = await action(
    async ({ db }) => {
      const session = await staffSession(db);
      // ADR 0012: this brand's policy decides whether an active session is enough to unpublish.
      if (publicationPolicy.signIn === "recent") requireFreshAuth(session);
      return withdrawPublication(db, {
        actor: session.actor,
        operationId,
        expectedRevision,
        reference,
        reason: copy.unpublishReason,
      });
    },
    { requireSession: true },
  );
  if (result.ok) redirect(`${path}?unpublished=${encodeURIComponent(operationId)}`);
  return { ...state, outcome: failure(locale, path, result.error, status) };
}

/** Ready to publish: one attestation for the selected listings, one result per listing. */
export async function bulkPublishAction(
  locale: string,
  _previous: FormState<BulkPublishValues>,
  form: FormData,
): Promise<FormState<BulkPublishValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory?view=ready`;
  const values: BulkPublishValues = { attested: form.get("attested") === "yes" ? "yes" : "" };
  const { operationId } = envelope(form);
  const status = { href: path, label: copy.ready.view };
  const state: FormState<BulkPublishValues> = {
    values,
    operationId,
    expectedRevision: null,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const selected = [
    ...new Set(
      form
        .getAll("reference")
        .map(String)
        .filter((value) => /^[A-Z]{2}-[0-9A-Z-]{1,40}$/.test(value)),
    ),
  ].slice(0, 200);
  const fieldErrors: Partial<Record<keyof BulkPublishValues, string[]>> = {};
  if (values.attested !== "yes") fieldErrors.attested = [copy.attestationRequired];
  if (!uuid.test(operationId) || selected.length === 0)
    fieldErrors.attested = [...(fieldErrors.attested ?? []), copy.ready.noneSelected];
  if (Object.keys(fieldErrors).length)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: inventoryCopy(locale).form.errorSummary,
        fieldErrors,
      },
    };
  const result = await action(
    async ({ db }) => {
      const session = await staffSession(db);
      const results: AttestedPublishResult[] = [];
      for (const reference of selected) {
        const expectedVersion = Number(form.get(`version:${reference}`));
        results.push(
          await publishListingByAttestation(db, session, {
            reference,
            // One stable key per listing in this submission: a retry resumes, never repeats.
            operationId: `${operationId}:${reference}`,
            expectedVersion: Number.isSafeInteger(expectedVersion) ? expectedVersion : -1,
            attested: true,
            locale,
          }),
        );
      }
      return results;
    },
    { requireSession: true },
  );
  if (!result.ok) return { ...state, outcome: failure(locale, path, result.error, status) };
  const published = result.data.filter((r) => r.status === "published").length;
  const now = new Date().toISOString();
  return {
    ...state,
    operationId: randomUUID(),
    outcome: {
      kind: "confirmed",
      receipt: {
        title: copy.ready.results,
        reference: fillCopy(copy.ready.summary, {
          n: published,
          total: result.data.length - published,
        }),
        recordedAt: { dateTime: now, label: formatDateTime(locale as "bg", now) },
        nextStep: copy.ready.lead,
        destination: { href: path, label: copy.ready.view },
        listings: {
          heading: copy.ready.results,
          note: copy.lead,
          items: result.data.map((item) => ({
            reference: item.reference,
            referenceLabel: item.reference,
            name: item.reference,
            ...(item.status === "published"
              ? { status: copy.ready.published }
              : { warning: `${copy.ready.needsAttention}: ${blockReason(locale, item.reason)}` }),
            link: {
              href: `/${locale}/inventory/${encodeURIComponent(item.reference)}/publish`,
              label: copy.publishTitle.replace("{reference}", item.reference),
            },
          })),
        },
      },
    },
  };
}

/**
 * ADR 0016: copy this listing's photos from the old website now. A native form; the page reads
 * what happened from the photos themselves, so the only signal passed back is "try again".
 */
export async function copyLegacyPhotosAction(locale: string, reference: string) {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/publish`;
  const source = legacyMediaSource();
  if (!source) redirect(path);
  const result = await action(
    async ({ db }) => {
      const session = await staffSession(db);
      return carryOverForListing(db, fileServices(), source, session, reference);
    },
    { requireSession: true },
  );
  redirect(result.ok && !result.data.outcomes.unavailable ? path : `${path}?photos=retry`);
}
