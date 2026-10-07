"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import {
  type ContentDecision,
  createContent,
  decideContent,
  readContentWorkbench,
  saveContent,
} from "@/server/content/commands";
import { contentBody } from "@/server/content/public";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { contentCopy } from "./copy";
export type ContentValues = {
  kind: string;
  slug: string;
  title: string;
  text: string;
  jurisdiction: string;
  reviewScope: string;
};
export type DecisionValues = { note: string; expiresAt: string; reviewed: string };

function status(locale: string, kind: string, id: string | null, key: string) {
  return {
    href: `/${locale}/content/operations?${new URLSearchParams({ kind, key, ...(id ? { id } : {}) })}`,
    label: contentCopy(locale).check,
  };
}
function state<V extends FormValues>(
  locale: string,
  kind: string,
  id: string | null,
  scope: string,
  data: FormData,
  fields: (keyof V)[],
) {
  const envelope = readFormEnvelope(data, scope),
    key = envelope?.operationId ?? issueFormOperation(scope);
  return {
    envelope,
    state: {
      operationId: key,
      expectedRevision: envelope?.expectedRevision ?? null,
      reconciliation: status(locale, kind, id, key),
      values: readFormValues<V>(data, fields),
      responseId: randomUUID(),
      outcome: { kind: "idle" },
    } satisfies FormState<V>,
  };
}
function saved<V extends FormValues>(
  base: FormState<V>,
  locale: string,
  result: { id: string; recordedAt: string },
): FormState<V> {
  const copy = contentCopy(locale);
  return {
    ...base,
    outcome: {
      kind: "confirmed",
      receipt: {
        title: copy.saved,
        reference: result.id,
        recordedAt: { dateTime: result.recordedAt, label: result.recordedAt },
        nextStep: copy.next,
        destination: { href: `/${locale}/content/${result.id}`, label: copy.open },
      },
    },
  };
}

export async function saveContentAction(
  locale: string,
  id: string | null,
  _previous: FormState<ContentValues>,
  data: FormData,
): Promise<FormState<ContentValues>> {
  const kind = id ? "save" : "create",
    scope = `content.${kind}${id ? `.${id}` : ""}`,
    copy = contentCopy(locale);
  const { envelope, state: base } = state<ContentValues>(locale, kind, id, scope, data, [
    "kind",
    "slug",
    "title",
    "text",
    "jurisdiction",
    "reviewScope",
  ]);
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope || (id && !envelope.expectedRevision)) throw new AppError("validation_failed");
      if (!id)
        return (
          await createContent(ctx.db, ctx.session, {
            ...base.values,
            kind: base.values.kind as "help",
            operationId: envelope.operationId,
          })
        ).outcome;
      return (
        await saveContent(ctx.db, ctx.session, {
          ...base.values,
          id,
          expectedVersion: envelope.expectedRevision as number,
          operationId: envelope.operationId,
        })
      ).outcome;
    },
    { requireSession: true },
  );
  if (result.ok) return saved(base, locale, result.data);
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: base.reconciliation ?? status(locale, kind, id, base.operationId),
      },
    };
  if (id && result.error.code === "REVISION_CONFLICT") {
    const latest = await action(
      async (ctx) => {
        await requireAuthHost("staff");
        if (!ctx.session) throw new AppError("unauthenticated");
        return readContentWorkbench(ctx.db, ctx.session, id);
      },
      { requireSession: true },
    );
    if (latest.ok) {
      const current = latest.data,
        body = contentBody.parse(current.current.body),
        operationId = issueFormOperation(scope);
      return {
        ...base,
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: copy.conflict,
          latest: {
            revision: current.page.version,
            values: {
              kind: current.page.kind,
              slug: current.page.slug,
              title: body.title,
              text: body.paragraphs.join("\n\n"),
              jurisdiction: current.current.jurisdiction ?? "",
              reviewScope: current.current.reviewScope ?? "",
            },
          },
          reapply: {
            operationId,
            expectedRevision: current.page.version,
            status: status(locale, kind, id, operationId),
          },
        },
      };
    }
  }
  const key = issueFormOperation(scope);
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...base,
      operationId: key,
      reconciliation: status(locale, kind, id, key),
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.validation,
        fieldErrors: Object.fromEntries(
          Object.keys(result.error.fieldErrors ?? {})
            .filter((field) => field in base.values)
            .map((field) => [field, [copy.invalid]]),
        ),
      },
    };
  return {
    ...base,
    operationId: key,
    reconciliation: status(locale, kind, id, key),
    outcome: {
      kind: "rejected",
      retryable: false,
      code: result.error.code,
      message: copy.failed,
      recovery: {
        href: id ? `/${locale}/content/${id}` : `/${locale}/content/new`,
        label: copy.open,
      },
    },
  };
}

export async function decideContentAction(
  locale: string,
  id: string,
  decision: ContentDecision["decision"],
  _previous: FormState<DecisionValues>,
  data: FormData,
): Promise<FormState<DecisionValues>> {
  const scope = `content.decide.${id}.${decision}`,
    copy = contentCopy(locale);
  const { envelope, state: base } = state<DecisionValues>(locale, "decide", id, scope, data, [
    "note",
    "expiresAt",
    "reviewed",
  ]);
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision || base.values.reviewed !== "yes")
        throw new AppError("validation_failed");
      const expiresAt = base.values.expiresAt ? `${base.values.expiresAt}:00Z` : undefined;
      return (
        await decideContent(ctx.db, ctx.session, {
          id,
          operationId: envelope.operationId,
          expectedVersion: envelope.expectedRevision,
          decision,
          note: base.values.note,
          reviewed: true,
          ...(expiresAt ? { expiresAt } : {}),
        })
      ).outcome;
    },
    { requireSession: true },
  );
  // A native POST may change the sibling review forms and their React identities. Use the
  // persisted actor-bound operation, not transient form state, as the success destination.
  if (result.ok) redirect(status(locale, "decide", id, base.operationId).href);
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.retained,
        status: base.reconciliation ?? status(locale, "decide", id, base.operationId),
      },
    };
  const key = issueFormOperation(scope);
  return {
    ...base,
    operationId: key,
    reconciliation: status(locale, "decide", id, key),
    outcome: {
      kind: "rejected",
      retryable: false,
      code: result.error.code,
      message: ["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)
        ? copy.conflict
        : copy.failed,
      recovery: { href: `/${locale}/content/${id}`, label: copy.open },
    },
  };
}
