import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { isStaffLocale } from "@/i18n/config";
import {
  listAssistanceRuns,
  readAssistanceOperation,
  readAssistanceRun,
  readAssistanceSource,
} from "@/server/ai/assistance";
import { assistanceAvailability } from "@/server/ai/config";
import { type AssistanceSource, draftSchema } from "@/server/ai/draft";
import { type IntakeSource, intakeDraftSchema } from "@/server/ai/intake-draft";
import { type LocaleSource, localeDraftSchema } from "@/server/ai/locale-draft";
import { readAssistanceOperations } from "@/server/ai/operations";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { type AiValues, assistanceAction } from "./actions";
import { aiCopy } from "./copy";
import { AssistanceForm } from "./forms";
import { intakeAiCopy } from "./intake-copy";
import { IntakeDraftPanel, IntakeSourcePanel } from "./intake-screen";
import { localeAiCopy } from "./locale-copy";
import { LocaleSourcePanel } from "./locale-screen";

export function checkAiLocale(locale: string) {
  if (!isStaffLocale(locale)) notFound();
}
function sourcePanel(source: AssistanceSource, locale: string) {
  const copy = aiCopy(locale);
  return (
    <section className="space-y-3">
      <h2 className="text-subheading font-semibold">{copy.source}</h2>
      <p className="text-compact text-text-muted">{copy.excluded}</p>
      <dl className="space-y-2">
        {Object.entries(source.fields).map(([field, value]) => (
          <div key={field}>
            <dt className="text-caption text-text-muted">{field}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
const initial = (scope: string, revision: number) =>
  initialFormState<AiValues>(
    scope,
    { task: "inquiry_summary", decision: "accepted", reviewed: "" },
    revision,
  );
const privateError = (error: unknown) => {
  if (
    error instanceof AppError &&
    ["not_found", "forbidden", "validation_failed", "approval_stale"].includes(error.code)
  )
    notFound();
  throw error;
};

export async function AssistanceScreen({
  locale,
  sourceId,
  session,
  operationKey,
}: {
  locale: string;
  sourceId: string;
  session: Session;
  operationKey?: string;
}) {
  const copy = aiCopy(locale);
  const source = await readAssistanceSource(getDb(), session, sourceId).catch(privateError);
  const runs = await listAssistanceRuns(getDb(), session, sourceId);
  const provider = assistanceAvailability();
  const operation = operationKey
    ? await readAssistanceOperation(getDb(), session, sourceId, operationKey).catch(privateError)
    : undefined;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p className="max-w-reading">{copy.boundary}</p>
      <a href={`/${locale}/inquiries/${sourceId}`} className="underline">
        {copy.manual}
      </a>
      {operationKey ? (
        <Notice
          tone="info"
          title={operation ? `${copy.status}: ${operation.status}` : copy.operationMissing}
        >
          {operation?.id ? (
            <a className="underline" href={`/${locale}/operations/assistance/${operation.id}`}>
              {copy.open}
            </a>
          ) : null}
        </Notice>
      ) : null}
      {sourcePanel(source, locale)}
      {provider.enabled ? (
        <AssistanceForm
          locale={locale}
          id={sourceId}
          mode="request"
          initialState={initial(`ai.request.${sourceId}`, source.version)}
          action={assistanceAction.bind(null, locale, sourceId, "request")}
        />
      ) : (
        <Notice tone="info" title={copy.disabled} />
      )}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.runs}</h2>
        {runs.length ? (
          <ul className="space-y-3">
            {runs.map((run) => (
              <li key={run.id}>
                <a className="underline" href={`/${locale}/operations/assistance/${run.id}`}>
                  {copy.open}
                </a>{" "}
                · {run.state} · {run.task} ·{" "}
                <time dateTime={run.createdAt.toISOString()}>{run.createdAt.toISOString()}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.noRuns}</p>
        )}
      </section>
    </DiscoveryPage>
  );
}

export async function AssistanceRunScreen({
  locale,
  id,
  session,
}: {
  locale: string;
  id: string;
  session: Session;
}) {
  const copy = aiCopy(locale);
  const { run, sourceCurrent } = await readAssistanceRun(getDb(), session, id).catch(privateError);
  const source = run.sourceSnapshot as AssistanceSource;
  const translatedSource =
    run.task === "locale.draft" ? (run.sourceSnapshot as LocaleSource) : null;
  const localCopy = localeAiCopy(locale);
  const extractedSource =
    run.task === "intake.extract" ? (run.sourceSnapshot as IntakeSource) : null;
  const output = extractedSource
    ? intakeDraftSchema.safeParse(run.output)
    : translatedSource
      ? localeDraftSchema.safeParse(run.output)
      : draftSchema.safeParse(run.output);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>
        {extractedSource
          ? intakeAiCopy(locale).boundary
          : translatedSource
            ? localCopy.boundary
            : copy.boundary}
      </p>
      <div className="flex flex-wrap gap-4">
        <a
          className="underline"
          href={
            extractedSource
              ? `/${locale}/inventory/${extractedSource.reference}`
              : translatedSource
                ? `/${locale}/inventory/${translatedSource.reference}/translations/${translatedSource.targetLocale}`
                : `/${locale}/inquiries/${run.sourceId}`
          }
        >
          {extractedSource
            ? intakeAiCopy(locale).manual
            : translatedSource
              ? localCopy.manual
              : copy.manual}
        </a>
        <a
          className="underline"
          href={
            extractedSource
              ? `/${locale}/operations/assistance/intake?${new URLSearchParams({ reference: extractedSource.reference })}`
              : translatedSource
                ? `/${locale}/operations/assistance/locale?${new URLSearchParams({ reference: translatedSource.reference, language: translatedSource.targetLocale })}`
                : `/${locale}/operations/assistance?source=${run.sourceId}`
          }
        >
          {copy.request}
        </a>
        <a className="underline" href={`/${locale}/operations/assistance/${id}`}>
          {copy.refresh}
        </a>
      </div>
      {!sourceCurrent ? (
        <Notice
          tone="warning"
          title={
            extractedSource
              ? intakeAiCopy(locale).changed
              : translatedSource
                ? localCopy.changed
                : copy.changed
          }
        />
      ) : null}
      <p>
        {copy.status}: <strong>{run.state}</strong>
      </p>
      {extractedSource ? (
        <IntakeSourcePanel source={extractedSource} locale={locale} />
      ) : translatedSource ? (
        <LocaleSourcePanel source={translatedSource} locale={locale} />
      ) : (
        sourcePanel(source, locale)
      )}
      {output.success ? (
        <section className="space-y-4">
          <h2 className="text-subheading font-semibold">{copy.draft}</h2>
          <div
            lang={translatedSource?.targetLocale}
            dir={translatedSource?.targetLocale === "he" ? "rtl" : undefined}
            className="whitespace-pre-wrap break-words rounded-panel border border-border bg-surface p-5"
          >
            {"candidates" in output.data ? (
              <IntakeDraftPanel output={output.data} locale={locale} />
            ) : "body" in output.data ? (
              <p>{output.data.body}</p>
            ) : (
              <>
                <h3 className="font-semibold">{output.data.title}</h3>
                <p className="mt-3">{output.data.description}</p>
              </>
            )}
          </div>
          {"citations" in output.data ? (
            <>
              <h3 className="font-semibold">{copy.citations}</h3>
              <ul className="space-y-3">
                {[
                  ...new Map(
                    output.data.citations.map((citation) => [
                      `${citation.field}:${citation.quote}`,
                      citation,
                    ]),
                  ).values(),
                ].map((citation) => (
                  <li key={`${citation.field}:${citation.quote}`}>
                    <span className="text-caption">{citation.field}</span>
                    <blockquote className="whitespace-pre-wrap border-s-2 border-border ps-4">
                      {citation.quote}
                    </blockquote>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {output.data.warnings.length ? (
            <>
              <h3 className="font-semibold">{copy.warnings}</h3>
              <ul className="list-disc ps-5">
                {output.data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : (
        <Notice
          tone={run.state === "failed" ? "warning" : "info"}
          title={run.state === "failed" ? copy.failed : copy.noOutput}
        />
      )}
      {run.state === "draft" && sourceCurrent && output.success ? (
        <AssistanceForm
          locale={locale}
          id={id}
          mode="review"
          initialState={initial(`ai.review.${id}`, run.version)}
          action={assistanceAction.bind(null, locale, id, "review")}
        />
      ) : null}
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold underline underline-offset-4">
          {copy.evidence}
        </summary>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [copy.model, run.model],
            [copy.revision, run.sourceVersion],
            [copy.digest, run.sourceDigest],
            [copy.generated, run.generatedAt?.toISOString() ?? "—"],
            [copy.costs, run.actualCostMicros ?? copy.unknown],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </DiscoveryPage>
  );
}

export async function JobsScreen({ locale, session }: { locale: string; session: Session }) {
  const copy = aiCopy(locale);
  const status = await readAssistanceOperations(getDb(), session).catch(privateError);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.jobs}</h1>
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{localeAiCopy(locale).workflows}</h2>
        <ul className="space-y-2">
          <li>{localeAiCopy(locale).caseWorkflow}</li>
          <li>
            <a className="underline" href={`/${locale}/operations/assistance/locale`}>
              {localeAiCopy(locale).localeWorkflow}
            </a>
          </li>
          <li>
            <a className="underline" href={`/${locale}/operations/assistance/intake`}>
              {intakeAiCopy(locale).workflow}
            </a>
          </li>
        </ul>
      </section>
      <p>
        {copy.checked}: <time dateTime={status.checkedAt}>{status.checkedAt}</time>
      </p>
      <Notice
        tone={status.worker.state === "current" ? "info" : "warning"}
        title={`Queue worker: ${status.worker.state}`}
      >
        <p>
          {locale === "bg"
            ? "Показва само напредъка на опашката за текущата версия; не доказва състоянието на доставчици или резервни копия."
            : locale === "ru"
              ? "Показывает только выполнение очереди для текущей версии; не подтверждает состояние провайдеров или резервных копий."
              : "Shows queue progress for this build only; it does not prove provider or backup health."}
        </p>
        <p>
          {status.worker.reason} · {status.worker.completedAt ?? "—"}
        </p>
      </Notice>
      <p>
        {copy.model}: {status.provider.model ?? "—"} ·{" "}
        {status.provider.enabled ? copy.enabled : copy.off}
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          [copy.knownCost, status.spend.known],
          [copy.reservedCost, status.spend.reserved],
          [copy.limit, status.provider.dailyLimitMicros],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value} USD µ</dd>
          </div>
        ))}
      </dl>
      {status.jobs === null ? (
        <Notice tone="warning" title={copy.queueUnavailable} />
      ) : status.jobs.length ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the bounded table
        <section className="overflow-auto" aria-label={copy.queue} tabIndex={0}>
          <table className="w-full text-start">
            <thead>
              <tr>
                {[copy.queue, copy.status, copy.count, copy.oldest].map((heading) => (
                  <th key={heading} scope="col" className="p-3 text-start">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.jobs.map((job) => (
                <tr key={`${job.name}-${job.state}`} className="border-t border-border">
                  <th scope="row" className="p-3 text-start font-normal">
                    {job.name}
                  </th>
                  <td className="p-3">{job.state}</td>
                  <td className="p-3">{job.count}</td>
                  <td className="p-3">{new Date(job.oldest).toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p>{copy.queueEmpty}</p>
      )}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">
          {locale === "bg"
            ? "Входящи събития от доставчика"
            : locale === "ru"
              ? "Входящие события провайдера"
              : "Provider inbox events"}
        </h2>
        <ul className="space-y-3">
          {status.inbox.map((event) => (
            <li key={event.id} className="break-words rounded-control border border-border p-4">
              <bdi>{event.id}</bdi>
              <p>
                {event.provider} · {event.eventType} · {event.state} · {event.code ?? "—"}
              </p>
              <time dateTime={event.receivedAt.toISOString()}>
                {event.receivedAt.toISOString()}
              </time>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">
          {locale === "bg"
            ? "Изключения при външни действия"
            : locale === "ru"
              ? "Исключения внешних действий"
              : "External action exceptions"}
        </h2>
        <p>
          {locale === "bg"
            ? "Неизвестен резултат изисква проверка; не се изпраща автоматично отново."
            : locale === "ru"
              ? "Неизвестный результат требует проверки; автоматического повтора отправки нет."
              : "An unknown outcome requires reconciliation; it is not automatically resent."}
        </p>
        <ul className="space-y-3">
          {status.external.map((event) => (
            <li key={event.id} className="break-words rounded-control border border-border p-4">
              <bdi>{event.id}</bdi>
              <p>
                {event.kind} · {event.state} · {event.code ?? "—"}
              </p>
              <p>
                {event.at?.toISOString() ?? "—"} · {event.attempts}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <a href={`/${locale}/operations/jobs`} className="self-start underline">
        {copy.refresh}
      </a>
    </DiscoveryPage>
  );
}
