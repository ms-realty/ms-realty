"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { displayLocale, isPublicLocale, isRoutableLocale, isStaffLocale } from "@/i18n/config";
import {
  arrangeAppointment,
  requestAppointment,
  respondToAppointment,
} from "@/server/appointments/service";
import { requireAuthHost } from "@/server/auth/pages";
import {
  addInterest,
  createCaseFromInquiry,
  postCaseMessage,
  respondToInterest,
  reviseBrief,
  updateNextAction,
} from "@/server/cases/commands";
import { approveCaseEmail, draftCaseEmail } from "@/server/cases/email";
import {
  acknowledgeBrief,
  changeCaseDisposition,
  handoverCase,
  requestCaseProposal,
  transitionCaseStage,
} from "@/server/cases/lifecycle";
import { acknowledgeOwnerPreview, bindSellerCase } from "@/server/cases/owner-preview";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import {
  type WorkflowCommand,
  workflowFields,
  workflowScope,
  workflowStatus,
  workflowTypes,
} from "./contract";
import { caseCopy } from "./copy";

const instant = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00Z` : value;

export async function workflowAction(
  context: "staff" | "client",
  locale: string,
  command: WorkflowCommand,
  id: string,
  _previous: FormState<FormValues>,
  data: FormData,
): Promise<FormState<FormValues>> {
  if (
    !["staff", "client"].includes(context) ||
    !(context === "staff" ? isStaffLocale(locale) : isRoutableLocale(locale)) ||
    !Object.hasOwn(workflowTypes, command)
  )
    throw new AppError("not_found");
  const copy = caseCopy(locale),
    scope = workflowScope(command, id);
  const fields = workflowFields[command] ?? [];
  const values = readFormValues<FormValues>(data, fields);
  if (command === "emailDraft") {
    for (const name of ["subscriptionIds", "documentVersionIds"] as const)
      values[name] = data
        .getAll(name)
        .map((value) => (typeof value === "string" ? value : "invalid"))
        .join("\n");
  }
  const envelope = readFormEnvelope(data, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const status = {
    href: workflowStatus(context, locale, command, id, operationId),
    label: copy.status,
  };
  const state: FormState<FormValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost(context);
      if (!ctx.session || ctx.session.account.kind !== context)
        throw new AppError("unauthenticated");
      if (!workflowTypes[command] || !envelope?.expectedRevision)
        throw new AppError("validation_failed");
      const base = {
        id,
        operationId: envelope.operationId,
        expectedVersion: envelope.expectedRevision,
      };
      const s = ctx.session,
        db = ctx.db;
      switch (command) {
        case "emailDraft":
          return (
            await draftCaseEmail(db, s, {
              ...base,
              subscriptionIds: values.subscriptionIds ? values.subscriptionIds.split("\n") : [],
              appointmentId: values.appointmentId || undefined,
              documentVersionIds: values.documentVersionIds
                ? values.documentVersionIds.split("\n")
                : [],
              subject: values.subject ?? "",
              body: values.body ?? "",
            })
          ).outcome;
        case "emailApprove":
          return (
            await approveCaseEmail(db, s, {
              ...base,
              messageId: values.messageId ?? "",
              messageVersion: Number(values.messageVersion),
              reviewHash: values.reviewHash ?? "",
              reviewed: values.reviewed === "true",
            })
          ).outcome;
        case "sellerBind":
          return (
            await bindSellerCase(db, s, {
              ...base,
              instructionId: values.instructionId ?? "",
              reviewed: values.reviewed === "true",
              reason: values.reason ?? "",
            })
          ).outcome;
        case "ownerAcknowledge":
          return (
            await acknowledgeOwnerPreview(db, s, {
              ...base,
              reference: values.reference ?? "",
              previewHash: values.previewHash ?? "",
              reviewed: values.reviewed === "true",
            })
          ).outcome;
        case "acknowledge":
          return (
            await acknowledgeBrief(db, s, {
              ...base,
              briefId: values.briefId ?? "",
              reviewed: values.reviewed === "true",
            })
          ).outcome;
        case "proposalRequest":
          return (
            await requestCaseProposal(db, s, {
              ...base,
              interestId: values.interestId ?? "",
              reviewed: values.reviewed === "true",
            })
          ).outcome;
        case "stage":
          return (
            await transitionCaseStage(db, s, {
              ...base,
              stage: values.stage ?? "",
              reason: values.reason ?? "",
              completionEvidenceId: values.completionEvidenceId ?? "",
              outcome: values.outcome ?? "",
              retention: values.retention ?? "",
              aftercare: values.aftercare ?? "",
              handover: values.handover ?? "",
            })
          ).outcome;
        case "disposition":
          return (
            await changeCaseDisposition(db, s, {
              ...base,
              state: values.state as "active",
              reason: values.reason ?? "",
              waitingOn: values.waitingOn ?? "",
              reviewAt: instant(values.reviewAt ?? ""),
              outcome: values.outcome ?? "",
              retention: values.retention ?? "",
              aftercare: values.aftercare ?? "",
              nextAction: values.nextAction ?? "",
              dueAt: instant(values.dueAt ?? ""),
            })
          ).outcome;
        case "handover":
          return (
            await handoverCase(db, s, {
              ...base,
              action: values.action as "request",
              receiverId: values.receiverId ?? "",
              reason: values.reason ?? "",
              reviewed: values.reviewed === "true",
              snapshotHash: values.snapshotHash ?? "",
            })
          ).outcome;
        case "create":
          return (
            await createCaseFromInquiry(db, s, {
              ...base,
              kind: values.kind as "buyer",
              title: values.title ?? "",
              nextAction: values.nextAction ?? "",
              dueAt: instant(values.dueAt ?? ""),
              requirements: values.requirements ?? "",
              preferences: values.preferences ?? "",
            })
          ).outcome;
        case "next":
          return (
            await updateNextAction(db, s, {
              ...base,
              nextAction: values.nextAction ?? "",
              dueAt: instant(values.dueAt ?? ""),
              clientSummary: values.clientSummary ?? "",
            })
          ).outcome;
        case "brief":
          return (
            await reviseBrief(db, s, {
              ...base,
              requirements: values.requirements ?? "",
              preferences: values.preferences ?? "",
            })
          ).outcome;
        case "interest":
          return (
            await addInterest(db, s, {
              ...base,
              reference: values.reference ?? "",
              explanation: values.explanation ?? "",
            })
          ).outcome;
        case "feedback":
          return (
            await respondToInterest(db, s, {
              ...base,
              state: values.state as "shortlisted",
              reason: values.reason ?? "",
            })
          ).outcome;
        case "message":
        case "note":
          return (
            await postCaseMessage(db, s, {
              ...base,
              body: values.body ?? "",
              audience: command === "note" ? "internal" : "case_participants",
              reviewed: values.reviewed === "true",
            })
          ).outcome;
        case "request":
          return (
            await requestAppointment(db, s, {
              ...base,
              interestId: values.interestId ?? "",
              preferredWindow: values.preferredWindow ?? "",
              ...(values.participantPartyId
                ? { participantPartyId: values.participantPartyId }
                : {}),
            })
          ).outcome;
        case "arrange":
          return (
            await arrangeAppointment(db, s, {
              ...base,
              action: values.action as "propose",
              startsAt: values.startsAt ?? "",
              endsAt: values.endsAt ?? "",
              bufferMinutes: /^\d{1,3}$/.test(values.bufferMinutes ?? "")
                ? Number(values.bufferMinutes)
                : Number.NaN,
              propertyAccessConfirmed: values.propertyAccessConfirmed === "true",
              externalBusyChecked: values.externalBusyChecked === "true",
              accessNotes: values.accessNotes ?? "",
            })
          ).outcome;
        case "appointment":
          return (
            await respondToAppointment(db, s, {
              ...base,
              state: values.state as "cancelled",
              reason: values.reason ?? "",
            })
          ).outcome;
      }
    },
    { requireSession: true },
  );
  if (result.ok) {
    // Acceptance/cancellation removes the submitted form. Keep the recorded outcome
    // visible after a native POST by opening its actor-bound receipt instead.
    if (command === "handover") redirect(status.href);
    const appointment = ["request", "arrange", "appointment"].includes(command);
    const destination = `/${locale}/${appointment ? (context === "staff" ? "calendar" : "appointments") : context === "staff" ? "cases" : "overview"}/${result.data.id}${command === "emailDraft" || command === "emailApprove" ? "/email" : ""}`;
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference: result.data.reference,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: `${new Intl.DateTimeFormat(isPublicLocale(locale) ? displayLocale(locale) : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(result.data.recordedAt))} Europe/Sofia`,
          },
          nextStep: copy.nextStep,
          destination: { href: destination, label: copy.back },
        },
      },
    };
  }
  const error = result.error;
  if (error.code === "STEP_UP_REQUIRED")
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: error.code,
        message: "Confirm your identity again. Your draft is retained.",
        retryable: false,
        recovery: {
          href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/${context === "staff" ? "cases" : "overview"}/${id}`)}`,
          label: "Confirm your identity",
        },
      },
    };
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.statusUnknown, status },
    };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: { kind: "conflict", code: error.code, message: copy.conflict, recovery: status },
    };
  const key = issueFormOperation(scope);
  const fresh = {
    ...state,
    operationId: key,
    reconciliation: { href: workflowStatus(context, locale, command, id, key), label: copy.status },
  };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...fresh,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.validation,
        fieldErrors: Object.fromEntries(
          fields
            .filter((field) => error.fieldErrors?.[field])
            .map((field) => [field, [copy.invalid]]),
        ),
      },
    };
  const explanation = error.fieldErrors?.form?.includes("appointment_conflict")
    ? copy.calendarConflict
    : ["NOT_FOUND", "NOT_AUTHORIZED", "UNAUTHENTICATED"].includes(error.code)
      ? copy.denied
      : copy.transition;
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: explanation,
      retryable: false,
      recovery: status,
    },
  };
}
