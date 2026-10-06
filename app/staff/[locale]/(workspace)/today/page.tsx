// O01 Today.
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { workCopy } from "@/features/work/copy";
import { checkLocale } from "@/features/work/screens";
import { TodayScreen } from "@/features/work/today-screen";
import { requireStaffPage } from "@/server/auth/pages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return { title: workCopy((await params).locale).today };
}

export default async function WorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  // The greeting names the signed-in person, as the workspace shell does.
  const [principal] = await getDb()
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, session.account.id));

  return <TodayScreen locale={locale} session={session} name={principal?.name ?? null} />;
}
