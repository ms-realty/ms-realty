// O01/F13 authorized search. Personal search terms use a native POST, never URL parameters.
import { StaffPage } from "@/features/shell/staff-ui";
import { RecordSearch } from "@/features/work/record-search";
import { recordSearchAction } from "@/features/work/record-search-action";
import { checkLocale } from "@/features/work/screens";
import { staffWorkflowCopy } from "@/features/work/workflow-completion-copy";
import { requireStaffPage } from "@/server/auth/pages";
export default async function SearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  await requireStaffPage(locale);
  const copy = staffWorkflowCopy(locale);
  return (
    <StaffPage title={copy.search} lead={copy.scoped}>
      <RecordSearch
        locale={locale}
        path={`/${locale}/search`}
        action={recordSearchAction.bind(null, locale, "all")}
      />
      <section className="space-y-3">
        <h2>{copy.notifications}</h2>
        <p>{copy.notificationHint}</p>
        <a
          href={`/${locale}/today`}
          className="inline-flex min-h-control items-center font-semibold text-link underline"
        >
          {copy.notifications}
        </a>
      </section>
    </StaffPage>
  );
}
