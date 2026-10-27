import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { briefRevisions, caseStageHistory, interests, listings } from "@/db/schema";
import type { PublicLocale } from "@/i18n/config";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { loadCards } from "../publication/presentation";
import { caseFor } from "./shared";

/** C03: a curated business history, never the internal event, reason or evidence payload. */
export async function readClientContinuity(db: Executor, session: Session, id: string) {
  const { row, live } = await caseFor(db, session, id);
  if (live.account.kind !== "client") return [];
  const stages = await db
    .select({
      id: caseStageHistory.id,
      stage: caseStageHistory.toStage,
      at: caseStageHistory.occurredAt,
    })
    .from(caseStageHistory)
    .where(
      and(
        eq(caseStageHistory.caseId, id),
        ne(caseStageHistory.fromStage, caseStageHistory.toStage),
      ),
    )
    .orderBy(asc(caseStageHistory.occurredAt), asc(caseStageHistory.id))
    .limit(30);
  const briefs = await db
    .select({
      id: briefRevisions.id,
      at: briefRevisions.createdAt,
      acknowledgedAt: briefRevisions.clientAcknowledgedAt,
    })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, id))
    .orderBy(asc(briefRevisions.createdAt))
    .limit(10);
  return [
    { id: `opened-${row.id}`, kind: "opened" as const, at: row.createdAt, stage: null },
    ...stages.map((event) => ({ ...event, kind: "stage" as const })),
    ...briefs.flatMap((brief) => [
      { id: `brief-${brief.id}`, kind: "brief" as const, at: brief.at, stage: null },
      ...(brief.acknowledgedAt
        ? [
            {
              id: `ack-${brief.id}`,
              kind: "acknowledged" as const,
              at: brief.acknowledgedAt,
              stage: null,
            },
          ]
        : []),
    ]),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
}

/** C05 approved public facts only, after current Case authorization; no private address. */
export async function readClientInterestCards(
  db: Executor,
  session: Session,
  id: string,
  locale: PublicLocale,
) {
  const { live } = await caseFor(db, session, id);
  if (live.account.kind !== "client") return new Map();
  const rows = await db
    .select({ id: interests.id, listingId: interests.listingId, reference: listings.reference })
    .from(interests)
    .innerJoin(listings, eq(listings.id, interests.listingId))
    .where(eq(interests.caseId, id))
    .limit(50);
  const cards = await loadCards(
    db,
    rows.map((row) => row.listingId),
    locale,
    new Date(),
  );
  return new Map(
    rows.map((row) => [row.id, cards.find((card) => card.reference === row.reference) ?? null]),
  );
}
