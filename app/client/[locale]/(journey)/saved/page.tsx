// C05 account saves stay separate from Case Interests.

import { AccountSavesScreen } from "@/features/account-saves/screens";
import { requireClientPage } from "@/features/cases/access";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireClientPage(locale, `/${locale}/saved`);
  return <AccountSavesScreen locale={locale} session={session} />;
}
