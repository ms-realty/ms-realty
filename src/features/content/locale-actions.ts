"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { timeReasonMessage } from "@/i18n/time-copy";
import { requireAuthHost } from "@/server/auth/pages";
import {
  type ContentLocaleDecision,
  decideContentLocale,
  readContentLocaleWorkbench,
  saveContentLocale,
} from "@/server/content/locale-commands";
import { contentBody } from "@/server/content/public";
import { AppError } from "@/server/errors";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope } from "@/ui/form/server";
import type { DecisionValues } from "./actions";
import { contentBodyCopy } from "./body-copy";
import { type ContentBodyValues, contentBodyValues, readCompositionFields } from "./body-fields";
import { contentDraftInput } from "./body-input";
import { contentCopy } from "./copy";
import { contentLocaleCopy } from "./locale-copy";

export type LocaleContentValues = ContentBodyValues & { title: string };
export type ContentLocaleBinding = {
  sourceExpectedVersion: number;
  sourceVersionId: string;
  sourceVersionHash: string;
};

function destination(shell: string, id: string, target: string) {
  return `/${shell}/content/${id}/editions/${target}`;
}
function status(shell: string, id: string, target: string, kind: string, key: string) {
  return {
    href: `${destination(shell, id, target)}/operations?${new URLSearchParams({ kind, key })}`,
    label: contentCopy(shell).check,
  };
}
function formState<V extends FormValues>(
  shell: string,
  id: string,
  target: string,
  kind: string,
  scope: string,
  data: FormData,
  fields: (keyof V)[],
) {
  const envelope = readFormEnvelope(data, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  return {
    envelope,
    base: {
      operationId,
      expectedRevision: envelope?.expectedRevision ?? null,
      reconciliation: status(shell, id, target, kind, operationId),
      responseId: randomUUID(),
      values: readTimeFormValues<V>(data, fields),
      outcome: { kind: "idle" },
    } satisfies FormState<V>,
  };
}

export async function saveContentLocaleAction(
  shell: string,
  id: string,
  target: ContentLocaleDecision["locale"],
  binding: ContentLocaleBinding,
  _previous: FormState<LocaleContentValues>,
  data: FormData,
): Promise<FormState<LocaleContentValues>> {
  const scope = `content.locale.save.${id}.${target}`;
  const { envelope, base } = formState<LocaleContentValues>(
    shell,
    id,
    target,
    "save",
    scope,
    data,
    ["title", "text", "bodyFormat", "composition"],
  );
  base.values.composition = readCompositionFields(data, base.values.composition);
  const copy = contentCopy(shell),
    localized = contentLocaleCopy(shell);
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(shell)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      return (
        await saveContentLocale(ctx.db, ctx.session, {
          id,
          locale: target,
          ...binding,
          ...base.values,
          ...contentDraftInput(base.values),
          expectedVersion: envelope.expectedRevision,
          operationId: envelope.operationId,
        })
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok) redirect(status(shell, id, target, "save", base.operationId).href);
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: status(shell, id, target, "save", base.operationId),
      },
    };
  const operationId = issueFormOperation(scope);
  const next = {
    ...base,
    operationId,
    reconciliation: status(shell, id, target, "save", operationId),
  };
  if (["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)) {
    const latest = await action(
      async (ctx) => {
        await requireAuthHost("staff");
        if (!ctx.session) throw new AppError("unauthenticated");
        return readContentLocaleWorkbench(ctx.db, ctx.session, id, target);
      },
      { requireSession: true },
    );
    if (latest.ok) {
      const current = latest.data;
      const body = current.current ? contentBody.parse(current.current.body) : null;
      const sameSource =
        current.sourceReady &&
        current.page.version === binding.sourceExpectedVersion &&
        current.source?.version.id === binding.sourceVersionId &&
        current.source.version.contentHash === binding.sourceVersionHash;
      return {
        ...next,
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: localized.conflict,
          latest: {
            revision: current.edition?.version ?? 1,
            values: { title: body?.title ?? "", ...contentBodyValues(body) },
            details: [
              {
                label: localized.sourceRevision,
                value: String(current.source?.version.number ?? copy.none),
              },
            ],
          },
          ...(sameSource
            ? {
                reapply: {
                  operationId,
                  expectedRevision: current.edition?.version ?? 1,
                  status: status(shell, id, target, "save", operationId),
                },
              }
            : {}),
          recovery: { href: destination(shell, id, target), label: copy.open },
        },
      };
    }
  }
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...next,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.validation,
        fieldErrors: Object.fromEntries(
          Object.keys(result.error.fieldErrors ?? {})
            .map((field) => (field === "blocks" ? "composition" : field))
            .filter((field) => field in base.values)
            .map((field) => [
              field,
              [
                field === "composition" || field === "bodyFormat"
                  ? contentBodyCopy(shell).invalid
                  : copy.invalid,
              ],
            ]),
        ),
      },
    };
  return {
    ...next,
    outcome: {
      kind: "rejected",
      code: result.error.code,
      retryable: false,
      message: copy.failed,
      recovery: { href: destination(shell, id, target), label: copy.open },
    },
  };
}

export async function decideContentLocaleAction(
  shell: string,
  id: string,
  target: ContentLocaleDecision["locale"],
  binding: ContentLocaleBinding,
  decision: ContentLocaleDecision["decision"],
  _previous: FormState<DecisionValues>,
  data: FormData,
): Promise<FormState<DecisionValues>> {
  const scope = `content.locale.decide.${id}.${target}.${decision}`;
  const { envelope, base } = formState<DecisionValues>(shell, id, target, "decide", scope, data, [
    "note",
    "expiresAt",
    "reviewed",
  ]);
  const copy = contentCopy(shell),
    localized = contentLocaleCopy(shell);
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(shell)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision || base.values.reviewed !== "yes")
        throw new AppError("validation_failed");
      const expiresAt = base.values.expiresAt ? formInstant(base.values, "expiresAt") : undefined;
      return (
        await decideContentLocale(ctx.db, ctx.session, {
          id,
          locale: target,
          ...binding,
          expectedVersion: envelope.expectedRevision,
          operationId: envelope.operationId,
          decision,
          reviewed: true,
          note: base.values.note,
          ...(expiresAt ? { expiresAt } : {}),
        })
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok) redirect(status(shell, id, target, "decide", base.operationId).href);
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: status(shell, id, target, "decide", base.operationId),
      },
    };
  const operationId = issueFormOperation(scope);
  const next = {
    ...base,
    operationId,
    reconciliation: status(shell, id, target, "decide", operationId),
  };
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...next,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.validation,
        fieldErrors: Object.fromEntries(
          Object.entries(result.error.fieldErrors ?? {})
            .filter(([field]) => field in base.values)
            .map(([field, reasons]) => [
              field,
              [timeReasonMessage(isStaffLocale(shell) ? shell : "bg", reasons[0]) ?? copy.invalid],
            ]),
        ),
      },
    };
  if (["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code))
    return {
      ...next,
      outcome: {
        kind: "conflict",
        code: "REVISION_CONFLICT",
        message: localized.conflict,
        recovery: { href: destination(shell, id, target), label: copy.open },
      },
    };
  return {
    ...next,
    outcome: {
      kind: "rejected",
      code: result.error.code,
      retryable: false,
      message: copy.failed,
      recovery: { href: destination(shell, id, target), label: copy.open },
    },
  };
}
