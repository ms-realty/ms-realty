"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import {
  approveCaseProcess,
  approveProcessPolicy,
  recordCommission,
  recordProcessItem,
  recordServiceAgreement,
  recordSuspicion,
  revokeCaseEvidence,
  startCaseProcessReview,
} from "@/server/compliance/commands";
import { processLocalInstant } from "@/server/compliance/local-time";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { type ProcessBinding, processFields, processPath, processScope } from "./contract";

export async function processAction(
  locale: string,
  binding: ProcessBinding,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (!isStaffLocale(locale) || !Object.hasOwn(processFields, binding.command))
    throw new AppError("not_found");
  const scope = processScope(binding),
    c = caseCopy(locale),
    fields = processFields[binding.command];
  const values = readFormValues<FormValues>(form, fields),
    envelope = readFormEnvelope(form, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const basePath = processPath(locale, binding.caseId);
  const path = `${basePath}${binding.command === "suspicion" ? "/restricted" : ""}`;
  const status = {
    href: `${basePath}/operations?key=${encodeURIComponent(operationId)}`,
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
    async ({ db, session }) => {
      await requireAuthHost("staff");
      if (session?.account.kind !== "staff") throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      const base = {
        id: binding.caseId,
        operationId,
        expectedVersion: envelope.expectedRevision ?? 0,
      };
      const value = (name: string) => values[name] ?? "";
      const instant = (name: string) => processLocalInstant(value(name));
      const nullableInstant = (name: string) => (value(name) ? instant(name) : null);
      switch (binding.command) {
        case "policy": {
          const items = (name: string, category: "transaction" | "due_diligence") =>
            value(name)
              .split("\n")
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label, i) => ({
                code: `${category}_${i + 1}`,
                label,
                category,
                evidenceRequired: true,
                professionalRequired: true,
                allowNotApplicable: false,
              }));
          return approveProcessPolicy(db, session, {
            operationId,
            title: value("title"),
            country: value("country") as "BG",
            transaction: value("transaction") as "sale",
            participantCategory: value("participantCategory") as "unknown",
            documentVersionId: value("documentVersionId"),
            items: [
              ...items("transactionItems", "transaction"),
              ...items("partyItems", "due_diligence"),
            ],
            withdrawalDays: value("withdrawalDays") ? Number(value("withdrawalDays")) : Number.NaN,
            timezone: value("country") === "BG" ? "Europe/Sofia" : "Europe/Athens",
            expressStartRequired: value("expressStartRequired") === "true",
            retentionDays: value("retentionDays") ? Number(value("retentionDays")) : Number.NaN,
            professionalName: value("professionalName"),
            validUntil: instant("validUntil"),
          });
        }
        case "start":
          return startCaseProcessReview(db, session, {
            ...base,
            proposalRevisionId: value("proposalRevisionId"),
            policyId: value("policyId"),
            participantCategory: value("participantCategory") as "unknown",
            dueAt: instant("dueAt"),
          });
        case "item":
          return recordProcessItem(db, session, {
            ...base,
            reviewId: binding.reviewId ?? "",
            code: binding.code ?? "",
            partyScope: binding.partyScope ?? "",
            result: value("result") as "accepted",
            reason: value("reason"),
            evidenceVersionId: value("evidenceVersionId") || null,
            professionalName: value("professionalName"),
            validUntil: instant("validUntil"),
          });
        case "agreement":
          return recordServiceAgreement(db, session, {
            ...base,
            partyId: value("partyId"),
            policyId: value("policyId"),
            documentVersionId: value("documentVersionId"),
            channel: value("channel") as "distance",
            signedAt: instant("signedAt"),
            withdrawalInformedAt: nullableInstant("withdrawalInformedAt"),
            expressStartRequestedAt: nullableInstant("expressStartRequestedAt"),
            expressStartEvidenceVersionId: value("expressStartEvidenceVersionId") || null,
            commissionBasis: value("commissionBasis"),
            commissionPayerPartyId: value("commissionPayerPartyId"),
            validUntil: instant("validUntil"),
          });
        case "approve":
          return approveCaseProcess(db, session, { ...base, reviewId: binding.reviewId ?? "" });
        case "revoke":
          return revokeCaseEvidence(db, session, {
            ...base,
            targetId: binding.targetId ?? "",
            kind: binding.kind ?? "review",
            reason: value("reason"),
          });
        case "commission":
          return recordCommission(db, session, {
            ...base,
            agreementId: value("agreementId"),
            amountMinor: /^\d+$/.test(value("amountMinor"))
              ? Number(value("amountMinor"))
              : Number.NaN,
            invoiceReference: value("invoiceReference"),
          });
        case "suspicion":
          return recordSuspicion(db, session, {
            ...base,
            partyId: value("partyId"),
            policyId: value("policyId"),
            note: value("note"),
            externalReference: value("externalReference"),
            reportedAt: nullableInstant("reportedAt"),
          });
      }
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
  const key = issueFormOperation(scope);
  const next = {
    ...state,
    operationId: key,
    reconciliation: {
      href: `${basePath}/operations?key=${encodeURIComponent(key)}`,
      label: c.status,
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
