"use server";
import { randomUUID } from "node:crypto";
import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import { requestAssistance, reviewAssistance } from "@/server/ai/assistance";
import { assistanceConfig } from "@/server/ai/config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { getJobQueue } from "@/server/jobs/web";
import type { FormState } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { aiCopy } from "./copy";
import { intakeAiCopy } from "./intake-copy";
import { localeAiCopy } from "./locale-copy";

export type AiValues = { task: string; decision: string; reviewed: string };
export async function assistanceAction(
  locale: string,
  id: string,
  mode: "request" | "review",
  _previous: FormState<AiValues>,
  data: FormData,
): Promise<FormState<AiValues>> {
  const copy = aiCopy(locale);
  const scope = `ai.${mode}.${id}`;
  const envelope = readFormEnvelope(data, scope);
  const values = readFormValues<AiValues>(data, ["task", "decision", "reviewed"]);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const path = `/${locale}/operations/assistance${mode === "review" ? `/${id}` : `?source=${id}`}`;
  const status = {
    href: mode === "request" ? `${path}&operation=${encodeURIComponent(operationId)}` : path,
    label: copy.check,
  };
  const state: FormState<AiValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision || values.reviewed !== "yes")
        throw new AppError("validation_failed");
      const base = {
        id,
        expectedVersion: envelope.expectedRevision,
        operationId: envelope.operationId,
      };
      if (mode === "review")
        return (
          await reviewAssistance(ctx.db, ctx.session, {
            ...base,
            decision: values.decision as "accepted" | "rejected",
            reviewed: true,
          })
        ).outcome;
      const config = assistanceConfig();
      if (!config.enabled) throw new AppError("unavailable");
      return (
        await requestAssistance(
          ctx.db,
          ctx.session,
          { ...base, task: values.task as "reply_draft", sourceReviewed: true },
          { config, queue: await getJobQueue() },
        )
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
          title: copy.saved,
          reference: result.data.id,
          recordedAt: { dateTime: result.data.recordedAt, label: result.data.recordedAt },
          nextStep: copy.next,
          destination: {
            href: `/${locale}/operations/assistance/${result.data.id}`,
            label: copy.open,
          },
        },
      },
    };
  if (result.error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.retained, status },
    };
  const nextOperationId = issueFormOperation(scope);
  return {
    ...state,
    operationId: nextOperationId,
    reconciliation: {
      href: mode === "request" ? `${path}&operation=${encodeURIComponent(nextOperationId)}` : path,
      label: copy.check,
    },
    outcome: {
      kind: "rejected",
      retryable: false,
      code: result.error.code,
      message: ["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)
        ? copy.changed
        : result.error.code === "DEPENDENCY_UNAVAILABLE" || result.error.code === "RATE_LIMITED"
          ? copy.disabled
          : copy.denied,
      recovery: { href: path, label: copy.refresh },
    },
  };
}

export async function localeAssistanceAction(
  locale: string,
  sourceId: string,
  reference: string,
  targetLocale: string,
  _previous: FormState<AiValues>,
  data: FormData,
): Promise<FormState<AiValues>> {
  const copy = aiCopy(locale),
    scope = `ai.locale.${sourceId}.${targetLocale}`;
  const envelope = readFormEnvelope(data, scope),
    operationId = envelope?.operationId ?? issueFormOperation(scope);
  const values = readFormValues<AiValues>(data, ["task", "decision", "reviewed"]);
  const path = `/${locale}/operations/assistance/locale?${new URLSearchParams({ reference, language: targetLocale })}`;
  const status = (key: string) => ({
    href: `${path}&operation=${encodeURIComponent(key)}`,
    label: copy.check,
  });
  const base: FormState<AiValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status(operationId),
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale) || !isPublicLocale(targetLocale) || targetLocale === "bg")
        throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision || values.reviewed !== "yes")
        throw new AppError("validation_failed");
      const config = assistanceConfig();
      if (!config.enabled) throw new AppError("unavailable");
      return (
        await requestAssistance(
          ctx.db,
          ctx.session,
          {
            id: sourceId,
            expectedVersion: envelope.expectedRevision,
            operationId,
            task: "locale.draft",
            targetLocale,
            sourceReviewed: true,
          },
          { config, queue: await getJobQueue() },
        )
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok)
    return {
      ...base,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference: result.data.id,
          recordedAt: { dateTime: result.data.recordedAt, label: result.data.recordedAt },
          nextStep: copy.next,
          destination: {
            href: `/${locale}/operations/assistance/${result.data.id}`,
            label: copy.open,
          },
        },
      },
    };
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: status(operationId),
      },
    };
  const key = issueFormOperation(scope);
  return {
    ...base,
    operationId: key,
    reconciliation: status(key),
    outcome: {
      kind: "rejected",
      retryable: false,
      code: result.error.code,
      message: ["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)
        ? localeAiCopy(locale).changed
        : copy.failed,
      recovery: { href: path, label: copy.refresh },
    },
  };
}

export async function intakeAssistanceAction(
  locale: string,
  sourceId: string,
  listingId: string,
  reference: string,
  _previous: FormState<AiValues>,
  data: FormData,
): Promise<FormState<AiValues>> {
  const copy = aiCopy(locale),
    scope = `ai.intake.${sourceId}.${listingId}`;
  const envelope = readFormEnvelope(data, scope),
    operationId = envelope?.operationId ?? issueFormOperation(scope);
  const values = readFormValues<AiValues>(data, ["task", "decision", "reviewed"]);
  const path = `/${locale}/operations/assistance/intake?${new URLSearchParams({ reference })}`;
  const status = (key: string) => ({
    href: `${path}&operation=${encodeURIComponent(key)}`,
    label: copy.check,
  });
  const base: FormState<AiValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status(operationId),
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision || values.reviewed !== "yes")
        throw new AppError("validation_failed");
      const config = assistanceConfig();
      if (!config.enabled) throw new AppError("unavailable");
      return (
        await requestAssistance(
          ctx.db,
          ctx.session,
          {
            id: sourceId,
            expectedVersion: envelope.expectedRevision,
            operationId,
            task: "intake.extract",
            listingId,
            sourceReviewed: true,
          },
          { config, queue: await getJobQueue() },
        )
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok)
    return {
      ...base,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference: result.data.id,
          recordedAt: { dateTime: result.data.recordedAt, label: result.data.recordedAt },
          nextStep: copy.next,
          destination: {
            href: `/${locale}/operations/assistance/${result.data.id}`,
            label: copy.open,
          },
        },
      },
    };
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: status(operationId),
      },
    };
  const key = issueFormOperation(scope);
  return {
    ...base,
    operationId: key,
    reconciliation: status(key),
    outcome: {
      kind: "rejected",
      retryable: false,
      code: result.error.code,
      message: ["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)
        ? intakeAiCopy(locale).changed
        : copy.failed,
      recovery: { href: path, label: copy.refresh },
    },
  };
}
