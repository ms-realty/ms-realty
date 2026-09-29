"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { offboardStaff } from "@/server/auth/grants";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { offboardingCopy } from "./copy";
export async function offboardingAction(
  locale: string,
  id: string,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const scope = `staff.offboard:${id}`,
    path = `/${locale}/access/offboard/${id}`,
    c = caseCopy(locale);
  const fields = ["reason", "reviewed"] as const,
    values = readFormValues<FormValues>(form, fields),
    envelope = readFormEnvelope(form, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const status = { href: `${path}?receipt=${encodeURIComponent(operationId)}`, label: c.status };
  const state: FormState<FormValues> = {
    values: { ...values, reviewed: "" },
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      return offboardStaff(ctx.db, ctx.session, {
        operationId,
        principalId: id,
        expectedRevision: envelope.expectedRevision,
        reason: values.reason,
        reviewed: values.reviewed === "true",
      });
    },
    { requireSession: true },
  );
  if (result.ok) redirect(status.href);
  const error = result.error;
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: c.statusUnknown, status },
    };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code: error.code,
        message: c.conflict,
        recovery: { href: path, label: c.back },
      },
    };
  const next = issueFormOperation(scope),
    fresh = {
      ...state,
      operationId: next,
      reconciliation: { ...status, href: `${path}?receipt=${encodeURIComponent(next)}` },
    };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...fresh,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: c.validation,
        fieldErrors: Object.fromEntries(
          fields.filter((f) => error.fieldErrors?.[f]).map((f) => [f, [c.invalid]]),
        ),
      },
    };
  return {
    ...fresh,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.code === "STEP_UP_REQUIRED" ? offboardingCopy(locale).reauth : c.denied,
      retryable: false,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`
            : path,
        label: c.back,
      },
    },
  };
}
