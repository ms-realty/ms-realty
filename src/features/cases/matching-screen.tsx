// O07 matching workbench (design/contracts/o07.md, Figma «O07 follow-ups done»). Server reads only:
// `readCaseMatches` for the list, `readCaseCandidate` for one property; the add goes through the
// existing `interest` workflow command and is shown as added only from its readback.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { activityEvents, briefRevisions, listings, principals } from "@/db/schema";
import { displayLocale, isPublicLocale, type PublicLocale } from "@/i18n/config";
import { formatArea, formatMoney } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import { readCaseCandidate, readCaseMatches } from "@/server/cases/matching";
import { readCase } from "@/server/cases/queries";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import type { SearchCriteria } from "@/server/listings/view-models";
import { loadPlaceChains, placeName } from "@/server/publication/presentation";
import { caseMatchCriteriaInput } from "@/server/search/search";
import { buttonClass } from "@/ui/button-class";
import { EmptyState } from "@/ui/empty-state";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { StatusBadge } from "@/ui/status-badge";
import { inventorySections } from "../inventory/decision-contract";
import { privateRead } from "../work/screens";
import { workflowAction } from "./actions";
import { workflowFields, workflowScope } from "./contract";
import { type CheckFrame, MatchAddWorkbench } from "./matching-add";
import {
  addText,
  fill,
  type MatchingCopy,
  matchingCopy,
  zonedDateTime,
  zonedTime,
} from "./matching-copy";
import {
  cardPrice,
  type MatchCard,
  type MatchingPhrases,
  matchingPhrases,
} from "./matching-phrases";
import { encodeMatchReview } from "./matching-review";
import {
  canOfferAdd,
  checkState,
  interestHref,
  isListingReference,
  listState,
  type MatchCurrent,
  type MatchingQuery,
  matchingHref,
  matchPageSize,
  nextProperty,
} from "./matching-view";

type Matches = Awaited<ReturnType<typeof readCaseMatches>>;
type Ready = Extract<Matches, { status: "ready" }>;
type Required = Extract<Matches, { status: "criteria_required" }>;
type Item = Ready["confirmed"][number];
type Candidate = Awaited<ReturnType<typeof readCaseCandidate>>;
type Deal = Awaited<ReturnType<typeof readCase>>;
type Names = { object: string; subject: string; start: string };

/** The page's listing locale: Bulgarian is the source every published listing carries. */
const listingLocale = "bg";
const link = "font-semibold text-accent underline underline-offset-4";
const action = (variant: "primary" | "secondary" | "tertiary") =>
  buttonClass(variant, "max-w-full text-center");

/** Authorization failures read like a missing record: existence is never revealed. */
async function staffRead<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    if (isAppError(error) && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}

function clientNames(c: MatchingCopy, deal: Deal): Names {
  const party =
    deal.participants.find((p) => ["buyer", "co_buyer", "tenant"].includes(p.role)) ??
    deal.participants[0];
  const name = party?.name.trim();
  return name ? { object: name, subject: name, start: name } : c.client;
}

async function placeNames(db: Executor, ids: readonly string[], locale: PublicLocale) {
  const chains = await loadPlaceChains(db, ids);
  const names = new Map<string, string>();
  for (const [id, chain] of chains) {
    const node = chain[0];
    if (node) names.set(id, placeName(node, locale).name);
  }
  return names;
}

/** Staff previews of an approved cover need the same `media.manage` the media route checks. */
async function coverHrefs(db: Executor, session: Session, cards: readonly CoverCard[]) {
  const references = [...new Set(cards.filter((card) => card.cover).map((card) => card.reference))];
  if (!references.length) return new Map<string, string>();
  const rows = await db
    .select({ reference: listings.reference, id: listings.id, propertyId: listings.propertyId })
    .from(listings)
    .where(inArray(listings.reference, references));
  const hrefs = new Map<string, string>();
  for (const row of rows) {
    const cover = cards.find((card) => card.reference === row.reference)?.cover;
    if (
      cover &&
      (await can(db, session.actor, "media.manage", {
        type: "listing",
        id: row.id,
        propertyId: row.propertyId,
      }))
    )
      hrefs.set(row.reference, `/api/files/private/media/${cover.assetId}?preview=1`);
  }
  return hrefs;
}
type CoverCard = { reference: string; cover: { assetId: string; alt: string | null } | null };

