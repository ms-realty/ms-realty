import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { dataReviewCopy } from "@/features/import-review/copy";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { contactReviewStatus } from "@/server/duplicate-review/review";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ left?: string; right?: string; key?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  const pair = { left: query.left ?? "", right: query.right ?? "" };
  const status = await privateRead(() =>
    contactReviewStatus(getDb(), session, pair, query.key ?? ""),
  );
  if (status.state === "succeeded")
    redirect(`/${locale}/operations/duplicates/receipt?id=${status.id}`);
  const copy = dataReviewCopy(locale).duplicates;
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 p-4 md:p-8">
      <h1 className="text-h1 font-semibold">{copy.title}</h1>
      <p>{status.state === "unknown" ? copy.uncertain : copy.failure}</p>
      <p>{copy.boundary}</p>
      <a
        className="min-h-control py-2 font-semibold text-link underline"
        href={`?left=${pair.left}&right=${pair.right}&key=${encodeURIComponent(query.key ?? "")}`}
      >
        {copy.checkAgain}
      </a>
      {status.state !== "unknown" ? (
        <a
          className="min-h-control py-2 font-semibold text-link underline"
          href={`/${locale}/operations/duplicates?left=${pair.left}&right=${pair.right}`}
        >
          {copy.compare}
        </a>
      ) : null}
    </main>
  );
}
