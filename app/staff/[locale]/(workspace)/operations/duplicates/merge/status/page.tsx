import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { duplicateMergeCopy } from "@/features/duplicate-review/merge-copy";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { duplicateOperationStatus } from "@/server/duplicate-review/merge";
import { AppError } from "@/server/errors";

/** F32/UX22: exact submitted key, no re-execution and no inferred success. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    subject?: string;
    left?: string;
    right?: string;
    mode?: string;
    key?: string;
    mergeId?: string;
  }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  if (
    (query.subject !== "party" && query.subject !== "property") ||
    (query.mode !== "merge" && query.mode !== "reverse")
  )
    throw new AppError("not_found");
  const pair = { subject: query.subject, left: query.left ?? "", right: query.right ?? "" };
  const current = await privateRead(() =>
    duplicateOperationStatus(
      getDb(),
      session,
      pair,
      query.mode as "merge" | "reverse",
      query.key ?? "",
      query.mergeId,
    ),
  );
  if (current.state === "succeeded")
    redirect(`/${locale}/operations/duplicates/merge/receipt?id=${current.id}`);
  const copy = duplicateMergeCopy(locale),
    link = "min-h-control py-2 font-semibold text-link underline";
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 md:p-8">
      <h1 className="text-title font-semibold">{copy.receipt}</h1>
      <p>
        {current.state === "unknown"
          ? copy.unknown
          : current.state === "absent"
            ? copy.absent
            : copy.failure}
      </p>
      <a
        className={link}
        href={`?subject=${pair.subject}&left=${pair.left}&right=${pair.right}&mode=${query.mode}&mergeId=${query.mergeId ?? ""}&key=${encodeURIComponent(query.key ?? "")}`}
      >
        {copy.checkAgain}
      </a>
      {current.state !== "unknown" ? (
        <a
          className={link}
          href={`/${locale}/operations/duplicates/merge?subject=${pair.subject}&left=${pair.left}&right=${pair.right}`}
        >
          {copy.reviewAgain}
        </a>
      ) : null}
    </div>
  );
}
