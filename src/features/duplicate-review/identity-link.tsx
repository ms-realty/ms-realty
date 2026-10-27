import "server-only";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { type MergeSubject, readCanonicalDuplicate } from "@/server/duplicate-review/impact";
import { AppError } from "@/server/errors";
import { duplicateMergeCopy } from "./merge-copy";

/** Keep original-source workbenches intact; reveal a mapping only after both reads pass. */
export async function DuplicateIdentityLink({
  locale,
  session,
  subject,
  id,
}: {
  locale: string;
  session: Session;
  subject: MergeSubject;
  id: string;
}) {
  try {
    const current = await readCanonicalDuplicate(getDb(), session, subject, id);
    if (!current.source.mergedInto && !current.aliases.length) return null;
    return (
      <a
        className="inline-block min-h-control py-2 font-semibold text-link underline"
        href={`/${locale}/operations/duplicates/merge/identity?subject=${subject}&id=${id}`}
      >
        {duplicateMergeCopy(locale).openCanonical}
      </a>
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return null;
    throw error;
  }
}
