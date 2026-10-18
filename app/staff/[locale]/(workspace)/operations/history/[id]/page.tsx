// O26L · W14-T3. The reader reauthorizes this exact stored event on every GET.
import { AuditHistoryPage } from "@/features/audit-history/page";

export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <AuditHistoryPage locale={locale} id={id} />;
}
