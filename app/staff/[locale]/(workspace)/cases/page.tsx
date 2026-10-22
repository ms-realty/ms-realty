// O04 cases index (Figma 14:1847 / 14:4522): the staff screen lives in
// src/features/cases/directory-screen.tsx; the client host keeps its own case chooser.

import { retainedCaseDirectoryFilter } from "@/features/cases/directory-private";
import { CaseDirectoryScreen } from "@/features/cases/directory-screen";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  // One value per parameter. Private text is accepted by POST and belongs to this session;
  // the URL carries only its opaque context identity, never purpose/party/action prose.
  const raw = await searchParams;
  const filter = Array.isArray(raw.filter) ? raw.filter[0] : raw.filter;
  const retained = filter ? await retainedCaseDirectoryFilter(session, locale, filter) : null;
  const query = {
    ...raw,
    q: filter ? retained?.values.q : raw.q,
    purpose: retained?.values.purpose,
    party: retained?.values.party,
    nextAction: retained?.values.nextAction,
  };
  return (
    <CaseDirectoryScreen
      locale={locale}
      session={session}
      query={query}
      privateFilterUnavailable={Boolean(filter && !retained)}
      shortened={retained?.shortened}
    />
  );
}
