"use server";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import {
  comparisonReturnHref,
  parseComparisonReferences,
  parseSelectedListingsJson,
} from "@/domain/inquiry-selection";
import { discoveryCopy } from "@/features/discovery/copy";
import {
  emptyInquiry,
  type InquiryState,
  type InquiryValues,
  inquiryPermalink,
  inquiryReceiptView,
  inquiryStatus,
} from "@/features/discovery/inquiry-state";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { AppError, isAppError } from "@/server/errors";
import { assertSameOrigin, clientIpFrom, correlationIdFrom } from "@/server/http/request";
import {
  isIssuedSubmissionKey,
  receiptCookieName,
  submitInquiry,
  validReceiptSession,
} from "@/server/inquiries/intake";
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
  try {
    const selectedListings = values.selectedListings
      ? parseSelectedListingsJson(values.selectedListings)
      : undefined;
    if (selectedListings === null)
      throw new AppError("validation_failed", { fieldErrors: { selectedListings: ["invalid"] } });
    const comparisonReferences = values.comparisonReferences
      ? parseComparisonReferences(values.comparisonReferences)
      : undefined;
    if (comparisonReferences === null)
      throw new AppError("validation_failed", {
        fieldErrors: { comparisonReferences: ["invalid"] },
      });
    const result = await submitInquiry(
      getDb(),
      {
        submissionKey: key,
        purpose: values.purpose,
        locale,
        name: values.name,
        contact: { kind: values.contactKind, value: values.contactValue },
        message: values.message,
        callbackWindow: values.callbackWindow,
        privacyNotice: values.privacyNotice === "true",
        listingReference: values.listingReference,
        observedManifestId: values.observedManifestId,
        selectedListings,
        comparisonReferences,
      },
      {
        ip: clientIpFrom(requestHeaders),
        receiptSession,
        correlationId: correlationIdFrom(requestHeaders),
      },
    );
    return {
      ...state,
      outcome: { kind: "confirmed", receipt: inquiryReceiptView(result.receipt, locale, copy) },
    };
  } catch (error) {
    if (isAppError(error) && error.code === "validation_failed") {
      const fields: Partial<Record<keyof InquiryValues, string[]>> = {};
      for (const name of Object.keys(error.fieldErrors ?? {})) {
        const field =
          name === "contact.kind"
            ? "contactKind"
            : name === "contact.value"
              ? "contactValue"
              : name.startsWith("selectedListings")
                ? "selectedListings"
                : name.startsWith("comparisonReferences")
                  ? "comparisonReferences"
                  : (name as keyof InquiryValues);
        if (field in emptyInquiry) fields[field] = [copy.invalid];
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
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: copy.changed,
          recovery: {
            href: values.selectedListings
              ? comparisonReturnHref(
                  locale,
                  parseSelectedListingsJson(values.selectedListings)?.map(
                    (item) => item.reference,
                  ) ?? [],
                )
              : values.comparisonReferences
                ? comparisonReturnHref(
                    locale,
                    parseComparisonReferences(values.comparisonReferences) ?? [],
                  )
                : `/${locale}/properties/${encodeURIComponent(values.listingReference)}/${encodeURIComponent(values.listingReference.toLowerCase())}`,
            label:
              values.selectedListings || values.comparisonReferences ? copy.compare : copy.back,
          },
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
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.notConfirmed, status },
    };
  }
}
