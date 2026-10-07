import "server-only";
import { and, asc, desc, eq, gt, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { briefRevisions, caseParticipants, cases, parties, principals } from "@/db/schema";
import {
  type CaseDisposition,
  type CaseKind,
  type CaseStage,
  caseDispositions,
  caseKinds,
  demandStages,
  serviceIntakeStages,
  supplyStages,
} from "@/domain/case";
import type { Session } from "../auth/sessions";
import { resolveGrants } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { containsSearchControl } from "../search/controls";
import { ownerNeedsCoverage } from "../work/coverage-policy";
import { liveStaff, parseInput } from "../work/shared";
import { caseGrantVisibility, liveParticipation } from "./shared";

export const caseIndexCollections = ["all", "mine", "needs"] as const;
export const caseNextActionStates = [
  "none",
  "restricted",
  "unscheduled",
  "scheduled",
  "due",
  "waiting",
  "review_due",
] as const;
export type CaseAttentionReason =
  | "requirements_unknown"
  | "next_action_unscheduled"
  | "next_action_due"
  | "waiting_review_due"
  | "paused_review_due";

// Reject controls before trimming: in particular, a NUL must never reach PostgreSQL text.
const textFilter = z
  .string()
  .max(120)
  .refine((value) => !containsSearchControl(value), "Control characters are not allowed")
  .transform((value) => value.trim());
const optionalTextFilter = textFilter.transform((value) => value || undefined).optional();
const querySchema = z.strictObject({
  collection: z.enum(caseIndexCollections).default("all"),
  search: textFilter.default(""),
  /** The recorded purpose is Case.title; kind remains the separate type filter. */
  purpose: optionalTextFilter,
  party: optionalTextFilter,
  partyId: z.uuid().optional(),
  kind: z.enum(caseKinds).optional(),
  stage: z.enum([...demandStages, ...supplyStages, ...serviceIntakeStages]).optional(),
  disposition: z.enum(caseDispositions).optional(),
  ownerId: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  nextAction: optionalTextFilter,
  nextActionState: z.enum(caseNextActionStates).optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
  cursor: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
});
export type CaseIndexQuery = z.input<typeof querySchema>;

export interface CaseIndexRow {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly kind: CaseKind;
  readonly serviceTopic: typeof cases.$inferSelect.serviceTopic;
  readonly stage: CaseStage;
  readonly disposition: CaseDisposition;
  readonly partyLabel: string | null;
  readonly ownerId: string | null;
  readonly ownerName: string | null;
  readonly needsCoverage: boolean;
  /** Restricted fields are absent. A curated summary may supply nextAction and dueAt. */
  readonly nextAction?: string | null;
  readonly dueAt?: Date | null;
  readonly waitingOn?: string | null;
  readonly reviewAt?: Date | null;
  readonly nextActionState: (typeof caseNextActionStates)[number];
  readonly needsReasons: readonly CaseAttentionReason[];
  readonly createdAt: Date;
  /** Internal edits are visible only with case.read_internal on this Case. */
  readonly updatedAt?: Date;
}
export interface CaseIndexPage {
  readonly rows: readonly CaseIndexRow[];
  /** Count of the current authorized, filtered collection, before the cursor. */
  readonly total: number;
  readonly nextCursor: string | null;
}

const cursorSchema = z.strictObject({
  query: z.string().length(64),
  id: z.uuid(),
  sortAt: z.iso.datetime({ precision: 6 }),
});
function readCursor(value: string | undefined, query: string) {
  if (!value) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    // PostgreSQL rejects year zero although the ISO parser accepts its shape.
    if (cursor.query === query && !cursor.sortAt.startsWith("0000-")) return cursor;
  } catch {
    // Cursors are untrusted query input, never stored authorization or totals.
  }
  throw new AppError("validation_failed", {
    fieldErrors: { cursor: ["Invalid Case index cursor"] },
  });
}
const contains = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

