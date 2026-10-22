import "server-only";
import type { ContentReference } from "@/domain/inquiry-content";
import { contentRoute } from "@/domain/inquiry-content";
import type { PublicLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import { readApprovedContent } from "../content/public";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** Called in the intake transaction; withdrawal, replacement and lost approval cannot drift. */
export async function readInquiryContent(
  db: Executor,
  reference: ContentReference,
  locale: PublicLocale,
) {
  const content = await readApprovedContent(db, reference.kind, reference.slug, locale, {
    lock: true,
  });
  if (!content || content.version.id !== reference.versionId)
    throw new AppError("version_conflict", { current: { reason: "content_changed" } });
  return {
    ...reference,
    title: content.title,
    locale: content.locale,
    sourceUrl: `${getEnv().canonicalOrigin}/${locale}${contentRoute(reference)}`,
  };
}
