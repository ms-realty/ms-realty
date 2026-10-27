import { getDb } from "@/db/client";
import { StaffPage, StaffPanel, StaffToolbar } from "@/features/shell/staff-ui";
import { Pagination, When } from "@/features/work/screens";
import { workflowLabel } from "@/i18n/workflow-labels";
import type { Session } from "@/server/auth/sessions";
import { serviceQueue } from "@/server/service-intake/queries";
import { serviceCopy, serviceStaffCopy } from "./copy";
export async function ServiceQueueScreen({
  locale,
  session,
  page = 1,
}: {
  locale: string;
  session: Session;
  page?: number;
}) {
  const view = await serviceQueue(getDb(), session, page),
    c = serviceStaffCopy(locale),
    publicCopy = serviceCopy(locale);
  return (
    <StaffPage
      title={c.title}
      lead={c.lead}
      actions={view.mayReview ? <a href={`/${locale}/settings/service-scope`}>{c.edit}</a> : null}
    >
      <StaffPanel title={c.policy}>
        <ul className="space-y-4">
          {view.offerings.length ? (
            view.offerings.map((row) => (
              <li key={`${row.topic}:${row.regionId}`}>
                {publicCopy[row.topic]} · {row.regionName}
              </li>
            ))
          ) : (
            <li>{c.unknown}</li>
          )}
        </ul>
      </StaffPanel>
      <StaffPanel title={`${c.received} · ${view.requestCount}`}>
        <ul className="space-y-4">
          {view.requests.length ? (
            view.requests.map((row) => (
              <li key={row.id} className="min-w-0 space-y-2 break-words">
                <a
                  className="inline-flex min-h-control items-center underline"
                  href={`/${locale}/inquiries/${row.id}`}
                >
                  {row.reference} · {row.topic ? publicCopy[row.topic] : c.unknown}
                </a>
                <p>
                  {workflowLabel(row.state, locale)} · {row.ownerName ?? c.unknown}
                </p>
                <When date={row.createdAt} locale={locale} />
                {row.followUpAt ? (
                  <p>
                    {c.next}: <When date={row.followUpAt} locale={locale} />
                  </p>
                ) : null}
              </li>
            ))
          ) : (
            <li>{c.empty}</li>
          )}
        </ul>
      </StaffPanel>
      <StaffPanel title={`${c.cases} · ${view.caseCount}`}>
        <ul className="space-y-4">
          {view.cases.length ? (
            view.cases.map((row) => (
              <li key={row.id} className="min-w-0 space-y-2 break-words">
                <a
                  className="inline-flex min-h-control items-center underline"
                  href={`/${locale}/operations/consultations/${row.id}`}
                >
                  {row.reference} · {row.title}
                </a>
                <p>
                  {row.topic ? publicCopy[row.topic] : c.unknown} ·{" "}
                  {workflowLabel(row.stage, locale)} · {workflowLabel(row.disposition, locale)}
                </p>
                <p>
                  {c.owner}: {row.ownerName ?? c.unknown}
                </p>
                <p>
                  {c.next}: {row.nextAction ?? c.unknown}
                </p>
                <When date={row.dueAt} locale={locale} />
              </li>
            ))
          ) : (
            <li>{c.empty}</li>
          )}
        </ul>
      </StaffPanel>
      <StaffToolbar>
        <Pagination
          page={page}
          hasMore={view.hasMore}
          href={`/${locale}/operations/consultations`}
          locale={locale}
        />
      </StaffToolbar>
    </StaffPage>
  );
}
