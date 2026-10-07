import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { isPublicLocale, publicLocales } from "@/i18n/config";
import { listLocaleAssistanceRuns, readLocaleAssistanceOperation } from "@/server/ai/assistance";
import { assistanceAvailability } from "@/server/ai/config";
import type { LocaleSource } from "@/server/ai/locale-draft";
import { readLocaleAssistanceSource } from "@/server/ai/locale-source";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { controlClass, labelClass } from "@/ui/field-class";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { type AiValues, localeAssistanceAction } from "./actions";
import { aiCopy } from "./copy";
import { LocaleAssistanceForm } from "./forms";
import { localeAiCopy } from "./locale-copy";

export function LocaleSourcePanel({ source, locale }: { source: LocaleSource; locale: string }) {
  const copy = localeAiCopy(locale),
    common = aiCopy(locale);
  return (
    <section className="space-y-4">
      <h2 className="text-subheading font-semibold">{common.source}</h2>
      <p>{copy.excluded}</p>
      <p>
        {source.reference} · BG → {source.targetLocale.toUpperCase()}
      </p>
      <div lang="bg" className="space-y-3">
        <h3 className="font-semibold">{source.fields.title}</h3>
        <p className="whitespace-pre-wrap break-words">{source.fields.description}</p>
      </div>
      <p className="break-all">
        {copy.sourceUrl}: {source.sourceUrl}
      </p>
      <details className="rounded-panel border border-border p-4">
        <summary className="cursor-pointer font-semibold">{copy.facts}</summary>
        <pre className="mt-4 whitespace-pre-wrap break-words text-caption">
          {JSON.stringify(source.protectedFacts, null, 2)}
        </pre>
      </details>
    </section>
  );
}
export async function LocaleAssistanceScreen({
  locale,
  session,
  reference,
  language,
  operation,
}: {
  locale: string;
  session: Session;
  reference?: string;
  language?: string;
  operation?: string;
}) {
  const copy = localeAiCopy(locale),
    common = aiCopy(locale);
  if (!reference || !language)
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p>{copy.boundary}</p>
        <form method="get" className="grid max-w-reading gap-4">
          <label className="grid gap-2">
            <span className={labelClass}>{copy.reference}</span>
            <input name="reference" required maxLength={100} className={controlClass} />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>{copy.target}</span>
            <select name="language" required className={controlClass}>
              {publicLocales
                .filter((value) => value !== "bg")
                .map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="min-h-11 rounded-control bg-action px-4 py-2 text-on-action"
            type="submit"
          >
            {copy.inspect}
          </button>
        </form>
      </DiscoveryPage>
    );
  if (!isPublicLocale(language) || language === "bg") notFound();
  const db = getDb();
  const source = await readLocaleAssistanceSource(db, session, reference, language).catch(
    (error) => {
      if (error instanceof AppError) notFound();
      throw error;
    },
  );
  const runs = await listLocaleAssistanceRuns(db, session, source.id, language);
  const result = operation
    ? await readLocaleAssistanceOperation(db, session, source.id, language, operation)
    : null;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.boundary}</p>
      <a
        href={`/${locale}/inventory/${source.reference}/translations/${language}`}
        className="underline"
      >
        {copy.manual}
      </a>
      <LocaleSourcePanel source={source} locale={locale} />
      {operation ? (
        <Notice tone="info" title={result ? result.status : common.operationMissing}>
          {result?.id ? (
            <a className="underline" href={`/${locale}/operations/assistance/${result.id}`}>
              {common.open}
            </a>
          ) : null}
        </Notice>
      ) : null}
      {assistanceAvailability().enabled ? (
        <LocaleAssistanceForm
          locale={locale}
          reference={source.reference}
          targetLocale={language}
          initialState={initialFormState<AiValues>(
            `ai.locale.${source.id}.${language}`,
            { task: "locale.draft", decision: "accepted", reviewed: "" },
            source.version,
          )}
          action={localeAssistanceAction.bind(null, locale, source.id, source.reference, language)}
        />
      ) : (
        <Notice tone="info" title={common.disabled} />
      )}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{common.runs}</h2>
        {runs.length ? (
          <ul className="space-y-3">
            {runs.map((run) => (
              <li key={run.id}>
                <a className="underline" href={`/${locale}/operations/assistance/${run.id}`}>
                  {common.open}
                </a>{" "}
                · {run.state} · {run.createdAt.toISOString()}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {locale === "bg"
              ? "Няма записани предложения за този източник и език."
              : locale === "ru"
                ? "Нет предложений для этого источника и языка."
                : "No proposals recorded for this source and language."}
          </p>
        )}
      </section>
    </DiscoveryPage>
  );
}
