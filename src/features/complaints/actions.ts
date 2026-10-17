"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { createComplaint, reviewComplaint } from "@/server/complaints/service";
import { processLocalInstant } from "@/server/compliance/local-time";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { type ComplaintCommand, complaintFields, complaintScope } from "./contract";
export async function complaintAction(
  locale: string,
  command: ComplaintCommand,
  id: string,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (!isStaffLocale(locale) || !Object.hasOwn(complaintFields, command))
    throw new AppError("not_found");
  const c = caseCopy(locale),
    scope = complaintScope(command, id),
    fields = complaintFields[command];
  const values = readFormValues<FormValues>(form, fields),
    envelope = readFormEnvelope(form, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope),
    path = `/${locale}/operations/complaints${command === "review" ? `/${id}` : ""}`;
  const status = {
    href: `/${locale}/operations/complaints/receipt?key=${encodeURIComponent(operationId)}`,
    label: c.status,
  };
  const state: FormState<FormValues> = {
    values,
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (ctx.session?.account.kind !== "staff") throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      const common = {
        operationId: envelope.operationId,
        ownerId: values.ownerId,
        dueAt: processLocalInstant(values.dueAt ?? ""),
        reviewed: values.reviewed === "true",
      };
      if (command === "create")
        return createComplaint(ctx.db, ctx.session, {
          ...common,
          channel: values.channel,
          sourceReference: values.sourceReference,
          description: values.description,
          receivedAt: processLocalInstant(values.receivedAt ?? ""),
        });
      return reviewComplaint(ctx.db, ctx.session, {
        ...common,
        id,
        expectedVersion: envelope.expectedRevision,
        state: values.state,
        note: values.note,
        outcome: values.outcome,
      });
    },
    { requireSession: true },
  );
  if (result.ok) redirect(status.href);
  state.values = { ...values, reviewed: "" };
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
  const nextKey = issueFormOperation(scope),
    next = {
      ...state,
      operationId: nextKey,
      reconciliation: {
        ...status,
        href: `/${locale}/operations/complaints/receipt?key=${encodeURIComponent(nextKey)}`,
      },
    };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...next,
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
    ...next,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: ["NOT_FOUND", "NOT_AUTHORIZED", "UNAUTHENTICATED"].includes(error.code)
        ? c.denied
        : c.transition,
      retryable: false,
      recovery: { href: path, label: c.back },
    },
  };
}
