// O10 staff inventory. Apply current listing.read scopes before search, counts or paging.
// These internal projections confer no approval, publication or translation indexability.
import "server-only";
import { and, desc, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  listingRevisions,
  listings,
  localizedRevisions,
  properties,
  propertyFacts,
} from "@/db/schema";
import {
  type Actor,
  type Capability,
  type CapabilityGrant,
  hasCapability,
} from "@/domain/capabilities";
import { listingPurposes, propertyTypes } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { resolveGrants } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { draftSchema } from "./contracts";
import { type WorkingDraft, workingDraftFrom } from "./working-draft";

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  purpose: z.enum(listingPurposes).optional(),
  type: z.enum(propertyTypes).optional(),
  view: z.enum(["all", "needs", "mine"]).default("all"),
  cursor: z.string().min(1).max(1024).optional(),
  pageSize: z.int().min(1).max(100).default(50),
});
export type InventoryListQuery = z.input<typeof querySchema>;

const positionSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    filter: z.string(),
  })
  .strict();
type Position = z.infer<typeof positionSchema>;

type Listing = typeof listings.$inferSelect;
type Property = typeof properties.$inferSelect;
type SourceRevision = typeof listingRevisions.$inferSelect;
type SourceFact = typeof propertyFacts.$inferSelect;
type Translation = Pick<
  typeof localizedRevisions.$inferSelect,
  "id" | "locale" | "sourceRevisionId" | "state"
>;

export type InventoryListingAction = "changes" | "review" | "facts" | "availability";
export type InventoryAction =
  | { readonly kind: InventoryListingAction }
  | {
      readonly kind: "translation_review";
      readonly locale: PublicLocale;
      readonly sourceRevisionId: string;
      readonly translationId: string;
      readonly canReview: boolean;
    };

export interface InventoryListRow {
  readonly listing: Listing;
  readonly property: Property;
  /** Recorded working title, or the latest immutable BG source title for draft-empty imports. */
  readonly title: string | null;
  readonly sourceRevision: SourceRevision | null;
  /** Exact rows belonging to sourceRevision.factRevisionId, never a different property revision. */
  readonly facts: readonly SourceFact[];
  readonly workingDraft: WorkingDraft;
  readonly draftOrigin: "working_draft" | "source_revision" | "none";
  /** O15 accepts this approved source, which may differ from the latest editorial candidate. */
  readonly translationSourceRevisionId: string | null;
  /** Only recorded translations bound to the approved O15 source; no missing locales invented. */
  readonly translations: readonly (Translation & {
    readonly canDraft: boolean;
    readonly canReview: boolean;
  })[];
  readonly actions: readonly InventoryAction[];
  readonly needsAction: boolean;
}

export interface InventoryListPage {
  readonly rows: readonly InventoryListRow[];
  /** All readable matches for these filters at this read, including rows before the cursor. */
  readonly total: number;
  readonly nextCursor: string | null;
}

const sourceRevision = alias(listingRevisions, "inventory_source_revision");
const latestSource = and(
  eq(sourceRevision.listingId, listings.id),
  sql`${sourceRevision.revisionNumber} = (select max(current_source.revision_number)
    from ${listingRevisions} current_source where current_source.listing_id = ${listings.id})`,
);

// A present working title, including an intentional empty title, takes precedence. Original
// non-BG legacy copy is evidence, never a fallback title for the BG inventory projection.
const displayTitle = sql<string | null>`case
  when jsonb_typeof(${listings.draft}->'title') = 'string'
    then nullif(${listings.draft}->>'title', '')
  when ${sourceRevision.sourceCopy}->>'locale' = 'bg'
    and jsonb_typeof(${sourceRevision.sourceCopy}->'text'->'title') = 'string'
    then nullif(${sourceRevision.sourceCopy}->'text'->>'title', '')
  else null end`;

const listingAction = sql<InventoryListingAction | null>`case
  when ${listings.editorialState} = 'changes_requested' then 'changes'
  when ${listings.editorialState} = 'in_review' then 'review'
  when ${listings.editorialState} = 'needs_facts' then 'facts'
  when ${listings.commercialState} = 'confirmation_required'
    or ${listings.freshnessState} = 'review_due' then 'availability'
  else null end`;

