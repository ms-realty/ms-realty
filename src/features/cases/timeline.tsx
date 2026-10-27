import { getDb } from "@/db/client";
import { workflowLabel } from "@/i18n/workflow-labels";
import type { Session } from "@/server/auth/sessions";
import { readCaseTimeline } from "@/server/cases/timeline";
import { TechnicalDetails } from "@/ui/technical-details";
import { ButlerReceiptLine } from "../ai/butler-receipt";
import { workCopy } from "../work/copy";
import { When } from "../work/when";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";

export async function CaseTimeline({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const view = await readCaseTimeline(getDb(), session, id);
  const copy = staffWorkflowCopy(locale);
  return (
    <section className="space-y-4" id="case-timeline">
      <h2 className="text-subheading font-semibold">{copy.timeline}</h2>
      {view.inquiries.length ? (
        <p>
          {copy.inquiries}:{" "}
          {view.inquiries.map((row) => (
            <a
              key={row.id}
              className="inline-flex min-h-control items-center px-2 text-link underline"
              href={`/${locale}/inquiries/${row.id}`}
            >
              {row.reference}
            </a>
          ))}
        </p>
      ) : null}
      {view.activity.length ? (
        <ol className="divide-y divide-border">
          {view.activity.map((entry) => {
            const params =
              entry.params && typeof entry.params === "object"
                ? (entry.params as Record<string, unknown>)
                : {};
            return (
              <li key={entry.id} className="space-y-2 py-4">
                <p className="font-semibold">
                  {(copy.events as Record<string, string>)[entry.messageKey.replaceAll(".", "_")] ??
                    copy.recordedActivity}
                </p>
                <p>
                  {entry.actorName ?? copy.systemActor} · <When date={entry.at} locale={locale} />
                </p>
                {["reason", "note", "nextAction", "waitingOn"].map((key) =>
                  typeof params[key] === "string" ? (
                    <p key={key} className="whitespace-pre-wrap">
                      {String(params[key])}
                    </p>
                  ) : null,
                )}
                {entry.messageKey === "case.next_action_recorded" && !params.reason ? (
                  <p className="text-dense text-text-muted">{copy.reasonMissing}</p>
                ) : null}
                {typeof params.from === "string" || typeof params.to === "string" ? (
                  <p>
                    {typeof params.from === "string" ? workflowLabel(params.from, locale) : "—"} →{" "}
                    {typeof params.to === "string" ? workflowLabel(params.to, locale) : "—"}
                  </p>
                ) : null}
                <TechnicalDetails locale={locale}>{entry.messageKey}</TechnicalDetails>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>{copy.noActivity}</p>
      )}
      {view.stages.length ? (
        <details>
          <summary className="min-h-control cursor-pointer py-3 font-semibold">
            {workCopy(locale).state}
          </summary>
          <ol>
            {view.stages.map((entry) => (
              <li key={entry.id} className="space-y-2 border-t border-border py-3">
                <p>
                  {entry.from ? workflowLabel(entry.from, locale) : "—"} →{" "}
                  {workflowLabel(entry.to, locale)}
                </p>
                {entry.reason ? <p>{entry.reason}</p> : null}
                <When date={entry.at} locale={locale} />
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {view.receipts.map((receipt) => (
        <ButlerReceiptLine
          key={receipt.operationId}
          locale={locale}
          receipt={receipt}
          manualHref={`/${locale}/cases/${id}${receipt.manual.requiresReconciliation ? "#case-timeline" : "#case-next"}`}
        />
      ))}
      {view.audit ? (
        <details id="case-audit">
          <summary className="min-h-control cursor-pointer py-3 font-semibold">
            {copy.audit}
          </summary>
          <a
            className="inline-flex min-h-control items-center font-semibold text-link underline"
            href={`/${locale}/operations/history`}
          >
            {copy.audit}
          </a>
          <ol className="divide-y divide-border">
            {view.audit.map((entry) => (
              <li key={entry.id} className="space-y-2 py-3">
                <p>
                  {copy.recordedActivity} · {entry.actorName ?? copy.systemActor}
                </p>
                <When date={entry.at} locale={locale} />
                <TechnicalDetails locale={locale}>
                  <p>{entry.action}</p>
                  <bdi>{entry.operationId}</bdi>
                </TechnicalDetails>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
