"use server";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { inquiryReviewCopy } from "@/features/discovery/inquiry-review-copy";
import {
  emptyInquiry,
  type InquiryState,
  type InquiryValues,
  inquiryPermalink,
  inquiryReceiptView,
  inquiryStatus,
  inquiryUnknownMessage,
} from "@/features/discovery/inquiry-state";
import { viewingCopy } from "@/features/discovery/viewing-copy";
import { viewingErrorField } from "@/features/discovery/viewing-fields";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { isAppError } from "@/server/errors";
import { assertSameOrigin, clientIpFrom, correlationIdFrom } from "@/server/http/request";
import { readInquiryContent } from "@/server/inquiries/content-context";
import {
  isIssuedSubmissionKey,
  receiptCookieName,
  submitInquiry,
  validReceiptSession,
} from "@/server/inquiries/intake";
import {
  inquiryPayload,
  issueInquiryReview,
  refreshInquirySources,
  reviewInquirySources,
  validInquiryReview,
} from "@/server/inquiries/review";
import { formFields } from "@/ui/form/contract";

export async function sendInquiry(
  localeValue: string,
  _previous: InquiryState,
  data: FormData,
): Promise<InquiryState> {
  if (!isRoutableLocale(localeValue)) throw new Error("Invalid locale");
  const locale = localeValue,
    copy = discoveryCopy(locale),
    env = getEnv();
  const requestHeaders = await headers();
  assertSameOrigin(requestHeaders, env.hosts.public);
  const key = data.get(formFields.operationId);
  const values = Object.fromEntries(
    Object.keys(emptyInquiry).map((name) => [
      name,
      typeof data.get(name) === "string" ? String(data.get(name)).slice(0, 4001) : "",
    ]),
  ) as InquiryValues;
  const state: InquiryState = {
    operationId: typeof key === "string" ? key : "",
    expectedRevision: null,
    values,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
  const status = { href: inquiryStatus(locale, state.operationId), label: copy.checkOperation };
  state.reconciliation = status;
  if (
    typeof key !== "string" ||
    !isIssuedSubmissionKey(key) ||
    data.getAll(formFields.operationId).length !== 1 ||
    ["inquiryStage", "reviewToken", "editInquiry", "refreshSources"].some(
      (name) => data.getAll(name).length > 1,
    ) ||
    Object.keys(emptyInquiry).some((name) => data.getAll(name).length > 1)
  )
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "VALIDATION_FAILED",
        message: copy.invalid,
        retryable: false,
        recovery: { href: `/${locale}/inquire`, label: copy.newRequest },
      },
    };
  const receiptSession = validReceiptSession((await cookies()).get(receiptCookieName(env))?.value);
  if (!receiptSession)
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "RECEIPT_SESSION_REQUIRED",
        message: copy.notConfirmed,
        retryable: false,
        recovery: {
          href: inquiryPermalink(locale, key, values).replace("/inquire?", "/inquire/start?"),
          label:
            values.selectedListings || values.comparisonReferences ? copy.ask : copy.checkOperation,
        },
      },
    };
  if (data.get("editInquiry") === "1") return state;
  if (values.message.length > 2000)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.check,
        fieldErrors: { message: [copy.messageHint] },
      },
    };
  let submissionStarted = false;
  try {
    if (data.get("refreshSources") === "1") {
      const refreshed = await refreshInquirySources(getDb(), values, key, locale);
      Object.assign(values, refreshed);
    }
    const payload = inquiryPayload(values, key, locale);
    if (data.get("inquiryStage") !== "confirm" || data.get("refreshSources") === "1") {
      const listings = await reviewInquirySources(getDb(), payload);
      const content = payload.contentReference
        ? await readInquiryContent(getDb(), payload.contentReference, locale)
        : undefined;
      // Older single-property entries may not carry a manifest. Pin the approved source
      // displayed in this review so confirmation cannot silently accept a newer revision.
      if (values.listingReference && !values.observedManifestId && listings[0])
        values.observedManifestId = listings[0].manifestId;
      return {
        ...state,
        review: {
          token: issueInquiryReview(key, locale, receiptSession, values),
          listings,
          ownerInput: payload.ownerInput,
          viewingPreferences: payload.viewingPreferences,
          content,
        },
      };
    }
    if (!validInquiryReview(data.get("reviewToken"), key, locale, receiptSession, values))
      return {
        ...state,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: copy.check,
          fieldErrors: { message: [inquiryReviewCopy(locale).reviewNeeded] },
        },
      };
    submissionStarted = true;
    const result = await submitInquiry(getDb(), payload, {
      ip: clientIpFrom(requestHeaders),
      receiptSession,
      correlationId: correlationIdFrom(requestHeaders),
    });
    return {
      ...state,
      outcome: { kind: "confirmed", receipt: inquiryReceiptView(result.receipt, locale, copy) },
    };
  } catch (error) {
    if (isAppError(error) && error.code === "validation_failed") {
      const fields: Partial<Record<keyof InquiryValues, string[]>> = {};
      for (const name of Object.keys(error.fieldErrors ?? {})) {
        const field = name.startsWith("viewingPreferences")
          ? viewingErrorField(name)
          : name === "contact.kind"
            ? "contactKind"
            : name === "contact.value"
              ? "contactValue"
              : name.startsWith("ownerInput.")
                ? (
                    {
                      "ownerInput.locality": "ownerLocality",
                      "ownerInput.propertyType": "ownerPropertyType",
                      "ownerInput.transaction": "ownerTransaction",
                      "ownerInput.documentArea": "ownerDocumentArea",
                      "ownerInput.relationship": "ownerRelationship",
                      "ownerInput.propertyStatus": "ownerPropertyStatus",
                      "ownerInput.documentSource": "ownerDocumentSource",
                    } as const
                  )[name as "ownerInput.locality"]
                : name === "ownerInput"
                  ? "purpose"
                  : name.startsWith("selectedListings")
                    ? "selectedListings"
                    : name.startsWith("comparisonReferences")
                      ? "comparisonReferences"
                      : (name as keyof InquiryValues);
        if (field in emptyInquiry)
          fields[field] = [
            name.startsWith("viewingPreferences.windows")
              ? viewingCopy(locale).invalidTime
              : copy.invalid,
          ];
      }
      return {
        ...state,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: copy.check,
          fieldErrors: Object.keys(fields).length ? fields : { message: [copy.invalid] },
        },
      };
    }
    if (isAppError(error) && error.code === "version_conflict")
      return {
        ...state,
        sourcesChanged: true,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: copy.changed,
          fieldErrors: { contentReference: [inquiryReviewCopy(locale).sourcesChanged] },
        },
      };
    if (!submissionStarted)
      return {
        ...state,
        outcome: {
          kind: "rejected",
          code: "REVIEW_UNAVAILABLE",
          message: copy.failed,
          retryable: true,
        },
      };
    if (isAppError(error) && error.code === "idempotency_key_reused")
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: "IDEMPOTENCY_KEY_REUSED",
          message: copy.retained,
          recovery: status,
        },
      };
    if (isAppError(error) && error.code === "operation_pending")
      return { ...state, outcome: { kind: "accepted", message: copy.notConfirmed, status } };
    if (isAppError(error) && error.code === "rate_limited")
      return {
        ...state,
        outcome: {
          kind: "rejected",
          code: error.code,
          message: copy.rateLimited.replace(
            "{seconds}",
            String(Math.max(1, Math.ceil(error.retryAfterSeconds ?? 120))),
          ),
          retryable: true,
        },
      };
    if (isAppError(error) && error.outcome === "not_applied")
      return {
        ...state,
        outcome: {
          kind: "rejected",
          code: error.code,
          message: copy.failed,
          retryable: error.retryable,
        },
      };
    return {
      ...state,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: inquiryUnknownMessage(copy, state.operationId),
        status,
      },
    };
  }
}
