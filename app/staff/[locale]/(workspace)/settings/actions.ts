"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { settingsCopy } from "@/features/identity/settings-copy";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import {
  type ProfileValues,
  profileName,
  profileOperation,
  readStaffProfile,
  readStaffProfileOperation,
  saveStaffProfile,
} from "@/server/auth/profile";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";

export async function saveProfile(
  locale: string,
  _previous: FormState<ProfileValues>,
  data: FormData,
): Promise<FormState<ProfileValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = settingsCopy(locale);
  const values = readFormValues<ProfileValues>(data, ["displayName"]);
  const envelope = readFormEnvelope(data, profileOperation);
  const key = envelope?.operationId ?? "invalid";
  const status = {
    href: `/${locale}/settings/operations/${encodeURIComponent(key)}`,
    label: copy.profileStatus,
  };
  const state: FormState<ProfileValues> = {
    values,
    operationId: key,
    expectedRevision: envelope?.expectedRevision ?? null,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  if (!envelope || envelope.expectedRevision === null)
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "VALIDATION_FAILED",
        message: copy.invalidForm,
        retryable: false,
        recovery: { href: `/${locale}/settings`, label: copy.openSettings },
      },
    };
  if (!profileName.safeParse(values.displayName).success)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: workCopy(locale).form.errorSummary,
        fieldErrors: { displayName: [copy.invalidName] },
      },
    };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const saved = await saveStaffProfile(db, access.session, {
        displayName: values.displayName,
        operationId: envelope.operationId,
        expectedVersion: envelope.expectedRevision,
      });
      const receipt = await readStaffProfileOperation(db, access.session, envelope.operationId);
      if (!receipt?.completedAt || receipt.status !== "succeeded")
        throw new AppError("outcome_unknown");
      return { saved: saved.outcome, completedAt: receipt.completedAt.toISOString() };
    },
    { requireSession: true },
  );
  if (result.ok) {
    revalidatePath("/staff/[locale]", "layout");
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference: result.data.saved.displayName,
          recordedAt: {
            dateTime: result.data.completedAt,
            label: formatDateTime(locale, result.data.completedAt),
          },
          nextStep: copy.savedNext,
          destination: { href: `/${locale}/settings`, label: copy.openSettings },
        },
      },
    };
  }
  const error = result.error;
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED") {
    const latest = await action(
      async ({ db }) => {
        const access = await currentStaffAccess();
        if (access.state !== "ready") throw new AppError("unauthenticated");
        return readStaffProfile(db, access.session);
      },
      { requireSession: true },
    );
    if (latest.ok) {
      const next = issueFormOperation(profileOperation);
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: error.code,
          message: copy.conflict,
          latest: {
            revision: latest.data.version,
            values: { displayName: latest.data.displayName },
          },
          reapply: {
            operationId: next,
            expectedRevision: latest.data.version,
            status: {
              href: `/${locale}/settings/operations/${encodeURIComponent(next)}`,
              label: copy.profileStatus,
            },
          },
        },
      };
    }
  }
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.unknown, status },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: ["UNAUTHENTICATED", "NOT_AUTHORIZED", "FORBIDDEN"].includes(error.code)
        ? copy.sessionEnded
        : copy.notSaved,
      retryable: error.retryable,
      recovery: { href: `/${locale}/settings`, label: copy.openSettings },
    },
  };
}
