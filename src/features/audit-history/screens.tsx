import type { HistoryDetail, HistoryEntry, HistoryList } from "@/server/audit-history/queries";
import { buttonClass } from "@/ui/button-class";
import { EmptyState } from "@/ui/empty-state";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { DiscoveryPage } from "../discovery/page";
import { auditHistoryCopy } from "./copy";

function historyPath(locale: string, reference = "", cursor?: string | null) {
  const query = new URLSearchParams();
  if (reference) query.set("reference", reference);
  if (cursor) query.set("cursor", cursor);
  return `/${locale}/operations/history${query.size ? `?${query}` : ""}`;
}
function RecordTime({ locale, at }: { locale: string; at: Date }) {
  return (
    <time dateTime={at.toISOString()}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Sofia",
      }).format(at)}
    </time>
  );
}
function actorName(locale: string, entry: HistoryEntry) {
  const copy = auditHistoryCopy(locale);
  return (
    entry.actor.currentName ??
    (entry.actor.kind === "system"
      ? copy.systemActor
      : entry.actor.kind === "staff"
        ? copy.unknownActor
        : copy.privateActor)
  );
}

export function HistoryListScreen({ locale, view }: { locale: string; view: HistoryList }) {
  const copy = auditHistoryCopy(locale);
  return (
    <DiscoveryPage>
      <div data-audit-history className="grid min-w-0 gap-7">
        <header className="max-w-reading space-y-3">
          <h1 className="text-title font-semibold">{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>
        <form
          method="get"
          action={historyPath(locale)}
          className="flex min-w-0 flex-wrap items-end gap-4"
        >
          <div className={`${fieldClass} max-w-md`}>
            <label className={labelClass} htmlFor="history-reference">
              {copy.reference}
            </label>
            <input
              id="history-reference"
              className={controlClass}
              name="reference"
              defaultValue={view.reference}
              maxLength={80}
              aria-describedby="history-reference-hint"
            />
            <p id="history-reference-hint" className="text-caption text-text-muted">
              {copy.referenceHint}
            </p>
          </div>
          <button type="submit" className={buttonClass("primary")}>
            {copy.search}
          </button>
          {view.reference ? (
            <a href={historyPath(locale)} className={buttonClass("tertiary")}>
              {copy.clear}
            </a>
          ) : null}
        </form>
        {view.entries.length ? (
          <ol className="min-w-0 divide-y divide-border border-y border-border">
            {view.entries.map((entry) => (
              <li key={entry.id} data-history-event={entry.id} className="min-w-0 space-y-3 py-5">
                <h2 className="text-subheading font-semibold">
                  <a
                    className="inline-flex min-h-control max-w-full items-center wrap-anywhere underline underline-offset-4"
                    href={`/${locale}/operations/history/${entry.id}`}
                  >
                    {copy.actions[entry.change.action]} ·{" "}
                    <bdi className="ps-1">{entry.reference}</bdi>
                  </a>
                </h2>
                <p className="wrap-anywhere">{actorName(locale, entry)}</p>
                {entry.actor.currentName ? (
                  <p className="text-caption text-text-muted">{copy.currentName}</p>
                ) : null}
                <p className="text-caption text-text-muted">
                  <RecordTime locale={locale} at={entry.occurredAt} />
                </p>
                {entry.change.kind === "working" ? <p>{copy.working}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            kind={view.reference ? "filtered" : "new"}
            title={copy.empty}
            criteria={
              view.reference ? <bdi className="wrap-anywhere">{view.reference}</bdi> : undefined
            }
          >
            <p>{copy.emptyHelp}</p>
          </EmptyState>
        )}
        {view.nextCursor ? (
          <a
            href={historyPath(locale, view.reference, view.nextCursor)}
            className={`${buttonClass("secondary")} self-start`}
          >
            {copy.next}
          </a>
        ) : null}
        <a
          className="inline-flex min-h-control items-center self-start underline"
          href={`/${locale}/operations/privacy`}
        >
          {copy.privacy}
        </a>
      </div>
    </DiscoveryPage>
  );
}

export function HistoryDetailScreen({ locale, view }: { locale: string; view: HistoryDetail }) {
  const copy = auditHistoryCopy(locale);
  const fields = view.change.fields;
  const fieldValue = (value: string | number | boolean) =>
    typeof value === "boolean"
      ? value
        ? copy.values.yes
        : copy.values.no
      : value === "up" || value === "down"
        ? copy.values[value]
        : value;
  return (
    <DiscoveryPage>
      <article data-audit-history data-history-detail={view.id} className="grid min-w-0 gap-7">
        <header className="space-y-3">
          <h1 className="text-title font-semibold">{copy.detailTitle}</h1>
          <p className="text-subheading font-semibold wrap-anywhere">
            {copy.actions[view.change.action]} · <bdi>{view.reference}</bdi>
          </p>
          <a className={buttonClass("tertiary")} href={historyPath(locale, view.reference)}>
            {copy.back}
          </a>
        </header>
        <Notice
          tone={
            view.publication.state === "published"
              ? "info"
              : view.publication.state === "unconfirmed"
                ? "warning"
                : "info"
          }
          title={copy[view.publication.state]}
        >
          <p>{copy.boundary}</p>
        </Notice>
        <section className="space-y-4" aria-labelledby="history-what">
          <h2 id="history-what" className="text-subheading font-semibold">
            {copy.whatChanged}
          </h2>
          {fields.length ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key}>
                  <dt className="font-semibold">{copy.fields[field.key]}</dt>
                  <dd>{fieldValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{copy.noFields}</p>
          )}
          {view.change.kind === "working" ? (
            <p className="max-w-reading text-text-muted">{copy.noOldValues}</p>
          ) : null}
        </section>
        <dl className="grid min-w-0 gap-6 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <dt className="font-semibold">{copy.actor}</dt>
            <dd className="wrap-anywhere">{actorName(locale, view)}</dd>
            {view.actor.currentName ? (
              <dd className="text-caption text-text-muted">{copy.currentName}</dd>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2">
            <dt className="font-semibold">{copy.reason}</dt>
            <dd className="wrap-anywhere">
              {view.change.reason ??
                (view.change.reasonDecision ? copy.retainUnknown : copy.noReason)}
            </dd>
            {view.change.reason ? (
              <dd className="text-caption text-text-muted">{copy.redaction}</dd>
            ) : null}
          </div>
          <div className="space-y-2">
            <dt className="font-semibold">{copy.recordedAt}</dt>
            <dd>
              <RecordTime locale={locale} at={view.occurredAt} />
            </dd>
          </div>
        </dl>
        {view.publication.locale || view.publication.verifiedAt || view.publication.current ? (
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-labelledby="history-publication"
          >
            <h2 id="history-publication" className="text-subheading font-semibold">
              {copy.publication}
            </h2>
            <dl className="grid gap-5 sm:grid-cols-2">
              {view.publication.locale ? (
                <div>
                  <dt className="font-semibold">{copy.locale}</dt>
                  <dd>
                    <bdi>{view.publication.locale.toUpperCase()}</bdi>
                  </dd>
                </div>
              ) : null}
              {view.publication.verifiedAt ? (
                <div>
                  <dt className="font-semibold">{copy.verifiedAt}</dt>
                  <dd>
                    <RecordTime locale={locale} at={view.publication.verifiedAt} />
                  </dd>
                </div>
              ) : null}
              {view.publication.current ? (
                <div className="sm:col-span-2">
                  <dt className="font-semibold">{copy.currentState}</dt>
                  <dd>{copy.current[view.publication.current]}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <a className={buttonClass("secondary")} href={`/${locale}/operations/history/${view.id}`}>
            {copy.checkAgain}
          </a>
          <a
            className={buttonClass("tertiary")}
            href={`/${locale}/inventory/${encodeURIComponent(view.reference)}`}
          >
            {copy.inventory}
          </a>
        </div>
        <p className="max-w-reading text-caption text-text-muted">{copy.checkOnly}</p>
        <TechnicalDetails locale={locale}>
          <dl className="grid gap-3">
            <div>
              <dt className="font-semibold">{copy.technical.event}</dt>
              <dd>
                <bdi className="break-all">{view.id}</bdi>
              </dd>
            </div>
            {Object.entries(view.technical).map(([key, value]) =>
              value ? (
                <div key={key}>
                  <dt className="font-semibold">
                    {
                      copy.technical[
                        key === "action"
                          ? "action"
                          : key === "operationId"
                            ? "operation"
                            : key === "manifestId"
                              ? "manifest"
                              : "actor"
                      ]
                    }
                  </dt>
                  <dd>
                    <bdi className="break-all">{value}</bdi>
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        </TechnicalDetails>
      </article>
    </DiscoveryPage>
  );
}

export function HistoryErrorScreen({
  locale,
  invalid = false,
}: {
  locale: string;
  invalid?: boolean;
}) {
  const copy = auditHistoryCopy(locale);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <EmptyState
        kind="failed"
        title={invalid ? copy.invalid : copy.failed}
        action={
          <a className={buttonClass("secondary")} href={historyPath(locale)}>
            {invalid ? copy.clear : copy.checkAgain}
          </a>
        }
      >
        <p>{invalid ? copy.invalidHelp : copy.failedHelp}</p>
      </EmptyState>
    </DiscoveryPage>
  );
}
