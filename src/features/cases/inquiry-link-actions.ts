"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { linkInquiryToExistingCase } from "@/server/cases/commands";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import {
  type InquiryLinkValues,
  inquiryLinkFields,
  inquiryLinkHref,
  inquiryLinkScope,
} from "./inquiry-link-contract";
import { inquiryLinkCopy } from "./inquiry-link-copy";

/** O03L submit (C02). A refusal changed nothing, so the form stays blocked until a fresh review. */
export async function linkInquiryAction(
  locale: string,
  id: string,
  _previous: FormState<InquiryLinkValues>,
  data: FormData,
): Promise<FormState<InquiryLinkValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = inquiryLinkCopy(locale);
  const scope = inquiryLinkScope(id);
  const values = readFormValues<InquiryLinkValues>(data, inquiryLinkFields);
  const envelope = readFormEnvelope(data, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const status = {
    href: inquiryLinkHref(locale, id, { key: operationId }),
    label: copy.checkStatus,
  };
  const state: FormState<InquiryLinkValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    reconciliation: status,
    values,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (ctx.session?.account.kind !== "staff") throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      return (
        await linkInquiryToExistingCase(ctx.db, ctx.session, {
          id,
          operationId: envelope.operationId,
          expectedVersion: envelope.expectedRevision,
          caseId: values.caseId,
          expectedCaseVersion: Number(values.expectedCaseVersion),
        })
      ).outcome;
    },
    { requireSession: true },
  );
  // The linked inquiry no longer offers this form, so a native POST also opens the result.
  if (result.ok) redirect(status.href);
  const error = result.error;
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.unknown, status },
    };
  const review = {
    href: inquiryLinkHref(locale, id, { caseId: values.caseId }),
    label: copy.reloadReview,
  };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: { kind: "conflict", code: error.code, message: copy.conflict, recovery: review },
    };
  const message =
    error.code === "NOT_AUTHORIZED"
      ? copy.denied
      : error.code === "NOT_FOUND"
        ? copy.missing
        : error.code === "UNAUTHENTICATED"
          ? copy.sessionEnded
          : error.code === "VALIDATION_FAILED"
            ? copy.invalid
            : copy.unavailable;
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message,
      retryable: false,
      recovery:
        error.code === "VALIDATION_FAILED"
          ? review
          : { href: `/${locale}/inquiries/${id}`, label: copy.backToInquiry },
    },
  };
}
