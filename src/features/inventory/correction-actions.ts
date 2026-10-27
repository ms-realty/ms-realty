"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { operations } from "@/db/schema";
import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { action } from "@/server/http/next";
import {
  openMaterialCorrection,
  reconcileMaterialCorrection,
} from "@/server/inventory/corrections";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope } from "@/ui/form/server";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";

export async function correctionAction(
  locale: string,
  reference: string,
  mode: "open" | "reconcile",
  previous: FormState<FormValues>,
  data: FormData,
): Promise<FormState<FormValues>> {
  const copy = staffWorkflowCopy(locale).correction;
  const scope = `inventory.correction.${mode}.${reference}`;
  const envelope = readFormEnvelope(data, scope);
  const values: FormValues = {};
  for (const key of new Set(data.keys())) {
    if (
      !/^(sourceReference|disputedFact|urgency|reviewed|impactHash|followUpAt|items|state_\d{1,3}|evidence_\d{1,3})$/.test(
        key,
      )
    )
      continue;
    const entries = data.getAll(key);
    values[key] =
      entries.length === 1 && typeof entries[0] === "string" ? entries[0].slice(0, 16_000) : "";
  }
  Object.assign(values, readTimeFormValues(data, ["followUpAt"]));
  const path = `/${locale}/inventory/${reference}/correction`;
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale) || !ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      const base = {
        operationId: envelope.operationId,
        expectedVersion: envelope.expectedRevision,
        impactHash: values.impactHash ?? "",
        reviewed: (values.reviewed === "yes") as true,
      };
      const execute = async () => {
        if (mode === "open")
          return openMaterialCorrection(
            ctx.db,
            ctx.session as NonNullable<typeof ctx.session>,
            reference,
            {
              ...base,
              sourceReference: values.sourceReference ?? "",
              disputedFact: values.disputedFact ?? "",
              urgency: values.urgency as "normal",
            },
          );
        let keys: unknown;
        try {
          keys = JSON.parse(values.items ?? "null");
        } catch {
          throw new AppError("validation_failed");
        }
        if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string"))
          throw new AppError("validation_failed");
        return reconcileMaterialCorrection(
          ctx.db,
          ctx.session as NonNullable<typeof ctx.session>,
          reference,
          {
            ...base,
            ...(values.followUpAt ? { followUpAt: formInstant(values, "followUpAt") } : {}),
            items: keys.map((key, index) => ({
              key,
              state: values[`state_${index}`] as "verified",
              evidence: values[`evidence_${index}`] ?? "",
            })),
          },
        );
      };
      const recorded = await execute();
      const [receipt] = await ctx.db
        .select({ at: operations.completedAt })
        .from(operations)
        .where(eq(operations.id, recorded.operationId));
      if (!receipt?.at) throw new AppError("outcome_unknown");
      return { at: receipt.at.toISOString() };
    },
    { requireSession: true },
  );
  const state = { ...previous, values, responseId: randomUUID() };
  if (result.ok) {
    revalidatePath(path);
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference,
          recordedAt: {
            dateTime: result.data.at,
            label: formatDateTime(isPublicLocale(locale) ? locale : "bg", result.data.at),
          },
          nextStep: copy.savedDetail,
          destination: { href: path, label: copy.refresh },
        },
      },
    };
  }
  const recovery = {
    href: `${path}/operations?type=${mode}&key=${encodeURIComponent(envelope?.operationId ?? previous.operationId)}`,
    label: copy.check,
  };
  if (result.error.outcome === "unknown")
    return {
      ...state,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.unknown,
        status: recovery,
      },
    };
  const canRetry = ["VALIDATION_FAILED", "TRANSITION_DENIED"].includes(result.error.code);
  return {
    ...state,
    ...(canRetry ? { operationId: issueFormOperation(scope) } : {}),
    outcome: {
      kind: "rejected",
      code: result.error.code,
      message: copy.failed,
      retryable: canRetry,
      recovery: canRetry ? recovery : { href: path, label: copy.refresh },
    },
  };
}
