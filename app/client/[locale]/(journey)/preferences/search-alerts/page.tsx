import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { QueryParams } from "@/features/discovery/query";
import {
  searchAlertCopy,
  searchAlertCopyLocale,
  searchAlertStatusCopy,
} from "@/features/discovery/search-alert-copy";
import { SearchAlertCriteria } from "@/features/discovery/search-alert-criteria";
import { SearchAlertForm } from "@/features/discovery/search-alert-form";
import { initialSearchAlertState } from "@/features/discovery/search-alert-server";
import { alertSearch, savedAlertCriteria } from "@/features/discovery/search-alert-state";
import { privacyCopy, privacyLabel } from "@/features/privacy/copy";
import { isRoutableLocale, localeDirection } from "@/i18n/config";
import { currentClientSession } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import { findOperation } from "@/server/operations";
import { getPreferences } from "@/server/privacy/preferences";
import { configuredAlertRule } from "@/server/subscriptions/rule";
import { Notice } from "@/ui/notice";
import { saveSearchAlert } from "./actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const query = await searchParams,
    c = searchAlertCopy(locale),
    p = privacyCopy(locale);
  let search: ReturnType<typeof alertSearch> | undefined;
  try {
    search = alertSearch(locale, query);
  } catch {
    /* Never substitute an empty search. */
  }
  const operationKey =
    typeof query.operation === "string" && z.uuid().safeParse(query.operation).success
      ? query.operation
      : undefined;
  const path = `${search?.clientHref ?? `/${locale}/preferences/search-alerts?context=invalid`}${
    operationKey ? `&operation=${operationKey}` : ""
  }`;
  const session = await currentClientSession();
  if (!session) redirect(`/${locale}/access?returnTo=${encodeURIComponent(path)}`);
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  const data = await getPreferences(getDb(), session, locale);
  const terms = data.terms.search_alerts;
  const contacts = data.contacts.filter(
    (contact) => contact.kind === "email" && contact.verification === "verified",
  );
  const existing = data.subscriptions.some(
    (subscription) =>
      subscription.purpose === "search_alerts" && subscription.state !== "withdrawn",
  );
  const operation = operationKey
    ? await findOperation(getDb(), session.actor, "preferences.opt_in", operationKey)
    : null;
  // The status view names only the actor's own search-alert subscription created by this
  // operation, read as currently stored; URL criteria are never presented as its receipt.
  const statusRequested = query.operation !== undefined;
  const outcome = z.object({ id: z.uuid() }).safeParse(operation?.outcome);
  const saved =
    operation?.status === "succeeded" && outcome.success
      ? data.subscriptions.find(
          (subscription) =>
            subscription.id === outcome.data.id && subscription.purpose === "search_alerts",
        )
      : undefined;
  const savedCriteria = saved ? savedAlertCriteria(saved.criteria) : null;
  const s = searchAlertStatusCopy(locale);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-gutter py-8">
      <h1 className="text-title font-semibold" lang={searchAlertCopyLocale(locale)} dir="ltr">
        {statusRequested ? c.status : c.title}
      </h1>
      {statusRequested ? null : search ? (
        <SearchAlertCriteria locale={locale} search={search} />
      ) : (
        <Notice tone="warning">{c.invalid}</Notice>
      )}
      <div className="space-y-5" lang={searchAlertCopyLocale(locale)} dir="ltr">
        <Notice tone="info">{configuredAlertRule() ? c.deliveryBoundary : c.deliveryOff}</Notice>
        {statusRequested ? (
          saved ? (
            <div className="space-y-5" lang={locale} dir={localeDirection(locale)}>
              <Notice tone="success">{s.recordedRequest}</Notice>
              <p>{s.historicalNote}</p>
              <p>
                {s.currentState}:{" "}
                <span lang={searchAlertCopyLocale(locale)}>
                  {privacyLabel(locale, saved.state)}
                </span>
              </p>
              <p lang={searchAlertCopyLocale(locale)} dir="ltr">
                {p.frequency}: {saved.frequency === "weekly" ? p.weekly : p.daily} · {p.timezone}:{" "}
                <bdi>{saved.timezone}</bdi>
              </p>
              {savedCriteria ? (
                <SearchAlertCriteria
                  locale={locale}
                  title={s.currentPreference}
                  search={{ normalized: savedCriteria }}
                />
              ) : (
                <Notice tone="warning">{s.savedCriteriaUnavailable}</Notice>
              )}
            </div>
          ) : (
            <Notice tone="warning">{c.unconfirmed}</Notice>
          )
        ) : (
          <>
            {!contacts.length ? (
              <>
                <p>{p.noContact}</p>
                <a
                  className="underline"
                  href={`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`}
                >
                  {p.reverify}
                </a>
              </>
            ) : null}
            {!terms ? (
              <Notice tone="warning">{p.noTerms}</Notice>
            ) : (
              <details>
                <summary className="cursor-pointer underline">
                  {p.terms}: {terms.title}
                </summary>
                <div
                  lang={terms.locale}
                  dir={terms.locale === "he" ? "rtl" : "ltr"}
                  className="space-y-3 pt-3"
                >
                  {terms.paragraphs.map((text) => (
                    <p key={text}>{text}</p>
                  ))}
                </div>
              </details>
            )}
            {existing ? <Notice tone="info">{c.existing}</Notice> : null}
            {search && terms && contacts.length ? (
              <SearchAlertForm
                locale={locale}
                permalink={path}
                contacts={contacts}
                initialState={initialSearchAlertState(
                  session,
                  search,
                  terms.version.id,
                  (data.party.contactPreferences as { timezone?: string })?.timezone ??
                    "Europe/Sofia",
                )}
                action={saveSearchAlert.bind(null, {
                  locale,
                  filters: search.filters,
                  termsVersionId: terms.version.id,
                })}
              />
            ) : null}
          </>
        )}
        <a className="block underline" href={`/${locale}/preferences`}>
          {c.preferences}
        </a>
        {!statusRequested && search ? (
          <a
            className="block underline"
            href={new URL(search.searchHref, getEnv().hosts.public).toString()}
          >
            {c.edit}
          </a>
        ) : null}
        <a
          className="block underline"
          href={new URL(`/${locale}/inquire`, getEnv().hosts.public).toString()}
        >
          {c.manual}
        </a>
      </div>
    </div>
  );
}
