"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { serviceScopeSchema } from "@/domain/service-scope";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { serviceStaffCopy } from "@/features/service-intake/copy";
import {
  serviceScopeApprovalFields,
  serviceScopeFields,
} from "@/features/service-intake/policy-form";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { action } from "@/server/http/next";
import { captureOperatingPolicy } from "@/server/operating-policy/service";
import {
  approveServiceScope,
  readServiceScope,
  readServiceScopeOperation,
  saveServiceScope,
} from "@/server/service-intake/scope";
import type { FormState, FormValues } from "@/ui/form/contract";
import { readFormEnvelope } from "@/ui/form/server";

export async function submitServiceScope(
  locale: string,
  command: "save" | "approve",
  _previous: FormState<FormValues>,
  data: FormData,
): Promise<FormState<FormValues>> {
  if (!isStaffLocale(locale) || !["save", "approve"].includes(command))
    throw new AppError("not_found");
  const c = serviceStaffCopy(locale),
    errors = operatingPolicyCopy(locale),
    path = `/${locale}/settings/service-scope`;
  const values = readTimeFormValues<FormValues>(
    data,
    command === "save" ? serviceScopeFields : serviceScopeApprovalFields,
  );
  const envelope = readFormEnvelope(data, `service_scope.${command}`),
    key = envelope?.operationId ?? "invalid";
  const status = {
    href: `${path}/operations/${command}/${encodeURIComponent(key)}`,
    label: c.check,
  };
  const state: FormState<FormValues> = {
    operationId: key,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      const base = { operationId: key, expectedVersion: envelope.expectedRevision };
      let done:
        | Awaited<ReturnType<typeof saveServiceScope>>
        | Awaited<ReturnType<typeof approveServiceScope>>;
      if (command === "save") {
        const model = await readServiceScope(db, access.session);
        const decode = (value: string | undefined) => {
          try {
            return JSON.parse(value ?? "");
          } catch {
            throw new AppError("validation_failed");
          }
        };
        const region = decode(values.region) as { id: string; version: number };
        let decision: unknown = { topic: values.topic, regionId: region.id, state: values.state };
        if (values.state === "not_offered")
          decision = { ...(decision as object), reason: values.reason };
        if (values.state === "offered") {
          const policy = await captureOperatingPolicy(db);
          if (policy.kind !== "approved_operating_policy_v1") throw new AppError("approval_stale");
          decision = {
            ...(decision as object),
            mode: values.mode,
            regionVersion: region.version,
            publicSource: decode(values.publicSource),
            termsSource: decode(values.termsSource),
            ownerId: values.ownerId,
            fallback:
              values.fallbackId === "manual"
                ? { kind: "manual", source: decode(values.fallbackSource) }
                : { kind: "staff", principalId: values.fallbackId },
            operatingPolicy: {
              id: policy.policyId,
              version: policy.policyVersion,
              contentHash: policy.contentHash,
            },
            reviewExpiresAt: formInstant(values, "reviewExpiresAt"),
          };
        }
        const parsed = serviceScopeSchema.safeParse({
          kind: "bounded_service_scope_v1",
          decisions: [
            ...model.draft.document.decisions.filter(
              (row) => row.topic !== values.topic || row.regionId !== region.id,
            ),
            decision,
          ],
        });
        if (!parsed.success) throw new AppError("validation_failed");
        done = await saveServiceScope(db, access.session, { ...base, document: parsed.data });
      } else
        done = await approveServiceScope(db, access.session, {
          ...base,
          expectedHash: values.expectedHash ?? "",
          reviewed: (values.reviewed === "true") as true,
          note: values.note ?? "",
        });
      const receipt = await readServiceScopeOperation(db, access.session, command, key);
      if (receipt?.status !== "succeeded") throw new AppError("outcome_unknown");
      return done.outcome;
    },
    { requireSession: true },
  );
  if (result.ok) {
    revalidatePath("/staff/[locale]/settings/service-scope", "page");
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: command === "save" ? c.save : c.approve,
          reference: `${c.version} ${result.data.version}`,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: formatDateTime(locale, result.data.recordedAt),
          },
          nextStep: c.lead,
          destination: { href: path, label: c.edit },
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
        code: error.code === "IDEMPOTENCY_KEY_REUSED" ? error.code : "REVISION_CONFLICT",
        message: errors.conflict,
        recovery: { href: path, label: errors.reload },
      },
    };
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: errors.pending, status },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message:
        error.code === "STEP_UP_REQUIRED"
          ? errors.stepUp
          : error.code === "VALIDATION_FAILED"
            ? errors.invalid
            : errors.failed,
      retryable: error.retryable,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`
            : path,
        label: error.code === "STEP_UP_REQUIRED" ? errors.stepUp : errors.reload,
      },
    },
  };
}