const translationReview = sql`exists (select 1 from ${localizedRevisions}
  where ${localizedRevisions.listingId} = ${listings.id}
    and ${localizedRevisions.sourceRevisionId} = ${listings.approvedRevisionId}
    and ${localizedRevisions.state} = 'reviewing')`;

/** Same listing/property contexts as can(listing.read), using grants resolved once per read. */
function readScope(grants: readonly CapabilityGrant[], now: Date): SQL | undefined {
  const scopes = grants
    .filter((grant) => grant.capability === "listing.read")
    .flatMap(({ scope }): SQL[] => {
      if (scope?.locales) return [];
      if (scope?.expiresAt && Date.parse(scope.expiresAt) <= now.getTime()) return [];
      if (scope?.recordType && !["listing", "property"].includes(scope.recordType)) return [];
      if (!scope?.recordId) return [sql`true`];
      if (scope.recordType === "listing") return [eq(listings.id, scope.recordId)];
      if (scope.recordType === "property") return [eq(listings.propertyId, scope.recordId)];
      return [
        sql`(${listings.id} = ${scope.recordId} or ${listings.propertyId} = ${scope.recordId})`,
      ];
    });
  return or(...scopes);
}

function translationCapability(
  actor: Actor,
  grants: readonly CapabilityGrant[],
  capability: Capability,
  listing: Listing,
  locale: PublicLocale,
  now: Date,
): boolean {
  const clock = now.toISOString();
  return [
    { recordType: "listing", recordId: listing.id, locale, now: clock },
    { recordType: "property", recordId: listing.propertyId, locale, now: clock },
  ].some((context) => hasCapability(actor, grants, capability, context));
}

function parseQuery(input: InventoryListQuery) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation_failed");
  return parsed.data;
}
function decodePosition(cursor: string | undefined, filter: string): Position | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = positionSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    if (parsed.filter === filter) return parsed;
  } catch {
    // Positions grant no authority; malformed or differently filtered positions fail closed.
  }
  throw new AppError("validation_failed");
}

