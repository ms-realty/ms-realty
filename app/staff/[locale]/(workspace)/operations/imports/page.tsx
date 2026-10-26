import { getDb } from "@/db/client";
import { importReviewAction } from "@/features/import-review/actions";
import { dataReviewCopy } from "@/features/import-review/copy";
import { importExecutionCopy } from "@/features/import-review/execution-copy";
import { ImportReviewForm } from "@/features/import-review/form";
import { ImportReceiptView } from "@/features/import-review/receipt";
import { initialImportReview } from "@/features/import-review/state";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { readStaffImport, recentStaffImports } from "@/server/import-review/commands";
import { importReviewer } from "@/server/import-review/preview";

/** O28 / F32 / AT55: source → dry run → exact human subset → durable per-row result. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ review?: string; problem?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  await privateRead(() => importReviewer(getDb(), session));
  const query = await searchParams;
  const receipt = query.review
    ? await privateRead(() => readStaffImport(getDb(), session, query.review as string))
    : null;
  const recent = receipt ? [] : await privateRead(() => recentStaffImports(getDb(), session));
  const copy = dataReviewCopy(locale);
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-4 md:p-8">
      <h1 className="text-title font-semibold">{copy.imports.title}</h1>
      <p>{copy.imports.intro}</p>
      {receipt ? (
        <ImportReceiptView locale={locale} receipt={receipt} problem={query.problem} />
      ) : (
        <ImportReviewForm
          locale={locale}
          action={importReviewAction.bind(null, locale)}
          initialState={initialImportReview}
        />
      )}
      {recent.length ? (
        <nav aria-label={importExecutionCopy(locale).recent} className="grid gap-3">
          <h2 className="text-heading font-semibold">{importExecutionCopy(locale).recent}</h2>
          {recent.map((item) => (
            <a
              key={item.id}
              className="min-h-control break-all py-2 font-semibold text-link underline underline-offset-4"
              href={`/${locale}/operations/imports?review=${item.id}`}
            >
              {item.reference} · {item.operationKey}
            </a>
          ))}
        </nav>
      ) : null}
      <nav className="flex flex-wrap gap-5">
        <a
          className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
          href={`/${locale}/operations/duplicates`}
        >
          {copy.duplicates.title}
        </a>
        <a
          className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
          href={`/${locale}/operations`}
        >
          {copy.tools}
        </a>
      </nav>
    </div>
  );
}
