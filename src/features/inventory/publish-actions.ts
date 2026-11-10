"use server";
// ADR 0012 native form actions: publish one listing on one attestation, unpublish it, and
// publish a selection. Each call rechecks session, authority and input; the commands record.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { publicationPolicy } from "@/config/tenant";
import { isPublicLocale, isStaffLocale, type PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import { requireFreshAuth, requireLiveSession } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  type BulkPublishItem,
  type PublishBlockReason,
  publishListingByAttestation,
  publishSelection,
} from "@/server/publication/attested";
import { withdrawPublication } from "@/server/publication/commands";
import { approveListingLanguages, type LanguageResult } from "@/server/publication/languages";
import type { FormOutcome, FormState } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";
import { inventoryCopy } from "./copy";
import {
  blockReason,
  fillCopy,
  languageAttestation,
  languageName,
  publishCopy,
} from "./publish-copy";

export type PublishValues = { attested: string; note: string; rentPeriod: string };
export type UnpublishValues = { confirmed: string };
export type BulkPublishValues = { attested: string; selected: string };
export type LanguagesValues = { attested: string };

/** The languages ticked on a form; only public locales other than the source. */
function tickedLanguages(form: FormData): PublicLocale[] {
  return [
    ...new Set(
      form
        .getAll("language")
        .map(String)
        .filter((value): value is PublicLocale => isPublicLocale(value) && value !== "bg"),
    ),
  ];
}

function languageLine(locale: string, result: LanguageResult) {
  const copy = publishCopy(locale);
  const name = languageName(locale, result.locale);
  return result.status === "blocked"
    ? fillCopy(copy.languages.result, {
        language: name,
        reason:
          (copy.languages.reasons as Record<string, string>)[result.reason] ??
          copy.languages.reasons.other,
      })
    : fillCopy(copy.languages.result, { language: name, reason: copy.languages.live });
}

const referencePattern = /^[A-Z]{2}-[0-9A-Z-]{1,40}$/;

/** The ticked listings on a bulk form: valid references only, once each, in form order. */
function tickedReferences(form: FormData): string[] {
  return [
    ...new Set(
      form
        .getAll("reference")
        .map(String)
        .filter((value) => referencePattern.test(value)),
    ),
  ].slice(0, 200);
}

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
      "inland_framed_as_coast",
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
      const published = await publishListingByAttestation(db, session, {
        reference,
        operationId,
        expectedVersion: expectedRevision,
        attested: true,
        note: values.note,
        locale,
        cleanTitle: form.get("cleanTitle") === "yes",
        ...(values.rentPeriod === "month" ? { rentPeriod: "month" as const } : {}),
      });
      // The ticked languages follow the source in the same decision; each is checked again.
      const languages = tickedLanguages(form);
      if (published.status === "published" && languages.length)
        await approveListingLanguages(db, session, {
          reference,
          operationId,
          locales: languages,
          locale,
          attestation: (code) => languageAttestation(locale, code),
        });
      return published;
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
        // When an earlier step already took the live version offline, the screen says so.
        message: [
          blockReason(locale, reason),
          result.data.previousVersionOffline ? copy.previousOffline : "",
        ]
          .filter(Boolean)
          .join(" "),
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

