"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPublicLocale, isStaffLocale, requestPathHeader } from "@/i18n/config";
import { executeAgencyCommand } from "@/server/agency-obligations/commands";
import { localReturnPath, requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import {
  type AgencyCommand,
  agencyCommands,
  agencyFields,
  agencyReceiptPath,
  agencyScope,
} from "./contract";
import { agencyCopy, caseReviewCopy } from "./copy";

export async function agencyAction(
  locale: string,
  command: AgencyCommand,
  id: string,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (
    !Object.hasOwn(agencyCommands, command) ||
    !(command === "clientConsent" ? isPublicLocale(locale) : isStaffLocale(locale))
  )
    throw new AppError("not_found");
  const scope = agencyScope(command, id),
    values = readTimeFormValues<FormValues>(form, agencyFields[command]),
    envelope = readFormEnvelope(form, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope),
    c = caseCopy(locale),
    copy = agencyCopy(locale),
    client = caseReviewCopy(locale);
  const status = {
    href: agencyReceiptPath(locale, command, id, operationId),
    label: command === "clientConsent" ? client.status : copy.status,
  };
  const state: FormState<FormValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values: { ...values, reviewed: "" },
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async ({ db, session }) => {
      const context = command === "clientConsent" ? "client" : "staff";
      await requireAuthHost(context);
      if (session?.account.kind !== context) throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      const raw: Record<string, unknown> = {
        ...values,
        id,
        operationId,
        expectedVersion: envelope.expectedRevision ?? 0,
        reviewed: values.reviewed === "true",
      };
      for (const field of ["caseId", "documentVersionId", "policyVersionId", "acceptedReference"])
        if (field in raw) raw[field] = values[field] || null;
      for (const field of ["acceptedAt", "validUntil"])
        if (field in raw) raw[field] = values[field] ? formInstant(values, field) : null;
      return executeAgencyCommand(db, session, command, raw);
    },
    { requireSession: true },
  );
  if (result.ok) {
    revalidatePath("/public/[locale]/reviews/[slug]", "page");
    redirect(status.href);
  }
  const error = result.error;
  if (error.code === "STEP_UP_REQUIRED" && command !== "clientConsent") {
    const returnTo =
      localReturnPath(
        (await headers()).get(requestPathHeader) ?? `/${locale}/operations/agency`,
        "staff",
        locale,
      ) ?? `/${locale}/operations/agency`;
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: error.code,
        message: copy.stepUp,
        retryable: false,
        recovery: {
          href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(returnTo)}`,
          label: copy.reauth,
        },
      },
    };
  }
  const unresolved = z
    .object({ operationKey: z.string().min(16).max(200) })
    .safeParse(error.current);
  if (unresolved.success)
    status.href = agencyReceiptPath(locale, command, id, unresolved.data.operationKey);
  if (error.outcome === "unknown" || error.code === "OPERATION_PENDING")
    return {
      ...state,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: command === "clientConsent" ? client.unresolved : copy.pending,
        status,
      },
    };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code: error.code,
        message: c.conflict,
        recovery: {
          href:
            command === "clientConsent"
              ? `/${locale}/reviews/${id}`
              : `/${locale}/operations/agency`,
          label: c.back,
        },
      },
    };
  const nextKey = issueFormOperation(scope);
  const next = {
    ...state,
    operationId: nextKey,
    reconciliation: { ...status, href: agencyReceiptPath(locale, command, id, nextKey) },
  };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...next,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: c.validation,
        fieldErrors: Object.fromEntries(
          agencyFields[command]
            .filter((field) => error.fieldErrors?.[field])
            .map((field) => [field, [c.invalid]]),
        ),
      },
    };
  return {
    ...next,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: c.denied,
      retryable: false,
      recovery: {
        href:
          command === "clientConsent" ? `/${locale}/reviews/${id}` : `/${locale}/operations/agency`,
        label: c.back,
      },
    },
  };
}
