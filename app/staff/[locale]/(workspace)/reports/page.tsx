// O22 / F25: report filters contain only bounded non-personal values.
import { notFound } from "next/navigation";
import { reportsCopy } from "@/features/reports/copy";
import { ReportsScreen } from "@/features/reports/screen";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { reportFilter } from "@/server/reports/queries";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props) {
  return { title: reportsCopy((await params).locale).title };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  let filter: ReturnType<typeof reportFilter>;
  try {
    filter = reportFilter(await searchParams);
  } catch {
    notFound();
  }
  return <ReportsScreen locale={locale} session={session} filter={filter} />;
}