function Cover({ href, alt }: { href: string | undefined; alt: string }) {
  return href ? (
    // biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared image optimizers.
    <img
      src={href}
      alt={alt}
      loading="lazy"
      className="aspect-[4/3] w-full max-w-64 rounded-control bg-subtle object-cover"
    />
  ) : (
    <div aria-hidden="true" className="aspect-[4/3] w-full max-w-64 rounded-control bg-subtle" />
  );
}

function cardFacts(locale: string, c: MatchingCopy, card: MatchCard) {
  const pl: PublicLocale = isPublicLocale(locale) ? locale : "en";
  const settlement = card.place.settlement ?? card.place.municipality ?? card.place.district;
  const place = settlement
    ? locale === "en"
      ? settlement.nameLatin
      : settlement.nameNative
    : null;
  const price = cardPrice(card);
  return {
    heading: `${fill(c.row.property, { reference: card.reference })}${price ? ` · ${formatMoney(pl, price.amountMinor, price.currency)}` : ""}`,
    facts: [
      place,
      card.area.state === "known" ? formatArea(pl, card.area.value.value) : null,
      card.bedrooms.state === "known"
        ? fill(c.fact.bedroomsCount(card.bedrooms.value), { count: card.bedrooms.value })
        : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

function PropertyHeader({
  locale,
  c,
  card,
  cover,
  level = 2,
}: {
  locale: string;
  c: MatchingCopy;
  card: MatchCard;
  cover: string | undefined;
  level?: 2 | 3;
}) {
  const { heading, facts } = cardFacts(locale, c, card);
  const Heading = `h${level}` as const;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <Cover href={cover} alt={card.cover?.alt ?? ""} />
      <div className="min-w-0 space-y-1">
        <Heading className="text-subheading font-semibold">
          <bdi>{heading}</bdi>
        </Heading>
        {card.title ? (
          <p lang={listingLocale} dir="auto">
            {card.title}
          </p>
        ) : null}
        {facts.length ? <p className="text-text-muted">{facts.join(" · ")}</p> : null}
      </div>
    </div>
  );
}

/** The frame's next-step line (contract «Next-step line»), as plain text. */
function NextStep({ text }: { text: string | null }) {
  return text ? <p>{text}</p> : null;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>;
}

function Layout({
  locale,
  caseId,
  c,
  title,
  children,
}: {
  locale: string;
  caseId: string;
  c: MatchingCopy;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-6 px-gutter py-6 [overflow-wrap:anywhere] lg:px-gutter-wide">
      <a
        className={`${link} inline-flex min-h-control items-center`}
        href={`/${locale}/cases/${caseId}`}
      >
        {c.backToDeal}
      </a>
      {title ? <h1 className="text-heading font-semibold">{title}</h1> : null}
      {children}
    </div>
  );
}

function RequirementCard({
  locale,
  caseId,
  c,
  names,
  summary,
  acknowledgedAt,
}: {
  locale: string;
  caseId: string;
  c: MatchingCopy;
  names: Names;
  summary: string;
  acknowledgedAt: Date | null;
}) {
  return (
    <section className="min-w-0 space-y-3 rounded-card border border-border bg-surface p-5">
      <h2 className="text-subheading font-semibold">
        {fill(c.wants.heading, { clientSubject: names.subject })}
      </h2>
      <p className="font-semibold">{summary}</p>
      <p className="text-text-muted">
        {acknowledgedAt
          ? fill(c.wants.acknowledged, {
              clientStart: names.start,
              at: zonedDateTime(locale, acknowledgedAt),
            })
          : fill(c.wants.notAcknowledged, { clientStart: names.start })}
      </p>
      <a className={action("tertiary")} href={`/${locale}/cases/${caseId}#case-brief`}>
        {c.wants.open}
      </a>
    </section>
  );
}

/** CRITMISSING / CRITKIND: no list without structured requirements for this deal kind. */
async function CriteriaRequired({
  db,
  locale,
  deal,
  c,
  names,
  read,
}: {
  db: Executor;
  locale: string;
  deal: Deal;
  c: MatchingCopy;
  names: Names;
  read: Required;
}) {
  const briefHref = `/${locale}/cases/${deal.record.id}#case-brief`;
  const dealKind = c.fact.dealKind[deal.record.kind] ?? deal.record.kind;
  if (read.reason === "missing_or_invalid")
    return (
      <>
        <Notice tone="warning" title={c.criteriaRequired.missing.alert} />
        <section className="min-w-0 space-y-2 rounded-card border border-border bg-surface p-5">
          <h2 className="text-subheading font-semibold">
            {c.criteriaRequired.missing.fillHeading}
          </h2>
          <p>{c.criteriaRequired.missing.fillRequired}</p>
          <p>{c.criteriaRequired.missing.fillRecommended}</p>
          <p>{c.criteriaRequired.missing.fillOptional}</p>
        </section>
        <NextStep text={fill(c.next.criteriaMissing, { clientSubject: names.subject })} />
        <Actions>
          {/* ponytail: the staff requirements form (O07REQ*) needs a structured reviseBrief action
              contract first; until then the primary opens the deal's requirements section. */}
          <a className={action("primary")} href={briefHref}>
            {c.criteriaRequired.missing.fill}
          </a>
        </Actions>
      </>
    );
  // kind_mismatch: the recorded requirements parse, but for the other transaction type.
  const [latest] = read.brief
    ? await db
        .select({ criteria: briefRevisions.criteria })
        .from(briefRevisions)
        .where(
          and(
            eq(briefRevisions.caseId, deal.record.id),
            eq(briefRevisions.revisionNumber, read.brief.revision),
          ),
        )
    : [];
  const parsed = caseMatchCriteriaInput.safeParse(latest?.criteria);
  const criteria = parsed.success ? (parsed.data as SearchCriteria) : null;
  const pl: PublicLocale = isPublicLocale(locale) ? locale : "en";
  const names2 = criteria
    ? await placeNames(db, criteria.placeIds ?? [], pl)
    : new Map<string, string>();
  const phrases = criteria ? matchingPhrases(locale, c, criteria, names2) : null;
  const recordedKind = criteria ? (c.fact.purpose[criteria.purpose] ?? criteria.purpose) : "";
  const dealPurpose = deal.record.kind === "tenant" ? "long_term_rent" : "sale";
  const place = criteria?.placeIds?.map((id) => names2.get(id)).find(Boolean);
  return (
    <>
      <Notice
        tone="warning"
        title={fill(c.criteriaRequired.kindMismatch.alert, { recordedKind, dealKind })}
      />
      <section className="min-w-0 space-y-3 rounded-card border border-border bg-surface p-5">
        {phrases ? (
          <p>{fill(c.criteriaRequired.kindMismatch.recorded, { summary: phrases.summary() })}</p>
        ) : null}
        <p>
          {place
            ? fill(c.criteriaRequired.kindMismatch.dealInPlace, {
                dealKind: c.fact.purpose[dealPurpose] ?? dealKind,
                place,
              })
            : fill(c.criteriaRequired.kindMismatch.deal, {
                dealKind: c.fact.purpose[dealPurpose] ?? dealKind,
              })}
        </p>
        <a className={action("primary")} href={briefHref}>
          {c.wants.open}
        </a>
      </section>
      <NextStep
        text={fill(c.next.criteriaKind, {
          recordedKind,
          dealKind: c.fact.purpose[dealPurpose] ?? dealKind,
        })}
      />
    </>
  );
}

function verdictBadges(
  c: MatchingCopy,
  match: "match" | "needs_confirmation" | "no_match",
  onList: boolean,
) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <StatusBadge
        family="delivery"
        tone={
          match === "match" ? "positive" : match === "needs_confirmation" ? "attention" : "negative"
        }
        label={
          match === "match"
            ? c.row.match
            : match === "needs_confirmation"
              ? c.row.needs
              : c.row.noMatch
        }
      />
      {onList ? <StatusBadge family="approval" tone="info" label={c.row.onList} /> : null}
    </div>
  );
}

