"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { operations } from "@/db/schema";
import { inventoryCopy } from "@/features/inventory/copy";
import { translationCopy } from "@/features/inventory/translation-copy";
import type { TranslationValues } from "@/features/inventory/translation-editor";
import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import { currentStaffAccess } from "@/server/auth/pages";
import { requireFreshAuth, requireLiveSession } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  decideTranslation,
  saveTranslation,
  translationWorkbench,
} from "@/server/inventory/translations";
import { type FormState, formFields } from "@/ui/form/contract";

export async function translationAction(
  locale: string,
  reference: string,
  language: string,
  sourceRevisionId: string,
  _previous: FormState<TranslationValues>,
  form: FormData,
): Promise<FormState<TranslationValues>> {
  if (!isStaffLocale(locale) || !isPublicLocale(language) || language === "bg")
    throw new AppError("not_found");
  const values: TranslationValues = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    intent: String(form.get("intent") ?? "save"),
    note: String(form.get("note") ?? ""),
    confirmed: String(form.get("confirmed") ?? ""),
  };
  const copy = translationCopy(locale),
    general = inventoryCopy(locale),
    href = `/${locale}/inventory/${reference}/translations/${language}`;
  const reapply = form.get(formFields.intent) === "reapply";
  const operationId = String(
    form.get(reapply ? formFields.reapplyOperationId : formFields.operationId) ?? "",
  );
  const expectedRevision = Number(
    form.get(reapply ? formFields.reapplyRevision : formFields.expectedRevision),
  );
  const reconciliation = {
    href: `/${locale}/inventory/operations/${operationId}`,
    label: general.operation,
  };
  const state: FormState<TranslationValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const session = await requireLiveSession(db, access.session);
      const common = {
        actor: session.actor,
        operationId,
        expectedRevision,
        reference,
        sourceRevisionId,
        locale: language,
      };
      const workbench = await translationWorkbench(db, session.actor, reference, language);
      if (values.intent !== "save") {
        const body = workbench.translation?.body as { description?: string } | null;
        if (
          values.title !== workbench.translation?.title ||
          values.description !== body?.description
        )
          throw new AppError("validation_failed", {
            fieldErrors: { description: [copy.saveFirst] },
          });
        if (values.intent === "approve") {
          requireFreshAuth(session);
          if (values.confirmed !== "yes")
            throw new AppError("validation_failed", {
              fieldErrors: { confirmed: [copy.confirmed] },
            });
        }
      }
      const saved =
        values.intent === "save"
          ? await saveTranslation(db, {
              ...common,
              title: values.title,
              description: values.description,
            })
          : await decideTranslation(db, {
              ...common,
              intent: values.intent as "submit" | "approve" | "reject",
              note: values.note,
              protectedFactsDigest: workbench.protectedFactsDigest,
            });
      const [receipt] = await db
        .select({ completedAt: operations.completedAt })
        .from(operations)
        .where(eq(operations.id, saved.operationId));
      if (!receipt?.completedAt) throw new AppError("outcome_unknown");
      return { saved, at: receipt.completedAt.toISOString() };
    },
    { requireSession: true },
  );
  // Approval locks the editor, so the destination can no longer host useActionState's
  // response. A durable receipt route works both before hydration and after approval.
  if (result.ok) redirect(`/${locale}/inventory/operations/${operationId}`);
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: general.form.errorSummary,
        fieldErrors: result.error.fieldErrors ?? {},
      },
    };
  if (result.error.code === "REVISION_CONFLICT") {
    const fresh = await action(
      async ({ db }) => {
        const access = await currentStaffAccess();
        if (access.state !== "ready") throw new AppError("unauthenticated");
        return translationWorkbench(db, access.session.actor, reference, language);
      },
      { requireSession: true },
    );
    if (fresh.ok && fresh.data.revision.id === sourceRevisionId) {
      const current = fresh.data.translation,
        key = randomUUID();
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: result.error.message,
          latest: {
            revision: current?.version ?? 0,
            values: {
              ...values,
              title: current?.title ?? "",
              description: (current?.body as { description?: string } | null)?.description ?? "",
            },
          },
          reapply: {
            operationId: key,
            expectedRevision: current?.version ?? 0,
            status: { href: `/${locale}/inventory/operations/${key}`, label: general.operation },
          },
        },
      };
    }
  }
  if (result.error.outcome === "unknown")
    return {
      ...state,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: general.form.unknown,
        status: reconciliation,
      },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: result.error.code,
      message: result.error.message,
      retryable: result.error.retryable,
      recovery: {
        href:
          result.error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(href)}`
            : href,
        label: copy.open,
      },
    },
  };
}
