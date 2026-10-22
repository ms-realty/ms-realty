import { getDb } from "@/db/client";
import { importReviewAction } from "@/features/import-review/actions";
import { dataReviewCopy } from "@/features/import-review/copy";
import { ImportReviewForm } from "@/features/import-review/form";
import { initialImportReview } from "@/features/import-review/state";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { importReviewer } from "@/server/import-review/preview";

/** O28 → O28M → O28CHECK / W12-T1. Preview has no apply or publication command. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  await privateRead(() => importReviewer(getDb(), session));
  const copy = dataReviewCopy(locale);
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-4 md:p-8">
      <h1 className="text-title font-semibold">{copy.imports.title}</h1>
      <p>{copy.imports.intro}</p>
      <ImportReviewForm
        locale={locale}
        action={importReviewAction.bind(null, locale)}
        initialState={initialImportReview}
      />
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
