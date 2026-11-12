// C · a home on the client's own Deal (ADR 0015), also when it is not on the public website.
import { requireClientPage } from "@/features/cases/access";
import { DealHomeScreen } from "@/features/cases/deal-home-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; reference: string }>;
}) {
  const { locale, id, reference } = await params;
  const session = await requireClientPage(
    locale,
    `/${locale}/properties/${encodeURIComponent(id)}/homes/${encodeURIComponent(reference)}`,
  );
  return <DealHomeScreen locale={locale} session={session} id={id} reference={reference} />;
}