function MatchRow({
  locale,
  caseId,
  c,
  phrases,
  item,
  group,
  cover,
  primary,
  checkHref,
}: {
  locale: string;
  caseId: string;
  c: MatchingCopy;
  phrases: MatchingPhrases;
  item: Item;
  group: "match" | "needs";
  cover: string | undefined;
  primary: boolean;
  checkHref: string;
}) {
  const available = phrases.availability(item);
  const reference = item.reference;
  return (
    <li
      id={`match-${reference}`}
      className="grid min-w-0 grid-cols-1 gap-4 py-5 sm:grid-cols-[8rem_minmax(0,1fr)]"
    >
      <Cover href={cover} alt={item.cover?.alt ?? ""} />
      <div className="min-w-0 space-y-2">
        <PropertyHeaderText locale={locale} c={c} card={item} />
        {verdictBadges(
          c,
          group === "match" ? "match" : "needs_confirmation",
          Boolean(item.existingInterestId),
        )}
        {item.unconfirmed.length ? (
          <p className="font-semibold">
            {fill(c.row.unknown, {
              facts: item.unconfirmed.map((key) => phrases.name(key)).join(", "),
            })}
          </p>
        ) : null}
        {available ? <p>{available}</p> : null}
        <Actions>
          {item.existingInterestId ? (
            <a
              className={action("tertiary")}
              href={interestHref(locale, caseId, item.existingInterestId)}
            >
              {fill(c.row.openInDeal, { reference })}
            </a>
          ) : (
            <a className={action(primary ? "primary" : "secondary")} href={checkHref}>
              {fill(group === "match" ? c.row.checkAndAdd : c.row.check, { reference })}
            </a>
          )}
        </Actions>
      </div>
    </li>
  );
}

