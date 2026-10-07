"use server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { offboardStaff, readOffboarding } from "@/server/auth/grants";
import { requireAuthHost } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import type { FormState, FormValues } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { offboardingCopy } from "./copy";
import { offboardingReferenceCookie } from "./reference";
export async function offboardingAction(
  locale: string,
  id: string,
  _previous: FormState<FormValues>,
  form: FormData,
): Promise<FormState<FormValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const scope = `staff.offboard:${id}`,
    path = `/${locale}/access/offboard/${id}`,
    c = caseCopy(locale);
  const fields = ["reason", "reviewed"] as const,
    values = readFormValues<FormValues>(form, fields),
    envelope = readFormEnvelope(form, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const status = { href: `${path}?receipt=${encodeURIComponent(operationId)}`, label: c.status };
  const state: FormState<FormValues> = {
    values: { ...values, reviewed: "" },
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const jar = await cookies();
  let referenceCookie: string | undefined;
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope) throw new AppError("validation_failed");
      referenceCookie = offboardingReferenceCookie(ctx.session.actor.id, id);
      jar.set(referenceCookie, operationId, {
        path: "/",
        sameSite: "strict",
        secure: getEnv().hosts.staff.startsWith("https://"),
      });
      return offboardStaff(ctx.db, ctx.session, {
        operationId,
        principalId: id,
        expectedRevision: envelope.expectedRevision,
        reason: values.reason,
        reviewed: values.reviewed === "true",
      });
    },
    { requireSession: true },
  );
  // Known responses can release the guard. Lost responses keep the client-written reference.
  if (referenceCookie && (result.ok || result.error.outcome !== "unknown"))
    jar.delete(referenceCookie);
  if (result.ok) redirect(status.href);
  const error = result.error;
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: c.statusUnknown, status },
    };
  if (error.code === "REVISION_CONFLICT") {
    const current = await action(
      async (ctx) => {
        await requireAuthHost("staff");
        if (!ctx.session) throw new AppError("unauthenticated");
        return readOffboarding(ctx.db, ctx.session, id);
      },
      { requireSession: true },
    );
    if (current.ok && current.data.person.state === "active") {
      const { person, retained } = current.data;
      const labels = offboardingCopy(locale);
      const next = issueFormOperation(scope);
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: error.code,
          message: c.conflict,
          latest: {
            revision: person.version,
            values: {},
            details: [
              { label: labels.person, value: `${person.name} · ${person.email}` },
              ...(["keys", "cases", "tasks", "inquiries", "appointments"] as const).map((key) => ({
                label: labels[key],
                value: String(retained[key]),
              })),
            ],
          },
          reapply: {
            operationId: next,
            expectedRevision: person.version,
            status: { ...status, href: `${path}?receipt=${encodeURIComponent(next)}` },
          },
        },
      };
    }
  }
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
  const next = issueFormOperation(scope),
    fresh = {
      ...state,
      operationId: next,
      reconciliation: { ...status, href: `${path}?receipt=${encodeURIComponent(next)}` },
    };
  if (error.code === "VALIDATION_FAILED")
    return {
      ...fresh,
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
    ...fresh,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.code === "STEP_UP_REQUIRED" ? offboardingCopy(locale).reauth : c.denied,
      retryable: false,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`
            : path,
        label: c.back,
      },
    },
  };
}
