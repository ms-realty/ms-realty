// O27: read actual retained queue state; never infer live worker health from a connection.

import { notFound } from "next/navigation";
import { externalActionView } from "@/features/ai/jobs-view";
import { checkAiLocale, JobsScreen } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkAiLocale(locale);
  const externalView = externalActionView(await searchParams);
  if (externalView === null) notFound();
  return (
    <JobsScreen
      locale={locale}
      session={await requireStaffPage(locale)}
      externalView={externalView}
    />
  );
}
