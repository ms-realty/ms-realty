"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPublicLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { hashRequest } from "@/server/crypto";
import { assertSameOrigin } from "@/server/http/request";
import type { FormState } from "@/ui/form/contract";
import {
  initialFormState,
  issueFormOperation,
  readFormEnvelope,
  readFormValues,
} from "@/ui/form/server";
import { formSpecimenCopy } from "@/ui/form/specimen-copy";
import type { SpecimenValues } from "@/ui/form/specimen-form";
import {
  readSpecimenReceipt,
  sealSpecimenReceipt,
  specimenCookie,
  specimenLatest,
  specimenLifetime,
  specimenReceiptView,
  specimenRevision,
  specimenScope,
  specimenStatusHref,
} from "@/ui/form/specimen-server";
import { isDesignSpecimenEnabled } from "@/ui/specimen/enabled";

/** Same server-validated path for native HTML and enhanced submits. No business writes. */
export async function checkPracticeForm(
  locale: string,
  _previous: FormState<SpecimenValues>,
  data: FormData,
): Promise<FormState<SpecimenValues>> {
  // Recheck the gate, locale and origin in the action, independently of the page render.
  if (!isDesignSpecimenEnabled() || !isPublicLocale(locale)) notFound();
  const env = getEnv();
  assertSameOrigin(await headers(), env.hosts.public);
  const copy = formSpecimenCopy(locale);
  const values = readFormValues<SpecimenValues>(data, ["subject", "note"]);
  const envelope = readFormEnvelope(data, specimenScope);
  if (!envelope) {
    return {
      ...initialFormState(specimenScope, values),
      outcome: {
        kind: "rejected",
        code: "NOT_AUTHORIZED",
        message: copy.invalid,
        retryable: false,
        recovery: { href: `/${locale}/design/forms`, label: copy.start },
      },
    };
  }
  const state: FormState<SpecimenValues> = {
    operationId: envelope.operationId,
    expectedRevision: envelope.expectedRevision,
    reconciliation: { href: specimenStatusHref(locale, envelope.operationId), label: copy.status },
    values,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
  const fieldErrors: { subject?: string[]; note?: string[] } = {};
  if (values.subject.trim().length < 3 || values.subject.length > 80)
    fieldErrors.subject = [copy.subjectError];
  if (values.note.length > 2000) fieldErrors.note = [copy.noteError];
  // Validation occurs before the logical key is consumed, so corrections retain its identity.
  if (Object.keys(fieldErrors).length) {
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.form.errorSummary,
        fieldErrors,
      },
    };
  }
  const jar = await cookies();
  const existing = readSpecimenReceipt(jar.get(specimenCookie)?.value);
  const digest = hashRequest({ values, expectedRevision: envelope.expectedRevision });
  if (existing?.operationId === envelope.operationId) {
    return {
      ...state,
      outcome:
        existing.digest === digest
          ? { kind: "confirmed", receipt: specimenReceiptView(existing, locale) }
          : {
              kind: "conflict",
              code: "IDEMPOTENCY_KEY_REUSED",
              message: copy.reused,
              recovery: {
                href: specimenStatusHref(locale, existing.operationId),
                label: copy.receipt,
              },
            },
    };
  }
  if (envelope.expectedRevision !== specimenRevision) {
    const nextOperationId = issueFormOperation(specimenScope);
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code: "REVISION_CONFLICT",
        message: copy.conflict,
        latest: { revision: specimenRevision, values: specimenLatest },
        reapply: {
          operationId: nextOperationId,
          expectedRevision: specimenRevision,
          status: { href: specimenStatusHref(locale, nextOperationId), label: copy.status },
        },
      },
    };
  }
  const receipt = {
    operationId: envelope.operationId,
    digest,
    recordedAt: new Date().toISOString(),
    reference: `DEMO-${envelope.operationId.slice(0, 10)}`,
    revision: specimenRevision,
  } as const;
  jar.set(specimenCookie, sealSpecimenReceipt(receipt), {
    httpOnly: true,
    secure: env.hosts.public.startsWith("https://"),
    sameSite: "lax",
    path: `/${locale}/design/forms`,
    maxAge: specimenLifetime,
  });
  return {
    ...state,
    outcome: { kind: "confirmed", receipt: specimenReceiptView(receipt, locale) },
  };
}
