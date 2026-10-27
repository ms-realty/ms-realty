// B10 / AT10 / AT11 / AT40: exact-purpose evidence, current scope and recoverable human commands.
import { AgencyReceipt } from "@/features/agency-obligations/screens";
import { requireClientPage } from "@/features/cases/access";
import { privateRead } from "@/features/work/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string; key?: string }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  const session = await requireClientPage(locale, `/${locale}/reviews`);
  return privateRead(() =>
    AgencyReceipt({
      locale,
      session,
      command: "clientConsent",
      id: query.id ?? "",
      operationKey: query.key ?? "",
    }),
  );
}
