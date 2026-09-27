"use server";
import { randomUUID } from "node:crypto";
import { displayLocale, isPublicLocale, isRoutableLocale, isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  createProposal,
  recordProposalDecision,
  reviseProposal,
  transitionProposal,
} from "@/server/proposals/service";
import { amountToMinor } from "@/server/proposals/terms";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import {
  type ProposalCommand,
  proposalFields,
  proposalScope,
  proposalStatus,
  proposalTypes,
} from "./contract";
import { proposalCopy } from "./copy";

const lines = (value: string | undefined) =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
export async function proposalAction(
  context: "staff" | "client",
  locale: string,
  command: ProposalCommand,
  id: string,
  _previous: FormState<FormValues>,
  data: FormData,
): Promise<FormState<FormValues>> {
  if (
    !["staff", "client"].includes(context) ||
    !(context === "staff" ? isStaffLocale(locale) : isRoutableLocale(locale)) ||
    !Object.hasOwn(proposalTypes, command)
  )
    throw new AppError("not_found");
  const c = caseCopy(locale),
    p = proposalCopy(locale),
    scope = proposalScope(command, id);
  const fields = proposalFields[command],
    values = readFormValues<FormValues>(data, fields),
    envelope = readFormEnvelope(data, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const status = { href: proposalStatus(locale, command, id, operationId), label: c.status };
  const state: FormState<FormValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    responseId: randomUUID(),
    values,
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost(context);
      if (!ctx.session || ctx.session.account.kind !== context)
        throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      const base = {
        id,
        operationId: envelope.operationId,
        expectedVersion: envelope.expectedRevision,
      };
      const terms = {
        clientPartyId: values.clientPartyId ?? "",
        amountMinor: amountToMinor(values.amount ?? ""),
        currency: values.currency as "EUR",
        period: values.period as "total",
        paymentBasis: values.paymentBasis ?? "",
        conditions: lines(values.conditions),
        inclusions: lines(values.inclusions),
        deadline: values.deadline ?? "",
      };
      if (command === "create")
        return (
          await createProposal(ctx.db, ctx.session, {
            ...base,
            interestId: values.interestId ?? "",
            ...terms,
          })
        ).outcome;
      if (command === "revise")
        return (
          await reviseProposal(ctx.db, ctx.session, {
            ...base,
            revisionId: values.revisionId ?? "",
            reason: values.reason ?? "",
            ...terms,
          })
        ).outcome;
      if (command === "decide")
        return (
          await recordProposalDecision(ctx.db, ctx.session, {
            ...base,
            revisionId: values.revisionId ?? "",
            state: values.state as "declined",
            reason: values.reason ?? "",
          })
        ).outcome;
      return (
        await transitionProposal(ctx.db, ctx.session, {
          ...base,
          revisionId: values.revisionId ?? "",
          action: command,
          reviewed: values.reviewed === "true",
          reason: values.reason ?? "",
        })
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok)
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: c.saved,
          reference: result.data.reference,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: `${new Intl.DateTimeFormat(isPublicLocale(locale) ? displayLocale(locale) : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(result.data.recordedAt))} Europe/Sofia`,
          },
          nextStep: c.nextStep,
          destination: { href: `/${locale}/proposals/${result.data.id}`, label: c.back },
        },
      },
    };
  const error = result.error;
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: c.statusUnknown, status },
    };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: { kind: "conflict", code: error.code, message: c.conflict, recovery: status },
    };
  if (error.code === "VALIDATION_FAILED") {
    const key = issueFormOperation(scope);
    const fieldErrors = Object.fromEntries(
      fields
        .filter(
          (field) =>
            error.fieldErrors?.[field] || (field === "amount" && error.fieldErrors?.amountMinor),
        )
        .map((field) => [field, [c.invalid]]),
    );
    return {
      ...state,
      operationId: key,
      reconciliation: { href: proposalStatus(locale, command, id, key), label: c.status },
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: c.validation,
        fieldErrors,
      },
    };
  }
  const returnPath = command === "create" ? `/${locale}/cases/${id}` : `/${locale}/proposals/${id}`;
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      retryable: false,
      message:
        error.code === "STEP_UP_REQUIRED"
          ? p.reverifyNotice
          : error.fieldErrors?.agreement
            ? p.agreementBlocked
            : error.code === "APPROVAL_STALE"
              ? p.changed
              : c.transition,
      recovery:
        error.code === "STEP_UP_REQUIRED"
          ? {
              href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(returnPath)}`,
              label: p.reverify,
            }
          : status,
    },
  };
}
