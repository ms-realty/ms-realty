// O22 / F25: native filtered read, honest unknowns and ordinary authorized workbench links.
import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import { agencyTimeZone, displayLocale, type StaffLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { isAppError } from "@/server/errors";
import { type ReportFilter, readReports } from "@/server/reports/queries";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { reportsCopy } from "./copy";

export const reportsHref = (locale: string, filter: ReportFilter) =>
  `/${locale}/reports?days=${filter.days}&scope=${filter.scope}`;

export async function ReportsScreen({
  locale,
  session,
  filter,
}: {
  locale: StaffLocale;
  session: Session;
  filter: ReportFilter;
}) {
  const t = reportsCopy(locale);
  let report: Awaited<ReturnType<typeof readReports>> | null = null;
  try {
    report = await readReports(getDb(), session, filter);
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error) && ["forbidden", "not_found"].includes(error.code)) notFound();
    if (isAppError(error) && error.code === "unauthenticated") throw error;
    console.error("[O22] report unavailable", isAppError(error) ? error.code : "read_failed");
  }
  const number = new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 0 });
  const time = (date: Date) =>
    new Intl.DateTimeFormat(displayLocale(locale), {
      timeZone: agencyTimeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  const response = report?.response;
  return (
    <div className="mx-auto min-w-0 max-w-page space-y-6 break-words p-gutter sm:p-gutter-wide">
      <header className="space-y-2">
        <h1 className="text-heading font-semibold sm:text-title">{t.title}</h1>
        <p className="text-text-muted">{t.about}</p>
      </header>
      <form
        method="get"
        action={`/${locale}/reports#results`}
        className="flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="report-period">{t.period}</label>
          <select
            id="report-period"
            name="days"
            defaultValue={filter.days}
            className="min-h-control rounded-control border border-border bg-surface p-3"
          >
            {[7, 30, 90].map((days) => (
              <option key={days} value={days}>
                {days} {t.days}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="report-responsibility">{t.scope}</label>
          <select
            id="report-responsibility"
            name="scope"
            defaultValue={filter.scope}
            className="min-h-control rounded-control border border-border bg-surface p-3"
          >
            <option value="all">{t.all}</option>
            <option value="mine">{t.mine}</option>
          </select>
        </div>
        <button className={buttonClass()} type="submit">
          {t.apply}
        </button>
      </form>
      <p className="text-compact text-text-muted">{t.scopeNotice}</p>
      {!report ? (
        <Notice tone="warning" title={t.unavailable}>
          <a className={buttonClass("secondary")} href={reportsHref(locale, filter)}>
            {t.retry}
          </a>
        </Notice>
      ) : (
        <section id="results" tabIndex={-1} className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p>
                {t.asOf}: <time dateTime={report.asOf.toISOString()}>{time(report.asOf)}</time> ·{" "}
                <bdi>{report.timezone}</bdi>
              </p>
              <p className="text-compact text-text-muted">
                {t.window}: {time(report.from)}
              </p>
            </div>
            <a
              className={buttonClass("secondary")}
              href={`/${locale}/reports/export?days=${filter.days}&scope=${filter.scope}`}
              download="business-report.csv"
            >
              {t.export}
            </a>
          </div>
          <p className="text-text-muted">{t.snapshot}</p>
          <section
            aria-labelledby="human-response"
            className="space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6"
          >
            <h2 id="human-response" className="text-heading font-semibold">
              {t.response}
            </h2>
            <p>{t.responseDefinition}</p>
            {response ? (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    [t.received, response.received],
                    [t.responded, response.responded],
                    [t.missing, response.missing],
                    [t.median, response.medianMinutes],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-compact text-text-muted">{label}</dt>
                      <dd className="text-heading font-semibold">
                        {typeof value === "number"
                          ? value > 0 && value < 1
                            ? "<1"
                            : number.format(value)
                          : t.unknown}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-compact text-text-muted">{t.incomplete}</p>
                {response.smallSample && response.responded > 0 ? <p>{t.small}</p> : null}
                {response.invalid ? <Notice tone="warning">{t.invalid}</Notice> : null}
              </>
            ) : (
              <p>{t.denied}</p>
            )}
            <Notice tone="info">{t.staffed}</Notice>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            {report.metrics.map((metric) => (
              <section
                key={metric.id}
                aria-labelledby={`metric-${metric.id}`}
                className="min-w-0 space-y-3 rounded-panel border border-border bg-surface p-4 sm:p-6"
              >
                <h2 id={`metric-${metric.id}`} className="text-heading font-semibold">
                  {t.metrics[metric.id].title}
                </h2>
                <p>{t.metrics[metric.id].definition}</p>
                <p className="text-title font-semibold">
                  {metric.count === null ? t.unknown : number.format(metric.count)}
                </p>
                {metric.state === "denied" ? (
                  <p>{t.denied}</p>
                ) : metric.rows.length === 0 ? (
                  <p>{t.empty}</p>
                ) : (
                  <ul className="space-y-2">
                    {metric.rows.map((row) => (
                      <li key={row.id}>
                        <a
                          className="inline-flex min-h-control items-center font-semibold text-action underline underline-offset-4"
                          href={`/${locale}${row.path}`}
                        >
                          <bdi>{row.reference}</bdi>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {metric.hasMore ? <p className="text-compact text-text-muted">{t.sample}</p> : null}
              </section>
            ))}
          </div>
          <Notice tone="info">{t.effort}</Notice>
        </section>
      )}
      <a className={buttonClass("tertiary")} href={`/${locale}/operations`}>
        {t.moreTools}
      </a>
    </div>
  );
}
