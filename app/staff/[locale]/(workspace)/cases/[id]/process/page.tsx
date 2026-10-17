import { redirect } from "next/navigation";
import { ProcessScreen } from "@/features/compliance/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params,
    session = await requireStaffPage(locale);
  if (!isFresh(session))
    redirect(
      `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/cases/${id}/process`)}`,
    );
  return <ProcessScreen locale={locale} id={id} session={session} />;
}
