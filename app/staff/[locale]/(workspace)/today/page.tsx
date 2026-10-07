// O01 Today, and its focus state that pages one queue past Today's rows
// (?queue=translation-reviews&after=<cursor>). Any other queue is not a page.
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { workCopy } from "@/features/work/copy";
import { checkLocale } from "@/features/work/screens";
import { todayCopy } from "@/features/work/today-copy";
import { TranslationReviewsScreen } from "@/features/work/today-focus";
import { TodayScreen } from "@/features/work/today-screen";
import { requireStaffPage } from "@/server/auth/pages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** One value per parameter: a repeated one (?queue=a&queue=b) keeps its first value. */
const scalar = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      scalar((await searchParams).queue) === "translation-reviews"
        ? todayCopy(locale).groups.translationReviews
        : workCopy(locale).today,
  };
}

export default async function WorkPage({ params, searchParams }: Props) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  const queue = scalar(query.queue);
  if (queue !== undefined) {
    if (queue !== "translation-reviews") notFound();
    return (
      <TranslationReviewsScreen locale={locale} session={session} after={scalar(query.after)} />
    );
  }
  // The greeting names the signed-in person, as the workspace shell does.
  const [principal] = await getDb()
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, session.account.id));

  return <TodayScreen locale={locale} session={session} name={principal?.name ?? null} />;
}
