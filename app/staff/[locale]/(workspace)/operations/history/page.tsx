// O26 · W14-T3. GET-only history navigation within the authenticated workspace.
import { AuditHistoryPage } from "@/features/audit-history/page";

export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  return <AuditHistoryPage locale={locale} search={await searchParams} />;
}
