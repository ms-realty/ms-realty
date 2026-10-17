"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { decideCaseAccessRequest, requestCaseAccess } from "@/server/cases/access-requests";
import { revokeCaseParticipant } from "@/server/cases/participants";
import { processLocalInstant } from "@/server/compliance/local-time";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { findOperation } from "@/server/operations";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import {
  type AccessBinding,
  accessFields,
  accessOperationType,
  accessPath,
  accessScope,
} from "./contract";

export async function caseAccessAction(
  locale: string,
  binding: AccessBinding,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (!(binding.host === "staff" ? isStaffLocale(locale) : isPublicLocale(locale)))
    throw new AppError("not_found");
  const fields = accessFields[binding.command],
    scope = accessScope(binding),
    envelope = readFormEnvelope(form, scope),
    c = caseCopy(locale);
  const values = readFormValues<FormValues>(form, fields),
    operationId = envelope?.operationId ?? issueFormOperation(scope),
    path = accessPath(locale, binding.host, binding.caseId);
  const status = {
    href: `${path}?command=${binding.command}&key=${encodeURIComponent(operationId)}`,
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
  let recorded = false;
  const result = await action(
    async ({ db, session }) => {
      await requireAuthHost(binding.host);
      if (session?.actor.kind !== binding.host) throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      const base = {
        id: binding.caseId,
        operationId,
        expectedVersion: envelope.expectedRevision ?? 0,
      };
      try {
        if (binding.command === "revoke")
          return await revokeCaseParticipant(db, session, {
            ...base,
            participantId: binding.targetId ?? "",
            reason: values.reason ?? "",
          });
        if (binding.command === "invite" || binding.command === "remove")
          return await requestCaseAccess(db, session, {
            ...base,
            kind: binding.command,
            targetParticipantId:
              binding.command === "remove" ? (values.targetParticipantId ?? "") : null,
            targetEmail: binding.command === "invite" ? (values.targetEmail ?? "") : null,
            targetName: binding.command === "invite" ? (values.targetName ?? "") : null,
            requestedRole:
              binding.command === "invite" ? (values.requestedRole as "collaborator") : null,
            reason: values.reason ?? "",
          });
        return await decideCaseAccessRequest(db, session, {
          ...base,
          requestId: binding.targetId ?? "",
          decision: binding.command === "withdraw" ? "withdraw" : (values.decision as "approve"),
          clientOutcome: values.clientOutcome ?? "",
          accessExpiresAt: values.accessExpiresAt
            ? processLocalInstant(values.accessExpiresAt)
            : null,
        });
      } catch (error) {
        recorded =
          (
            await findOperation(
              db,
              session.actor,
              accessOperationType(binding.command),
              operationId,
            )
          )?.status === "failed";
        throw error;
      }
    },
    { requireSession: true },
  );
  if (result.ok) redirect(status.href);
  const error = result.error;
  if (error.code === "OPERATION_PENDING")
    return { ...state, outcome: { kind: "accepted", message: c.statusUnknown, status } };
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: c.statusUnknown, status },
    };
  if (error.code === "VALIDATION_FAILED" && !recorded)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: error.code,
        message: c.validation,
        fieldErrors: Object.fromEntries(
          fields.filter((f) => error.fieldErrors?.[f]).map((f) => [f, [c.validation]]),
        ),
      },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.code === "STEP_UP_REQUIRED" ? c.denied : c.conflict,
      retryable: false,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`
            : `${path}?review=${state.responseId}`,
        label: c.back,
      },
    },
  };
}
