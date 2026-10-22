import { z } from "zod";
import { DuplicateReviewScreen } from "@/features/duplicate-review/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

/** O27 / W12-T2: a comparison does not infer identity or confer merge authority. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ left?: string; right?: string; page?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  const valid = z
    .object({ left: z.uuid().optional(), right: z.uuid().optional() })
    .safeParse(query);
  const invalidPair =
    !valid.success || (query.right && !query.left) || (query.left && query.left === query.right);
  return (
    <DuplicateReviewScreen
      locale={locale}
      session={session}
      query={invalidPair ? { page: query.page, error: "invalid" } : query}
    />
  );
}