/** The listing a result row opens: where its next step is, by what happened to it. */
function resultLine(locale: string, item: BulkPublishItem) {
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory/${encodeURIComponent(item.reference)}`;
  const base = {
    reference: item.reference,
    referenceLabel: item.reference,
    name: item.title || item.reference,
    nameLang: "bg",
  };
  const open = fillCopy(copy.ready.open, { reference: item.reference });
  if (item.status === "published") {
    // The old site's ending was removed on the person's tick: it is not a warning here.
    const warnings = item.warnings
      .filter((code) => code !== "title_site_suffix")
      .map((code) => copy.warnings[code]);
    return {
      ...base,
      status: warnings.length ? copy.ready.publishedWarning : copy.ready.published,
      ...(warnings.length ? { warning: warnings.join(" ") } : {}),
      link: { href: path, label: open },
    };
  }
  if (item.status === "not_attempted")
    return {
      ...base,
      warning: `${copy.ready.notAttempted}: ${copy.reasons.not_attempted}`,
      link: { href: `${path}/publish`, label: open },
    };
  const next = recovery(locale, item.reference, item.reason);
  return {
    ...base,
    warning: [
      `${copy.ready.needsAttention}: ${blockReason(locale, item.reason)}`,
      item.previousVersionOffline ? copy.previousOffline : "",
    ]
      .filter(Boolean)
      .join(" "),
    link: { href: next.href, label: open },
  };
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
  const selected = tickedReferences(form);
  const values: BulkPublishValues = {
    attested: form.get("attested") === "yes" ? "yes" : "",
    // The ticks survive an error: the same listings are still selected on the next screen.
    selected: selected.join(","),
  };
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
  // "Select a listing" belongs to the list; the attestation box says only what is its own.
  const fieldErrors: Partial<Record<keyof BulkPublishValues, string[]>> = {};
  if (values.attested !== "yes") fieldErrors.attested = [copy.attestationRequired];
  if (selected.length === 0) fieldErrors.selected = [copy.ready.noneSelected];
  if (!uuid.test(operationId))
    fieldErrors.attested = [...(fieldErrors.attested ?? []), copy.reasons.other];
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
    async ({ db }) =>
      publishSelection(db, await staffSession(db), {
        selection: selected.map((reference) => {
          const expectedVersion = Number(form.get(`version:${reference}`));
          return {
            reference,
            expectedVersion: Number.isSafeInteger(expectedVersion) ? expectedVersion : -1,
          };
        }),
        operationId,
        locale,
        cleanTitle: form.get("cleanTitles") === "yes",
        // The sentence the person read for the whole selection is the one recorded.
        attestationText: copy.ready.attestation,
      }),
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
        nextStep: copy.ready.resultNext,
        destination: { href: path, label: copy.ready.view },
        listings: {
          heading: copy.ready.results,
          note: copy.ready.resultLead,
          items: result.data.map((item) => resultLine(locale, item)),
        },
      },
    },
  };
}

/** Languages of one published listing, each on its own tick (the source is live already). */
export async function publishLanguagesAction(
  locale: string,
  reference: string,
  _previous: FormState<LanguagesValues>,
  form: FormData,
): Promise<FormState<LanguagesValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/publish`;
  const { operationId } = envelope(form);
  const state: FormState<LanguagesValues> = {
    values: { attested: "" },
    operationId,
    expectedRevision: null,
    responseId: randomUUID(),
    reconciliation: { href: path, label: copy.languages.heading },
    outcome: { kind: "idle" },
  };
  const languages = tickedLanguages(form);
  if (!uuid.test(operationId) || languages.length === 0)
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
    async ({ db }) =>
      approveListingLanguages(db, await staffSession(db), {
        reference,
        operationId,
        locales: languages,
        locale,
        attestation: (code) => languageAttestation(locale, code),
      }),
    { requireSession: true },
  );
  if (!result.ok)
    return {
      ...state,
      outcome: failure(
        locale,
        path,
        result.error,
        state.reconciliation ?? { href: path, label: path },
      ),
    };
  const now = new Date().toISOString();
  return {
    ...state,
    operationId: randomUUID(),
    outcome: {
      kind: "confirmed",
      receipt: {
        title: copy.languages.heading,
        reference,
        recordedAt: { dateTime: now, label: formatDateTime(locale as "bg", now) },
        nextStep: result.data.map((item) => languageLine(locale, item)).join(" "),
        destination: { href: path, label: copy.publishTitle.replace("{reference}", reference) },
      },
    },
  };
}

/** One language for a selection of published listings, on one attestation. */
export async function bulkLanguageAction(
  locale: string,
  language: string,
  _previous: FormState<BulkPublishValues>,
  form: FormData,
): Promise<FormState<BulkPublishValues>> {
  if (!isStaffLocale(locale) || !isPublicLocale(language) || language === "bg")
    throw new AppError("not_found");
  const copy = publishCopy(locale);
  const path = `/${locale}/inventory?view=ready&language=${language}`;
  const selected = tickedReferences(form);
  const values: BulkPublishValues = {
    attested: form.get("attested") === "yes" ? "yes" : "",
    selected: selected.join(","),
  };
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
  const fieldErrors: Partial<Record<keyof BulkPublishValues, string[]>> = {};
  if (values.attested !== "yes") fieldErrors.attested = [copy.attestationRequired];
  if (selected.length === 0) fieldErrors.selected = [copy.ready.noneSelected];
  if (!uuid.test(operationId))
    fieldErrors.attested = [...(fieldErrors.attested ?? []), copy.reasons.other];
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
  const name = languageName(locale, language);
  const attestation = fillCopy(copy.ready.languageAttest, { language: name });
  const result = await action(
    async ({ db }) => {
      const session = await staffSession(db);
      const out: { reference: string; result: LanguageResult }[] = [];
      for (const reference of selected) {
        const [item] = await approveListingLanguages(db, session, {
          reference,
          operationId: `${operationId}:${reference}`,
          locales: [language],
          locale,
          attestation: () => attestation,
        });
        if (item) out.push({ reference, result: item });
      }
      return out;
    },
    { requireSession: true },
  );
  if (!result.ok) return { ...state, outcome: failure(locale, path, result.error, status) };
  const published = result.data.filter((r) => r.result.status !== "blocked").length;
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
        nextStep: fillCopy(copy.ready.languageLead, { language: name }),
        destination: { href: path, label: copy.ready.view },
        listings: {
          heading: copy.ready.results,
          note: attestation,
          items: result.data.map(({ reference, result: item }) => ({
            reference,
            referenceLabel: reference,
            name: reference,
            ...(item.status === "blocked"
              ? { warning: `${copy.ready.needsAttention}: ${languageLine(locale, item)}` }
              : { status: copy.ready.published }),
            link: {
              href: `/${locale}/inventory/${encodeURIComponent(reference)}/publish`,
              label: copy.publishTitle.replace("{reference}", reference),
            },
          })),
        },
      },
    },
  };
}
