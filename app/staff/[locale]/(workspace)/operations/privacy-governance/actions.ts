"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  emptyGovernanceDocument,
  type GovernanceKind,
  type GovernanceValues,
  governanceFromValues,
} from "@/domain/privacy-governance";
import { governanceCopy } from "@/features/privacy-governance/copy";
import type { StaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { reviewGovernance, saveGovernance } from "@/server/privacy-governance/service";
import type { FormState } from "@/ui/form/contract";
import { readFormEnvelope, readFormValues } from "@/ui/form/server";

async function execute(
  locale: StaffLocale,
  id: string,
  command: "save" | "review",
  data: FormData,
  values: GovernanceValues,
  document?: ReturnType<typeof governanceFromValues>,
): Promise<FormState<GovernanceValues>> {
  const copy = governanceCopy(locale),
    path = `/${locale}/operations/privacy-governance/${id}`,
    envelope = readFormEnvelope(data, `privacy_governance.${command}.${id}`),
    operationId = envelope?.operationId ?? "invalid",
    status = {
      href: `${path}/operations/${command}/${encodeURIComponent(operationId)}`,
      label: copy.check,
    },
    state: FormState<GovernanceValues> = {
      operationId,
      expectedRevision: envelope?.expectedRevision ?? null,
      values,
      responseId: randomUUID(),
      reconciliation: status,
      outcome: { kind: "idle" },
    };
  if (!envelope?.expectedRevision)
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "VALIDATION_FAILED",
        message: copy.invalid,
        retryable: false,
        recovery: { href: path, label: copy.reload },
      },
    };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const common = { id, operationId, expectedVersion: envelope.expectedRevision as number };
      const done =
        command === "save" && document
          ? await saveGovernance(db, access.session, { ...common, document })
          : await reviewGovernance(db, access.session, {
              ...common,
              expectedHash: values.expectedHash ?? "",
              reviewed: (values.reviewed === "yes") as true,
              note: values.note ?? "",
            });
      return done.outcome;
    },
    { requireSession: true },
  );
  if (result.ok) {
    revalidatePath("/staff/[locale]/operations/privacy-governance", "page");
    revalidatePath("/staff/[locale]/operations/privacy-governance/[id]", "page");
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: command === "save" ? copy.saved : copy.reviewed,
          reference: `${copy.version} ${result.data.version}`,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: formatDateTime(locale, result.data.recordedAt),
          },
          nextStep: command === "save" ? copy.savedNext : copy.reviewedNext,
          destination: { href: path, label: copy.reload },
        },
      },
    };
  }
  const error = result.error;
  if (["REVISION_CONFLICT", "IDEMPOTENCY_KEY_REUSED", "APPROVAL_STALE"].includes(error.code))
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code:
          error.code === "IDEMPOTENCY_KEY_REUSED" ? "IDEMPOTENCY_KEY_REUSED" : "REVISION_CONFLICT",
        message: copy.conflict,
        recovery: { href: path, label: copy.reload },
      },
    };
  if (error.outcome === "unknown" || error.code === "OPERATION_PENDING")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.pending, status },
    };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.invalid,
        fieldErrors: Object.fromEntries(
          Object.keys(error.fieldErrors ?? {}).map((key) => [key, [copy.invalid]]),
        ),
      },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.code === "STEP_UP_REQUIRED" ? copy.stepUp : copy.failed,
      retryable: error.retryable,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(status.href)}`
            : status.href,
        label: error.code === "STEP_UP_REQUIRED" ? copy.reauth : copy.check,
      },
    },
  };
}
export async function saveGovernanceAction(
  locale: StaffLocale,
  id: string,
  kind: GovernanceKind,
  _previous: FormState<GovernanceValues>,
  data: FormData,
) {
  const values = readFormValues<GovernanceValues>(data, Object.keys(emptyGovernanceDocument(kind)));
  let document: ReturnType<typeof governanceFromValues>;
  try {
    document = governanceFromValues(kind, values);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const envelope = readFormEnvelope(data, `privacy_governance.save.${id}`),
      copy = governanceCopy(locale);
    return {
      operationId: envelope?.operationId ?? "invalid",
      expectedRevision: envelope?.expectedRevision ?? null,
      responseId: randomUUID(),
      values,
      outcome: {
        kind: "validation" as const,
        code: "VALIDATION_FAILED" as const,
        message: copy.invalid,
        fieldErrors: Object.fromEntries(
          error.issues.map((issue) => [String(issue.path[0]), [copy.invalid]]),
        ),
      },
    };
  }
  return execute(locale, id, "save", data, values, document);
}
export async function reviewGovernanceAction(
  locale: StaffLocale,
  id: string,
  _previous: FormState<GovernanceValues>,
  data: FormData,
) {
  return execute(
    locale,
    id,
    "review",
    data,
    readFormValues<GovernanceValues>(data, ["expectedHash", "note", "reviewed"]),
  );
}
