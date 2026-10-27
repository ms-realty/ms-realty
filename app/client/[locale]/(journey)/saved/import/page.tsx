// C05 / AT08 review before explicit union; a GET never consumes the transfer.

import { AccountSavesScreen } from "@/features/account-saves/screens";
import { requireClientPage } from "@/features/cases/access";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireClientPage(locale, `/${locale}/saved/import`);
  return <AccountSavesScreen locale={locale} session={session} review />;
}