async function readInventory(
  db: Executor,
  actor: Actor,
  input: InventoryListQuery,
  paginated: boolean,
): Promise<InventoryListPage> {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const now = new Date();
  const grants = await resolveGrants(db, actor, now);
  const readable = readScope(grants, now);
  if (!readable) throw new AppError("forbidden");
  // Recheck live authority before accepting even a previously issued cursor.
  const query = parseQuery(input);
  const filter = hashRequest({
    actor,
    q: query.q,
    purpose: query.purpose ?? null,
    type: query.type ?? null,
    view: query.view,
  });
  const position = decodePosition(query.cursor, filter);
  const matches = db.$with("inventory_matches").as(
    db
      .select({
        id: listings.id,
        createdAt: listings.createdAt,
        position:
          sql<string>`to_char(${listings.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
            "position",
          ),
      })
      .from(listings)
      .innerJoin(properties, eq(properties.id, listings.propertyId))
      .leftJoin(sourceRevision, latestSource)
      .where(
        and(
          readable,
          query.purpose ? eq(listings.purpose, query.purpose) : undefined,
          query.type ? eq(properties.propertyType, query.type) : undefined,
          query.view === "mine" ? eq(listings.responsibleBrokerId, actor.id) : undefined,
          query.view === "needs" ? or(isNotNull(listingAction), translationReview) : undefined,
          // strpos performs a literal, case-insensitive substring search; % and _ are text.
          query.q
            ? sql`(strpos(lower(${listings.reference}), lower(${query.q})) > 0
              or strpos(lower(coalesce(${displayTitle}, '')), lower(${query.q})) > 0
              or strpos(lower(${properties.settlement}), lower(${query.q})) > 0)`
            : undefined,
        ),
      ),
  );
  const count = db
    .$with("inventory_count")
    .as(db.select({ total: sql<number>`count(*)::integer`.as("total") }).from(matches));
  const pageQuery = db
    .select({ id: matches.id, createdAt: matches.createdAt, position: matches.position })
    .from(matches)
    .where(
      position
        ? sql`(${matches.createdAt}, ${matches.id}) < (${position.createdAt}::timestamptz, ${position.id}::uuid)`
        : undefined,
    )
    .orderBy(desc(matches.createdAt), desc(matches.id));
  const page = db
    .$with("inventory_page")
    .as(paginated ? pageQuery.limit(query.pageSize + 1) : pageQuery);
  // Count, positions, current source and recorded action states share one PostgreSQL snapshot,
  // even on an empty/later page. Facts loaded below belong to immutable source revisions.
  const fetched = await db
    .with(matches, count, page)
    .select({
      total: count.total,
      listing: listings,
      property: properties,
      sourceRevision,
      title: displayTitle,
      listingAction,
      position: page.position,
      translations: sql<Translation[]>`coalesce((select jsonb_agg(jsonb_build_object(
        'id', ${localizedRevisions.id}, 'locale', ${localizedRevisions.locale},
        'sourceRevisionId', ${localizedRevisions.sourceRevisionId}, 'state', ${localizedRevisions.state}
      ) order by ${localizedRevisions.locale}) from ${localizedRevisions}
        where ${localizedRevisions.listingId} = ${listings.id}
          and ${localizedRevisions.sourceRevisionId} = ${listings.approvedRevisionId}), '[]'::jsonb)`,
    })
    .from(count)
    .leftJoin(page, sql`true`)
    .leftJoin(listings, eq(listings.id, page.id))
    .leftJoin(properties, eq(properties.id, listings.propertyId))
    .leftJoin(sourceRevision, latestSource)
    .orderBy(desc(page.createdAt), desc(page.id));
  const visible = fetched.filter(
    (row): row is typeof row & { listing: Listing; property: Property; position: string } =>
      row.listing !== null && row.property !== null && row.position !== null,
  );
  const selected = paginated ? visible.slice(0, query.pageSize) : visible;
  const factIds = [...new Set(selected.flatMap((row) => row.sourceRevision?.factRevisionId ?? []))];
  const facts = factIds.length
    ? await db.select().from(propertyFacts).where(inArray(propertyFacts.factRevisionId, factIds))
    : [];
  const factsByRevision = new Map<string, SourceFact[]>();
  for (const fact of facts) {
    const rows = factsByRevision.get(fact.factRevisionId) ?? [];
    rows.push(fact);
    factsByRevision.set(fact.factRevisionId, rows);
  }
  const rows: InventoryListRow[] = selected.map((row) => {
    const facts = factsByRevision.get(row.sourceRevision?.factRevisionId ?? "") ?? [];
    const draft = draftSchema.safeParse(row.listing.draft);
    const translations = row.translations.map((translation) => ({
      ...translation,
      canDraft: translationCapability(
        actor,
        grants,
        "translation.draft",
        row.listing,
        translation.locale,
        now,
      ),
      canReview: translationCapability(
        actor,
        grants,
        "translation.review",
        row.listing,
        translation.locale,
        now,
      ),
    }));
    const actions: InventoryAction[] = row.listingAction ? [{ kind: row.listingAction }] : [];
    for (const translation of translations) {
      if (translation.state === "reviewing") {
        actions.push({
          kind: "translation_review",
          locale: translation.locale,
          sourceRevisionId: translation.sourceRevisionId,
          translationId: translation.id,
          canReview: translation.canReview,
        });
      }
    }
    return {
      listing: row.listing,
      property: row.property,
      title: row.title,
      sourceRevision: row.sourceRevision,
      facts,
      workingDraft: draft.success ? draft.data : workingDraftFrom(row.sourceRevision, facts),
      draftOrigin: draft.success
        ? "working_draft"
        : row.sourceRevision
          ? "source_revision"
          : "none",
      translationSourceRevisionId: row.listing.approvedRevisionId,
      translations,
      actions,
      needsAction: actions.length > 0,
    };
  });
  const last = selected.at(-1);
  return {
    rows,
    total: fetched[0]?.total ?? 0,
    nextCursor:
      paginated && visible.length > query.pageSize && last
        ? Buffer.from(
            JSON.stringify({ version: 1, createdAt: last.position, id: last.listing.id, filter }),
          ).toString("base64url")
        : null,
  };
}

/** Stable creation-time/UUID positions survive edits; every page rechecks current authority. */
export function inventoryListPage(
  db: Executor,
  actor: Actor,
  query: InventoryListQuery = {},
): Promise<InventoryListPage> {
  return readInventory(db, actor, query, true);
}

/** Compatibility for O10 callers before binding the paginated contract; no global row cap. */
export async function inventoryList(db: Executor, actor: Actor): Promise<InventoryListRow[]> {
  return [...(await readInventory(db, actor, {}, false)).rows];
}