function PropertyHeaderText({
  locale,
  c,
  card,
}: {
  locale: string;
  c: MatchingCopy;
  card: MatchCard;
}) {
  const { heading, facts } = cardFacts(locale, c, card);
  return (
    <>
      <h3 className="font-semibold">
        <bdi>{heading}</bdi>
      </h3>
      {card.title ? (
        <p lang={listingLocale} dir="auto">
          {card.title}
        </p>
      ) : null}
      {facts.length ? <p className="text-text-muted">{facts.join(" · ")}</p> : null}
    </>
  );
}

async function readPages(
  db: Executor,
  session: Session,
  id: string,
  query: MatchingQuery,
): Promise<
  { kind: "stale" } | { kind: "criteria"; read: Required } | { kind: "ready"; pages: Ready[] }
> {
  try {
    const first = await staffRead(() =>
      readCaseMatches(db, session, {
        id,
        locale: listingLocale,
        pageSize: matchPageSize,
        ...(query.revision ? { briefRevision: query.revision } : {}),
      }),
    );
    if (first.status !== "ready") return { kind: "criteria", read: first };
    const pages: Ready[] = [first];
    // «Покажете още» appends each next page with its cursor, bound to the same revision.
    for (const cursor of query.more) {
      const page = await staffRead(() =>
        readCaseMatches(db, session, {
          id,
          locale: listingLocale,
          pageSize: matchPageSize,
          cursor,
          briefRevision: first.brief.revision,
        }),
      );
      if (page.status !== "ready") return { kind: "stale" };
      pages.push(page);
    }
    return { kind: "ready", pages };
  } catch (error) {
    if (isAppError(error) && ["version_conflict", "validation_failed"].includes(error.code))
      return { kind: "stale" };
    throw error;
  }
}

