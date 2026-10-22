"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { Filters } from "@/features/discovery/query";
import { searchAlertCopy } from "@/features/discovery/search-alert-copy";
import { searchAlertScope } from "@/features/discovery/search-alert-server";
import { alertSearch, type SearchAlertValues } from "@/features/discovery/search-alert-state";
import { isRoutableLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentClientSession, requireAuthHost } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { AppError, isAppError } from "@/server/errors";
import { assertSameOrigin } from "@/server/http/request";
import { optIn } from "@/server/privacy/preferences";
import { type FormState, formFields } from "@/ui/form/contract";
import { isIssuedFormOperation, readFormValues } from "@/ui/form/server";

export async function saveSearchAlert(
  context: { locale: string; filters: Filters; termsVersionId: string },
  _previous: FormState<SearchAlertValues>,
  data: FormData,
): Promise<FormState<SearchAlertValues>> {
  if (!isRoutableLocale(context.locale)) throw new AppError("not_found");
  const locale = context.locale,
    c = searchAlertCopy(locale),
    search = alertSearch(locale, context.filters);
  await requireAuthHost("client");
  assertSameOrigin(await headers(), getEnv().hosts.client);
  const names = ["contactMethodId", "frequency", "timezone", "confirmed", "proof"] as const;
  const values = readFormValues<SearchAlertValues>(data, names);
  const key = data.get(formFields.operationId),
    operationId = typeof key === "string" ? key : "";
  const status = {
    href: `${search.clientHref}&operation=${encodeURIComponent(operationId)}`,
    label: c.status,
  };
  const state: FormState<SearchAlertValues> = {
    operationId,
    expectedRevision: null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  try {
    const session = await currentClientSession();
    if (!session) throw new AppError("unauthenticated");
    if (
      !z.uuid().safeParse(operationId).success ||
      data.getAll(formFields.operationId).length !== 1 ||
      names.some((name) =>
        name === "confirmed" ? data.getAll(name).length > 1 : data.getAll(name).length !== 1,
      ) ||
      !isIssuedFormOperation(
        searchAlertScope(session, search, context.termsVersionId, operationId),
        values.proof,
      )
    )
      throw new AppError("validation_failed");
    const parsed = z
      .object({
        contactMethodId: z.uuid(),
        frequency: z.enum(["daily", "weekly"]),
        timezone: z
          .string()
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }),
        confirmed: z.literal("yes"),
      })
      .safeParse(values);
    if (!parsed.success)
      return {
        ...state,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: c.check,
          fieldErrors: Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path[0], [c.check]]),
          ),
        },
      };
    const result = await optIn(getDb(), session, {
      operationId,
      contactMethodId: values.contactMethodId,
      purpose: "search_alerts",
      locale,
      termsVersionId: context.termsVersionId,
      confirmed: true,
      timezone: values.timezone,
      frequency: values.frequency,
      search: search.input,
    });
    const checkedAt = new Date().toISOString();
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: c.saved,
          reference: result.operationId,
          recordedAt: { dateTime: checkedAt, label: formatDateTime(locale, checkedAt) },
          nextStep: c.savedNext,
          destination: {
            href: `/${locale}/preferences?receipt=${result.operationId}`,
            label: c.preferences,
          },
        },
      },
    };
  } catch (error) {
    if (
      !isAppError(error) ||
      error.outcome === "unknown" ||
      ["outcome_unknown", "operation_pending", "idempotency_key_reused"].includes(error.code)
    )
      return {
        ...state,
        outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: c.unconfirmed, status },
      };
    const reauth =
      isAppError(error) && ["unauthenticated", "step_up_required"].includes(error.code);
    return {
      ...state,
      values: { ...values, confirmed: "" },
      outcome: {
        kind: "rejected",
        code: isAppError(error) ? error.code : "UNCONFIRMED",
        message: c.unconfirmed,
        retryable: false,
        recovery: {
          href: reauth
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(search.clientHref)}`
            : search.clientHref,
          label: reauth ? c.account : c.check,
        },
      },
    };
  }
}