/** O04: current Case grants, safe relationships and one statement for the page and total. */
export async function queryCaseIndex(
  db: Executor,
  session: Session,
  input: CaseIndexQuery = {},
): Promise<CaseIndexPage> {
  const live = await liveStaff(db, session);
  // listCases' URL-search contract (containsSearchControl, src/server/search/controls.ts):
  // invalid controls are a no-match result, never an unfiltered collection or a PostgreSQL
  // text error.
  if (typeof input?.search === "string" && containsSearchControl(input.search))
    return { rows: [], total: 0, nextCursor: null };
  const query = parseInput(querySchema, input);
  const { cursor: encodedCursor, pageSize, ...filters } = query;
  const queryId = hashRequest({ reader: live.account.id, ...filters });
  const cursor = readCursor(encodedCursor, queryId);
  const grants = await resolveGrants(db, live.actor);
  const internal = caseGrantVisibility(grants, "case.read_internal");
  const sortAt = sql<Date>`case when ${internal} then ${cases.updatedAt} else ${cases.createdAt} end`;
  const now = sql`statement_timestamp()`;
  const relationship = and(
    eq(caseParticipants.caseId, cases.id),
    liveParticipation(),
    isNull(parties.mergedIntoPartyId),
  );
  const labels = db
    .selectDistinct({ name: parties.displayName })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(relationship)
    .as("index_party_labels");
  const latestBrief = db
    .select({ unknown: sql<boolean>`${briefRevisions.items} @> '[{"kind":"unknown"}]'::jsonb` })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, cases.id))
    .orderBy(desc(briefRevisions.revisionNumber))
    .limit(1);
  const authorized = db.$with("index_authorized").as(
    db
      .select({
        id: cases.id,
        reference: cases.reference,
        title: cases.title,
        kind: cases.kind,
        serviceTopic: cases.serviceTopic,
        stage: cases.stage,
        disposition: cases.disposition,
        ownerId: cases.ownerId,
        ownerName: principals.displayName,
        needsCoverage:
          sql<boolean>`${cases.disposition} <> 'closed' and ${ownerNeedsCoverage(cases.ownerId, now)}`.as(
            "needs_coverage",
          ),
        internal: sql<boolean>`${internal}`.as("internal"),
        partyLabel: sql<
          string | null
        >`(select string_agg(${labels.name}, ', ' order by ${labels.name} collate "C") from ${labels})`.as(
          "party_label",
        ),
        nextAction: sql<string | null>`case when ${cases.disposition} = 'active'
          then case when ${internal} then ${cases.nextAction} else nullif(${cases.clientSummary}, '') end end`.as(
          "next_action",
        ),
        dueAt: sql<Date | null>`case when ${cases.disposition} = 'active'
          and (${internal} or nullif(${cases.clientSummary}, '') is not null) then ${cases.nextActionDueAt} end`
          .mapWith(cases.nextActionDueAt)
          .as("due_at"),
        waitingOn: sql<
          string | null
        >`case when ${cases.disposition} <> 'closed' and ${internal} then ${cases.waitingOn} end`.as(
          "waiting_on",
        ),
        reviewAt:
          sql<Date | null>`case when ${cases.disposition} <> 'closed' and ${internal} then ${cases.reviewAt} end`
            .mapWith(cases.reviewAt)
            .as("review_at"),
        requirementsUnknown: sql<boolean>`coalesce((${latestBrief}), false)`.as(
          "requirements_unknown",
        ),
        createdAt: cases.createdAt,
        updatedAt: sql<Date | null>`case when ${internal} then ${cases.updatedAt} end`
          .mapWith(cases.updatedAt)
          .as("updated_at"),
        sortAt: sortAt.mapWith(cases.createdAt).as("sort_at"),
        // Date loses PostgreSQL microseconds. Keep the exact key in the cursor.
        cursorTime:
          sql<string>`to_char(${sortAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
            "cursor_time",
          ),
      })
      .from(cases)
      .leftJoin(principals, eq(principals.id, cases.ownerId))
      .where(
        and(
          caseGrantVisibility(grants, "case.read"),
          query.collection === "mine" ? eq(cases.ownerId, live.account.id) : undefined,
          query.partyId
            ? sql`exists (${db
                .select({ id: caseParticipants.id })
                .from(caseParticipants)
                .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
                .where(and(relationship, eq(parties.id, query.partyId)))})`
            : undefined,
        ),
      ),
  );
  // Only Brief data is visible to every Case reader. Private Case work requires internal
  // read for collection membership too; unrelated or private tasks never contribute.
  const reasons = sql<CaseAttentionReason[]>`array_remove(array[
    case when ${authorized.disposition} = 'active' and ${authorized.requirementsUnknown} then 'requirements_unknown' end,
    case when ${authorized.disposition} = 'active' and ${authorized.internal} and ${authorized.nextAction} is not null and ${authorized.dueAt} is null then 'next_action_unscheduled' end,
    case when ${authorized.disposition} = 'active' and ${authorized.internal} and ${authorized.nextAction} is not null and ${authorized.dueAt} <= ${now} then 'next_action_due' end,
    case when ${authorized.disposition} = 'active' and ${authorized.internal} and ${authorized.waitingOn} is not null and ${authorized.reviewAt} <= ${now} then 'waiting_review_due' end,
    case when ${authorized.disposition} = 'paused' and ${authorized.internal} and ${authorized.reviewAt} <= ${now} then 'paused_review_due' end
  ], null)::text[]`;
  const actionState = sql<CaseIndexRow["nextActionState"]>`case
    when ${authorized.disposition} = 'closed' then 'none'
    when ${authorized.nextAction} is not null then case
      when ${authorized.dueAt} is null then 'unscheduled'
      when ${authorized.dueAt} <= ${now} then 'due' else 'scheduled' end
    when ${authorized.waitingOn} is not null then case
      when ${authorized.reviewAt} <= ${now} then 'review_due' else 'waiting' end
    when not ${authorized.internal} then 'restricted' else 'none' end`;
  const selected = db.$with("index_selected").as(
    db
      .select({
        ...authorized._.selectedFields,
        nextActionState: actionState.as("next_action_state"),
        needsReasons: reasons.as("needs_reasons"),
      })
      .from(authorized)
      .where(
        and(
          query.search
            ? or(
                ilike(authorized.reference, contains(query.search)),
                ilike(authorized.title, contains(query.search)),
                ilike(authorized.partyLabel, contains(query.search)),
              )
            : undefined,
          query.purpose ? ilike(authorized.title, contains(query.purpose)) : undefined,
          query.party ? ilike(authorized.partyLabel, contains(query.party)) : undefined,
          query.kind ? eq(authorized.kind, query.kind) : undefined,
          query.stage ? eq(authorized.stage, query.stage) : undefined,
          query.disposition ? eq(authorized.disposition, query.disposition) : undefined,
          query.ownerId === "unassigned"
            ? isNull(authorized.ownerId)
            : query.ownerId
              ? eq(authorized.ownerId, query.ownerId)
              : undefined,
          query.nextAction ? ilike(authorized.nextAction, contains(query.nextAction)) : undefined,
          query.nextActionState ? eq(actionState, query.nextActionState) : undefined,
          query.collection === "needs" ? sql`cardinality(${reasons}) > 0` : undefined,
        ),
      ),
  );
  const counted = db
    .$with("index_total")
    .as(db.select({ total: sql<number>`count(*)`.mapWith(Number).as("total") }).from(selected));
  const page = db.$with("index_page").as(
    db
      .select(selected._.selectedFields)
      .from(selected)
      .where(
        cursor
          ? or(
              lt(selected.sortAt, sql`${cursor.sortAt}::timestamptz`),
              and(
                eq(selected.sortAt, sql`${cursor.sortAt}::timestamptz`),
                gt(selected.id, cursor.id),
              ),
            )
          : undefined,
      )
      .orderBy(desc(selected.sortAt), asc(selected.id))
      .limit(pageSize + 1),
  );
  const result = await db
    .with(authorized, selected, counted, page)
    .select({ total: counted.total, row: page._.selectedFields })
    .from(counted)
    .leftJoin(page, sql`true`)
    .orderBy(desc(page.sortAt), asc(page.id));
  const records = result.flatMap(({ row }) => (row?.id ? [row] : []));
  const visible = records.slice(0, pageSize);
  const last = visible.at(-1);
  return {
    total: result[0]?.total ?? 0,
    nextCursor:
      records.length > pageSize && last
        ? Buffer.from(
            JSON.stringify({ query: queryId, id: last.id, sortAt: last.cursorTime }),
          ).toString("base64url")
        : null,
    rows: visible.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      kind: row.kind,
      serviceTopic: row.serviceTopic,
      stage: row.stage as CaseStage,
      disposition: row.disposition,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      needsCoverage: row.needsCoverage,
      partyLabel: row.partyLabel,
      nextActionState: row.nextActionState,
      needsReasons: row.needsReasons,
      createdAt: row.createdAt,
      ...(row.internal
        ? {
            updatedAt: row.updatedAt,
            nextAction: row.nextAction,
            dueAt: row.dueAt,
            waitingOn: row.waitingOn,
            reviewAt: row.reviewAt,
          }
        : row.nextAction
          ? { nextAction: row.nextAction, dueAt: row.dueAt }
          : {}),
    })),
  };
}