async function ListView({
  db,
  session,
  locale,
  deal,
  c,
  names,
  query,
}: {
  db: Executor;
  session: Session;
  locale: string;
  deal: Deal;
  c: MatchingCopy;
  names: Names;
  query: MatchingQuery;
}) {
  const id = deal.record.id;
  const pl: PublicLocale = isPublicLocale(locale) ? locale : "en";
  const refresh = matchingHref(locale, id);
  const staleWarning = (at: string | undefined) =>
    at ? fill(c.stale.alert, { at: zonedTime(locale, at) }) : c.stale.alertSince;
  const read = await readPages(db, session, id, query);
  if (read.kind === "stale")
    // O07STALE: the requirements changed since this list was read (or its cursor no longer
    // belongs to this query). Offer a refresh of the first page, never a snapshot.
    return (
      <Layout locale={locale} caseId={id} c={c} title={fill(c.title, { client: names.object })}>
        <Notice tone="warning" title={staleWarning(query.at)} />
        <NextStep text={c.next.stale} />
        <Actions>
          <a className={action("primary")} href={refresh}>
            {c.stale.refresh}
          </a>
        </Actions>
      </Layout>
    );
  const title = fill(c.title, { client: names.object });
  if (read.kind === "criteria")
    return (
      <Layout locale={locale} caseId={id} c={c} title={title}>
        <CriteriaRequired
          db={db}
          locale={locale}
          deal={deal}
          c={c}
          names={names}
          read={read.read}
        />
      </Layout>
    );
  const pages = read.pages;
  const [first] = pages;
  if (!first) notFound();

  const seen = new Set<string>();
  const unique = (items: readonly Item[]) =>
    items.filter((item) => !seen.has(item.reference) && seen.add(item.reference));
  const confirmed = pages.flatMap((page) => unique(page.confirmed));
  const needs = pages.flatMap((page) => unique(page.needsConfirmation));
  const last = pages.at(-1) ?? first;
  const stale = pages.some((page) => page.stale);
  const state = listState({ status: "ready", confirmed, needsConfirmation: needs, stale });
  const phrases = matchingPhrases(
    locale,
    c,
    first.criteria,
    await placeNames(db, first.criteria.placeIds ?? [], pl),
  );
  const covers = await coverHrefs(db, session, [...confirmed, ...needs]);
  const at = query.at ?? first.sourceTimestamp;
  const keep = { revision: first.brief.revision, at };
  const checkHref = (reference: string) =>
    matchingHref(locale, id, { ...keep, property: reference });
  const next = nextProperty({ confirmed, needsConfirmation: needs });
  const shown = confirmed.length + needs.length;

  const requirements = (
    <RequirementCard
      locale={locale}
      caseId={id}
      c={c}
      names={names}
      summary={phrases.summary()}
      acknowledgedAt={first.brief.clientAcknowledgedAt}
    />
  );
  if (state === "empty")
    return (
      <Layout locale={locale} caseId={id} c={c} title={title}>
        {requirements}
        <EmptyState
          kind="filtered"
          title={c.empty.title}
          action={
            <a className={action("primary")} href={`/${locale}/cases/${id}#case-conversation`}>
              {fill(c.empty.ask, { client: names.object })}
            </a>
          }
        >
          <p>{fill(c.empty.body, { at: zonedTime(locale, first.sourceTimestamp) })}</p>
        </EmptyState>
        <NextStep text={fill(c.next.empty, { client: names.object })} />
      </Layout>
    );

  const primary =
    state === "stale"
      ? null
      : (confirmed.find((item) => !item.existingInterestId) ??
        needs.find((item) => !item.existingInterestId) ??
        null);
  const group = (heading: string, items: readonly Item[], kind: "match" | "needs") =>
    items.length ? (
      <section className="min-w-0 space-y-1">
        <h2 className="text-subheading font-semibold">{heading}</h2>
        <ul className="min-w-0 divide-y divide-divider">
          {items.map((item) => (
            <MatchRow
              key={item.reference}
              locale={locale}
              caseId={id}
              c={c}
              phrases={phrases}
              item={item}
              group={kind}
              cover={covers.get(item.reference)}
              primary={primary?.reference === item.reference}
              checkHref={checkHref(item.reference)}
            />
          ))}
        </ul>
      </section>
    ) : null;
  const count =
    first.count.type === "estimated"
      ? fill(c.list.countEstimated, { count: first.count.value })
      : fill(c.list.count(first.count.value), { count: first.count.value });
  const nextLine =
    state === "stale"
      ? c.next.stale
      : !next
        ? c.next.allOnList
        : state === "ready" && confirmed.some((item) => item.reference === next.reference)
          ? fill(c.next.ready, { reference: next.reference, clientSubject: names.subject })
          : fill(c.next.needs, { reference: next.reference });
  return (
    <Layout locale={locale} caseId={id} c={c} title={title}>
      {state === "stale" ? <Notice tone="warning" title={staleWarning(at)} /> : null}
      {requirements}
      <div className="space-y-1">
        <p className="font-semibold">
          {count} · {fill(c.list.shown, { shown })}
        </p>
        <p className="text-text-muted">
          {fill(c.list.checkedAt, { at: zonedTime(locale, first.sourceTimestamp) })}
          {state === "stale" ? ` ${c.stale.mayHaveChanged}` : null}
        </p>
      </div>
      {state === "needsConfirmation" ? (
        <>
          <Notice
            tone="warning"
            title={fill(c.needs.alert(needs.length), { count: needs.length })}
          />
          <section className="min-w-0 space-y-2 rounded-card border border-border bg-surface p-5">
            <h2 className="text-subheading font-semibold">{c.needs.howHeading}</h2>
            {c.needs.how.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        </>
      ) : null}
      {group(fill(c.list.groupMatch, { count: confirmed.length }), confirmed, "match")}
      {group(fill(c.list.groupNeeds, { count: needs.length }), needs, "needs")}
      <NextStep text={nextLine} />
      <Actions>
        {state === "stale" ? (
          <a className={action("primary")} href={refresh}>
            {c.stale.refresh}
          </a>
        ) : last.nextCursor ? (
          <a
            className={action("secondary")}
            href={matchingHref(locale, id, { ...keep, more: [...query.more, last.nextCursor] })}
          >
            {c.list.more}
          </a>
        ) : (
          <p>{c.list.end}</p>
        )}
      </Actions>
    </Layout>
  );
}

/** Who recorded the saved property and when, from its own `case.interest_added` event. */
async function recordedBy(db: Executor, caseId: string, interestId: string) {
  const [event] = await db
    .select({ name: principals.displayName })
    .from(activityEvents)
    .leftJoin(principals, sql`${principals.id}::text = ${activityEvents.actorId}`)
    .where(
      and(
        eq(activityEvents.recordType, "case"),
        eq(activityEvents.recordId, caseId),
        eq(activityEvents.messageKey, "case.interest_added"),
        sql`${activityEvents.params}->>'interestId' = ${interestId}`,
      ),
    )
    .orderBy(desc(activityEvents.occurredAt))
    .limit(1);
  return event?.name ?? null;
}

async function CheckView({
  db,
  session,
  locale,
  deal,
  c,
  names,
  query,
  reference,
}: {
  db: Executor;
  session: Session;
  locale: string;
  deal: Deal;
  c: MatchingCopy;
  names: Names;
  query: MatchingQuery;
  reference: string;
}) {
  const id = deal.record.id;
  const pl: PublicLocale = isPublicLocale(locale) ? locale : "en";
  // The current first page: what the client wants now, its revision and the next property.
  const list = await staffRead(() =>
    readCaseMatches(db, session, { id, locale: listingLocale, pageSize: matchPageSize }),
  );
  if (list.status === "criteria_required")
    return (
      <Layout locale={locale} caseId={id} c={c} title={fill(c.title, { client: names.object })}>
        <CriteriaRequired db={db} locale={locale} deal={deal} c={c} names={names} read={list} />
      </Layout>
    );
  const revision = list.brief.revision;
  const keep = { revision, at: list.sourceTimestamp };
  const listHref = matchingHref(locale, id, keep);
  const title = fill(c.check.title, { reference, client: names.object });
  let candidate: Candidate | null = null;
  let failure: "unavailable" | "not_found" | "stale" | null = null;
  if (!isListingReference(reference)) failure = "not_found";
  else
    try {
      candidate = await readCaseCandidate(db, session, {
        id,
        reference,
        locale: listingLocale,
        briefRevision: revision,
      });
    } catch (error) {
      if (!isAppError(error)) throw error;
      if (error.code === "listing_unavailable") failure = "unavailable";
      else if (error.code === "version_conflict") failure = "stale";
      else if (["not_found", "forbidden", "validation_failed"].includes(error.code))
        failure = "not_found";
      else throw error;
    }
  const state = checkState(
    candidate
      ? {
          kind: "candidate",
          match: candidate.match,
          existingInterestId: candidate.existingInterestId,
          availability: candidate.candidate.availability.presented,
        }
      : { kind: failure ?? "not_found" },
  );
  const phrases = matchingPhrases(
    locale,
    c,
    list.criteria,
    await placeNames(db, list.criteria.placeIds ?? [], pl),
  );
  const card = candidate?.candidate;
  const cover = card ? (await coverHrefs(db, session, [card])).get(card.reference) : undefined;
  const header = card ? <PropertyHeader locale={locale} c={c} card={card} cover={cover} /> : null;
  const back = (variant: "primary" | "secondary") => (
    <a className={action(variant)} href={listHref}>
      {c.check.backToList}
    </a>
  );
  const active = deal.record.disposition === "active";
  const permitted = deal.canAddInterest && active;

  const fresh: CheckFrame = (() => {
    if (!candidate || !card) {
      if (state === "stale")
        return {
          title,
          body: <Notice tone="warning" title={c.stale.alertSince} />,
          actions: (
            <a className={action("primary")} href={matchingHref(locale, id)}>
              {c.stale.refresh}
            </a>
          ),
          next: c.next.stale,
          canAdd: false,
        };
      return state === "unavailable"
        ? {
            title,
            body: (
              <>
                <StatusBadge family="delivery" tone="negative" label={c.add.notAdded} />
                <Notice tone="warning" title={c.add.unavailableAlert} />
              </>
            ),
            actions: back("primary"),
            next: c.next.unavailable,
            canAdd: false,
          }
        : {
            title: c.add.notFoundTitle,
            body: (
              <>
                <StatusBadge family="delivery" tone="negative" label={c.add.nothingAdded} />
                <Notice tone="warning" title={c.add.notFoundAlert} />
              </>
            ),
            actions: back("primary"),
            next: c.next.notFound,
            canAdd: false,
          };
    }
    const onList = Boolean(candidate.existingInterestId);
    const available = phrases.availability({
      confirmedCriteria: candidate.confirmedCriteria,
      availability: card.availability,
    });
    const badges = verdictBadges(c, candidate.match, onList);
    const unknown = candidate.unconfirmed;
    const confirmFact = phrases.definites(unknown);
    const inventoryHref = `/${locale}/inventory/${reference}${
      unknown.includes("availability") ? `#${inventorySections.readiness}` : ""
    }`;
    const violations = candidate.violated;
    const body = (
      <>
        {header}
        {badges}
        {candidate.match === "no_match" ? (
          <>
            <Notice tone="error" title={c.check.noMatchHeading}>
              <ul className="space-y-1">
                {violations.map((key) => (
                  <li key={key}>{phrases.violation(key, card)}</li>
                ))}
              </ul>
              <p className="mt-2">
                {fill(c.check.noMatchNotChecked(violations.length), {
                  fact: phrases.definites(violations, true),
                })}
              </p>
            </Notice>
            <Notice
              tone="info"
              title={fill(c.check.alternativeUnavailable, { clientSubject: names.subject })}
            />
          </>
        ) : null}
        {candidate.match === "needs_confirmation" ? (
          <Notice tone="warning" title={c.check.needsHeading}>
            <ul className="space-y-1">
              {unknown.map((key) => (
                <li key={key}>{phrases.unknownLine(key)}</li>
              ))}
            </ul>
            {available ? <p className="mt-2">{available}</p> : null}
            <p className="mt-2">
              {unknown.length === 1 && unknown[0] === "availability"
                ? c.check.needsAddAfterAvailability
                : fill(c.check.needsAddAfter, { fact: confirmFact })}
            </p>
          </Notice>
        ) : null}
        {candidate.match === "match" ? (
          <div className="space-y-1">
            {available ? <p className="font-semibold">{available}</p> : null}
            {candidate.candidate.availability.presented === "negotiating" ? (
              <p>{fill(c.availability.negotiatingNote, { client: names.object })}</p>
            ) : null}
            {candidate.candidate.availability.presented === "reserved_with_recorded_basis" ? (
              <p>{c.availability.reservedNote}</p>
            ) : null}
            {unknown.length === 0 ? <p>{c.check.nothingToConfirm}</p> : null}
          </div>
        ) : null}
        {onList ? <p>{c.check.onListNote}</p> : null}
      </>
    );
    if (onList)
      return {
        title,
        body,
        actions: (
          <>
            <a
              className={action("primary")}
              href={interestHref(locale, id, candidate.existingInterestId ?? "")}
            >
              {fill(c.row.openInDeal, { reference })}
            </a>
            {back("secondary")}
          </>
        ),
        next: fill(c.next.onList, { reference, clientSubject: names.subject }),
        canAdd: false,
      };
    if (candidate.match === "no_match")
      return {
        title,
        body,
        actions: (
          <>
            {back("primary")}
            <a className={action("tertiary")} href={`/${locale}/cases/${id}#case-brief`}>
              {c.wants.open}
            </a>
          </>
        ),
        next: fill(c.next.checkNoMatch, { reference, fact: phrases.definites(violations) }),
        canAdd: false,
      };
    if (candidate.match === "needs_confirmation")
      return {
        title,
        body,
        actions: (
          <>
            <a className={action("primary")} href={inventoryHref}>
              {fill(c.check.needsConfirm, { fact: confirmFact })}
            </a>
            {back("secondary")}
          </>
        ),
        next:
          unknown.length === 1 && unknown[0] === "availability"
            ? fill(c.next.checkNeedsAvailability, { reference })
            : fill(c.next.checkNeeds, { reference, fact: confirmFact }),
        canAdd: false,
      };
    const canAdd = canOfferAdd(state, permitted);
    return {
      title,
      body,
      actions: back(canAdd ? "secondary" : "primary"),
      next: !active
        ? c.next.dealInactive
        : !canAdd
          ? null
          : state === "checkNegotiating"
            ? fill(c.next.checkNegotiating, { reference, client: names.object })
            : state === "checkReserved"
              ? fill(c.next.checkReserved, { reference })
              : fill(c.next.checkMatch, { reference }),
      canAdd,
    };
  })();

  // A link from an older list names an older revision: O07STALE, until a fresh list is opened.
  const staleFrame: CheckFrame | null =
    query.revision !== undefined && query.revision !== revision
      ? {
          title,
          body: (
            <Notice
              tone="warning"
              title={
                query.at
                  ? fill(c.stale.alert, { at: zonedTime(locale, query.at) })
                  : c.stale.alertSince
              }
            />
          ),
          actions: (
            <a className={action("primary")} href={matchingHref(locale, id)}>
              {c.stale.refresh}
            </a>
          ),
          next: c.next.stale,
          canAdd: false,
        }
      : null;

  const scope = workflowScope("interest", id);
  const initial = initialFormState(
    scope,
    Object.fromEntries(
      workflowFields.interest.map((name) => [
        name,
        name === "reference"
          ? reference
          : name === "matchReview" && candidate
            ? encodeMatchReview(candidate)
            : "",
      ]),
    ),
    candidate?.caseVersion ?? deal.record.version,
  );
  const next = nextProperty(list, reference);
  const current: MatchCurrent | null = candidate
    ? {
        briefRevision: candidate.briefRevision,
        manifestId: candidate.candidate.manifestId,
        availability: candidate.candidate.availability.presented,
        violated: candidate.violated,
        unconfirmed: candidate.unconfirmed,
      }
    : { briefRevision: revision };
  const price = card ? cardPrice(card) : null;
  const permalink = matchingHref(locale, id, {
    property: reference,
    ...(query.revision ? { revision: query.revision } : {}),
    ...(query.at ? { at: query.at } : {}),
  });
  return (
    <Layout locale={locale} caseId={id} c={c}>
      <MatchAddWorkbench
        action={workflowAction.bind(null, "staff", locale, "interest", id)}
        initialState={initial}
        permalink={permalink}
        nativeIdentity={`${scope}:${reference}`}
        renderId={randomUUID()}
        recheckHref={matchingHref(locale, id, { ...keep, property: reference })}
        localeTag={isPublicLocale(locale) ? displayLocale(locale) : "en-GB"}
        reference={reference}
        fresh={fresh}
        stale={staleFrame}
        header={header}
        current={current}
        listHref={listHref}
        added={{
          property: [
            fill(c.row.property, { reference }),
            card?.title ?? null,
            price ? formatMoney(pl, price.amountMinor, price.currency) : null,
          ]
            .filter(Boolean)
            .join(" · "),
          dealHref: candidate?.existingInterestId
            ? interestHref(locale, id, candidate.existingInterestId)
            : `/${locale}/cases/${id}`,
          recordedBy: candidate?.existingInterestId
            ? await recordedBy(db, id, candidate.existingInterestId)
            : null,
          next: next
            ? {
                href: matchingHref(locale, id, { ...keep, property: next.reference }),
                label: fill(c.row.check, { reference: next.reference }),
                line: next.unconfirmed.length
                  ? fill(c.next.addedNeeds, {
                      reference: next.reference,
                      fact: phrases.definites(next.unconfirmed, true),
                    })
                  : fill(c.next.addedMatch, { reference: next.reference }),
              }
            : null,
        }}
        text={addText(c, names, reference)}
      />
    </Layout>
  );
}

/** O07 for one buyer/tenant deal: the list, or one property's check when `property` is set. */
export async function CaseMatchingScreen({
  locale,
  session,
  id,
  query,
}: {
  locale: string;
  session: Session;
  id: string;
  query: MatchingQuery;
}) {
  const db = getDb();
  const deal = await privateRead(() => readCase(db, session, id));
  if (session.account.kind !== "staff" || !["buyer", "tenant"].includes(deal.record.kind))
    notFound();
  const c = matchingCopy(locale);
  const names = clientNames(c, deal);
  return query.property ? (
    <CheckView
      db={db}
      session={session}
      locale={locale}
      deal={deal}
      c={c}
      names={names}
      query={query}
      reference={query.property}
    />
  ) : (
    <ListView
      db={db}
      session={session}
      locale={locale}
      deal={deal}
      c={c}
      names={names}
      query={query}
    />
  );
}
