// O06 / F04: explicit stage, ownership acceptance and closeout.
import { LifecycleScreen } from "@/features/cases/lifecycle-screen";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  return <LifecycleScreen locale={locale} session={session} id={id} />;
}
