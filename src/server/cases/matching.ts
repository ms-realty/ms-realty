// O07: a staff Case read over the current public search projection. A Brief without reviewed
// structured criteria cannot silently become a broad inventory recommendation.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { briefRevisions } from "@/db/schema";
import { publicLocales } from "@/domain/ids";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { caseMatchCriteriaInput, searchListings } from "../search/search";
import { parseInput } from "../work/shared";
import { caseFor } from "./shared";

const requestSchema = z.object({
  id: z.uuid(),
  locale: z.enum(publicLocales).default("bg"),
  pageSize: z.number().int().min(1).max(60).default(24),
  cursor: z.string().max(512).optional(),
});

/** Candidate status is bound to one Brief revision and one current search response. */
export async function readCaseMatches(
  db: Executor,
  session: Session,
  raw: z.input<typeof requestSchema>,
) {
  const input = parseInput(requestSchema, raw);
  const { row, live } = await caseFor(db, session, input.id, "case.read_internal");
  if (live.account.kind !== "staff" || !["buyer", "tenant"].includes(row.kind))
    throw new AppError("not_found");

  const [brief] = await db
    .select({
      id: briefRevisions.id,
      revision: briefRevisions.revisionNumber,
      criteria: briefRevisions.criteria,
      clientAcknowledgedAt: briefRevisions.clientAcknowledgedAt,
    })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, row.id))
    .orderBy(desc(briefRevisions.revisionNumber))
    .limit(1);
  const parsed = caseMatchCriteriaInput.safeParse(brief?.criteria);
  const purpose = row.kind === "buyer" ? "sale" : "long_term_rent";
  if (!brief || !parsed.success || parsed.data.purpose !== purpose)
    return {
      status: "criteria_required" as const,
      caseId: row.id,
      caseVersion: row.version,
      brief: brief
        ? {
            id: brief.id,
            revision: brief.revision,
            clientAcknowledgedAt: brief.clientAcknowledgedAt,
          }
        : null,
      reason:
        !brief || !parsed.success ? ("missing_or_invalid" as const) : ("kind_mismatch" as const),
    };

  const result = await searchListings(db, {
    ...parsed.data,
    locale: input.locale,
    includeUnconfirmed: true,
    pageSize: input.pageSize,
    cursor: input.cursor,
  });
  return {
    status: "ready" as const,
    caseId: row.id,
    caseVersion: row.version,
    brief: {
      id: brief.id,
      revision: brief.revision,
      clientAcknowledgedAt: brief.clientAcknowledgedAt,
    },
    criteria: result.criteria,
    confirmed: result.items.filter((item) => item.match === "match"),
    needsConfirmation: result.items.filter((item) => item.match === "needs_confirmation"),
    count: result.count,
    nextCursor: result.nextCursor,
    queryId: result.queryId,
    sourceTimestamp: result.sourceTimestamp,
    stale: result.stale,
  };
}
