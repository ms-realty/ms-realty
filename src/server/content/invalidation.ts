import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { approvals, contentLocaleEditions, contentLocaleVersions } from "@/db/schema";
import type { Executor } from "../db";

/** Caller holds the BG page lock. A new source never silently revives prior locale review. */
export async function invalidateContentLocales(db: Executor, pageId: string) {
  const editions = await db
    .update(contentLocaleEditions)
    .set({
      reviewState: "stale",
      publicationState: "withdrawn",
      version: sql`${contentLocaleEditions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(contentLocaleEditions.contentPageId, pageId))
    .returning({ id: contentLocaleEditions.id });
  if (!editions.length) return;
  const subjects = db
    .select({ id: contentLocaleVersions.id })
    .from(contentLocaleVersions)
    .where(
      inArray(
        contentLocaleVersions.editionId,
        editions.map((edition) => edition.id),
      ),
    );
  await db
    .update(approvals)
    .set({
      state: "invalidated",
      invalidatedAt: new Date(),
      invalidationReason: "bg_source_changed_or_withdrawn",
    })
    .where(
      and(
        eq(approvals.subjectType, "content_locale_version"),
        inArray(approvals.subjectId, subjects),
        eq(approvals.state, "approved"),
      ),
    );
}
