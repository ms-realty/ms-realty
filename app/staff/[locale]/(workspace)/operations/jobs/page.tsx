// O27: read actual retained queue state; never infer live worker health from a connection.
import { checkAiLocale, JobsScreen } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkAiLocale(locale);
  return <JobsScreen locale={locale} session={await requireStaffPage(locale)} />;
}
