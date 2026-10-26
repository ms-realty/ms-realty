// O26/F30: restricted controlled-register entry and owned next actions.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { governanceKinds } from "@/domain/privacy-governance";
import { governancePageSession } from "@/features/privacy-governance/access";
import { governanceCopy } from "@/features/privacy-governance/copy";
import { StaffPage, StaffPanel, StaffToolbar } from "@/features/shell/staff-ui";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { listGovernance } from "@/server/privacy-governance/service";

export default async function GovernancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const path = `/${locale}/operations/privacy-governance`,
    copy = governanceCopy(locale),
    session = await governancePageSession(locale, path);
  if (!session)
    return (
      <StaffPage title={copy.title} lead={copy.denied}>
        <a href={`/${locale}/settings`}>{copy.settings}</a>
      </StaffPage>
    );
  const query = await searchParams,
    kind = governanceKinds.find((kind) => query.kind === kind),
    page =
      typeof query.page === "string" && /^[1-9]\d*$/.test(query.page) && Number(query.page) <= 2500
        ? Number(query.page)
        : 1,
    model = await listGovernance(getDb(), session, { ...(kind ? { kind } : {}), page });
  const href = (number: number) => `${path}?${kind ? `kind=${kind}&` : ""}page=${number}`;
  return (
    <StaffPage
      title={copy.title}
      lead={copy.lead}
      actions={
        <a className="text-action hover:underline" href={`/${locale}/settings?section=agency`}>
          {copy.settings}
        </a>
      }
    >
      <nav aria-label={copy.title}>
        <StaffToolbar>
          <a href={path} aria-current={!kind ? "page" : undefined}>
            {copy.all}
          </a>
          {governanceKinds.map((key) => (
            <a
              key={key}
              href={`${path}?kind=${key}`}
              aria-current={kind === key ? "page" : undefined}
            >
              {copy.kinds[key]}
            </a>
          ))}
        </StaffToolbar>
      </nav>
      <StaffToolbar>
        {governanceKinds.map((key) => (
          <a key={key} href={`${path}/new?kind=${key}`} className="text-action hover:underline">
            {copy.new} · {copy.kinds[key]}
          </a>
        ))}
      </StaffToolbar>
      <p className="text-dense text-text-muted">{copy.policyHelp}</p>
      {!model.items.length ? (
        <StaffPanel title={copy.all}>
          <p>{copy.empty}</p>
        </StaffPanel>
      ) : (
        <ul className="grid min-w-0 gap-4">
          {model.items.map((row) => (
            <li key={row.id}>
              <StaffPanel
                title={row.document.title}
                actions={
                  <a className="text-action hover:underline" href={`${path}/${row.id}`}>
                    {copy.reload}
                  </a>
                }
                lead={`${copy.kinds[row.document.kind]} · ${row.issues.length ? copy.held : row.reviewed ? copy.reviewed : copy.unreviewed}`}
              >
                <dl className="grid gap-2 text-dense">
                  <dt>{copy.fields.ownerId}</dt>
                  <dd>
                    {model.people.find((person) => person.id === row.document.ownerId)
                      ?.displayName ?? copy.inactiveOwner}
                  </dd>
                  <dt>{copy.fields.nextAction}</dt>
                  <dd className="wrap-anywhere">{row.document.nextAction}</dd>
                  <dt>{copy.fields.nextReviewAt}</dt>
                  <dd>
                    {row.document.nextReviewAt ? (
                      <time dateTime={row.document.nextReviewAt}>
                        {formatDateTime(locale, row.document.nextReviewAt)}
                      </time>
                    ) : (
                      copy.unknown
                    )}
                  </dd>
                </dl>
              </StaffPanel>
            </li>
          ))}
        </ul>
      )}
      <StaffToolbar>
        {page > 1 ? <a href={href(page - 1)}>{copy.previous}</a> : null}
        {model.more ? <a href={href(page + 1)}>{copy.next}</a> : null}
      </StaffToolbar>
    </StaffPage>
  );
}
