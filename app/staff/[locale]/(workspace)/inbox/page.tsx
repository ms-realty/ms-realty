import { redirect } from "next/navigation";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function InboxAlias({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  await requireStaffPage(locale);
  return redirect(`/${locale}/inquiries`);
}
