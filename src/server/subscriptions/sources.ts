import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  contactMethods,
  currentPublications,
  documents,
  documentVersions,
  externalActions,
  listings,
  localizedRevisions,
  parties,
  propertyRelationships,
  publicationManifests,
  sellerInstructions,
  subscriptions,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import { publicLocales } from "@/domain/ids";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { consentTerms, eligibleSubscriptionRecipient } from "../privacy/preferences";
import { loadPublishedListings } from "../publication/presentation";
import { type NormalizedSearch, normalizeSearch, searchListings } from "../search/search";
import type { AlertRule } from "./rule";
import {
  type AlertItem,
  alertPayload,
  alertSubjectType,
  listingAlertUrl,
  maxDigestItems,
} from "./template";

/** Only a valid stored normalized snapshot is consumed; no widening of corrupt/unknown filters. */
export function savedSearch(value: unknown): NormalizedSearch | null {
  const shape = z
    .object({
      locale: z.enum(publicLocales),
      criteria: z.record(z.string(), z.unknown()),
      q: z.string().nullable(),
      sort: z.string(),
      pageSize: z.number(),
      cursor: z.string().nullable(),
      consentLocale: z.enum(publicLocales),
    })
    .strict()
    .safeParse(value);
  if (!shape.success) return null;
  const { criteria, ...stored } = shape.data;
  const { includeNeedsConfirmation, ...filters } = criteria;
  try {
    const normalized = normalizeSearch({
      ...filters,
      locale: stored.locale,
      q: stored.q ?? undefined,
      sort: stored.sort,
      pageSize: stored.pageSize,
      includeUnconfirmed: includeNeedsConfirmation,
    });
    if (
      canonicalJson(normalized.criteria) !== canonicalJson(criteria) ||
      normalized.locale !== stored.consentLocale
    )
      return null;
    return normalized;
  } catch {
    return null;
  }
}
export async function lockedRecipient(db: Executor, id: string) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .for("update");
  if (subscription?.purpose !== "search_alerts") return null;
  const [contact] = await db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.id, subscription.contactMethodId))
    .for("share");
  const [party] = await db
    .select({ merged: parties.mergedIntoPartyId })
    .from(parties)
    .where(eq(parties.id, subscription.partyId))
    .for("share");
  if (!contact || !party || party.merged || !z.email().safeParse(contact.value).success)
    return null;
  const recipient = await eligibleSubscriptionRecipient(db, id, "search_alerts");
  if (!recipient) return null;
  const locale = z.enum(publicLocales).safeParse(subscription.policyVersion.split(":").at(-1));
  if (!locale.success) return null;
  const terms = await consentTerms(db, "search_alerts", locale.data, true);
  if (
    !terms ||
    `${terms.version.id}:${terms.version.number}:${terms.version.contentHash}:${locale.data}` !==
      subscription.policyVersion
  )
    return null;
  const search = savedSearch(subscription.criteria);
  return search ? { subscription, contact, recipient: recipient.recipient, search } : null;
}
export const itemKey = (item: Pick<AlertItem, "listingId" | "listingRevisionId">) =>
  `${item.listingId}:${item.listingRevisionId}`;

async function notified(db: Executor, subscriptionId: string, ids: string[]) {
  // Read only history containing this page's candidates. Unknown/attempting/failed effects
  // remain reserved; only an explicitly cancelled pre-send action releases its candidates.
  const rows = await db
    .select({ payload: externalActions.payload, payloadDigest: externalActions.payloadDigest })
    .from(externalActions)
    .where(
      and(
        eq(externalActions.subjectType, alertSubjectType),
        eq(externalActions.subjectId, subscriptionId),
        sql`${externalActions.state} <> 'cancelled'`,
        sql`exists (select 1 from jsonb_array_elements(coalesce(${externalActions.payload} #> '{params,digest,items}', '[]'::jsonb)) item where item->>'listingId' in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)))`,
      ),
    );
  return new Set(
    rows.flatMap(({ payload, payloadDigest }) => {
      const parsed = alertPayload.safeParse(payload);
      return parsed.success && payloadDigest === hashRequest(payload)
        ? parsed.data.params.digest.items.map(itemKey)
        : ids.map((id) => `${id}:*`);
    }),
  );
}
const maxScanPages = 100;
/** Parameterized public search is the only match authority, including unknown-value policy. */
export async function matchingItems(
  db: Executor,
  search: NormalizedSearch,
  rule: AlertRule,
  now: Date,
  options: { subscriptionId?: string; wanted?: readonly AlertItem[] } = {},
) {
  const { includeNeedsConfirmation, ...criteria } = search.criteria;
  const items: AlertItem[] = [];
  let cursor: string | null = null;
  let incomplete = false;
  for (let page = 0; page < maxScanPages; page += 1) {
    const result = await searchListings(
      db,
      {
        ...criteria,
        locale: search.locale,
        q: search.q ?? undefined,
        sort: search.sort,
        includeUnconfirmed: includeNeedsConfirmation,
        pageSize: 60,
        ...(cursor ? { cursor } : {}),
      },
      { now },
    );
    const candidates = options.wanted
      ? result.items.filter((item) =>
          options.wanted?.some((wanted) => wanted.reference === item.reference),
        )
      : [...result.items];
    const published = await loadPublishedListings(
      db,
      { references: candidates.map((item) => item.reference) },
      search.locale,
    );
    const prior = options.subscriptionId
      ? await notified(
          db,
          options.subscriptionId,
          published.map((item) => item.listingId),
        )
      : new Set<string>();
    for (const item of candidates) {
      const source = published.find(
        (value) => value.reference === item.reference && value.manifestId === item.manifestId,
      );
      if (!source) continue;
      const candidate: AlertItem = {
        listingId: source.listingId,
        listingRevisionId: source.listingRevisionId,
        manifestId: item.manifestId,
        reference: item.reference,
        title: item.title,
        sourceUrl: listingAlertUrl(rule.publicOrigin, search.locale, item.reference),
        match: item.match,
        unconfirmed: [...item.unconfirmed],
      };
      if (!prior.has(itemKey(candidate)) && !prior.has(`${candidate.listingId}:*`))
        items.push(candidate);
      if (items.length >= (options.wanted?.length ?? maxDigestItems))
        return {
          items,
          incomplete: Boolean(result.nextCursor) || candidates.at(-1)?.reference !== item.reference,
        };
    }
    cursor = result.nextCursor;
    incomplete ||= result.partial || result.stale;
    if (!cursor) return { items, incomplete };
  }
  return { items, incomplete: true };
}
/** Hold the mutable gates used by public eligibility, never document bodies or private facts. */
export async function lockPublicationSources(db: Executor, items: readonly AlertItem[]) {
  const ids = [...new Set(items.map((item) => item.listingId))].sort();
  const rows = await db
    .select({ id: listings.id, propertyId: listings.propertyId })
    .from(listings)
    .where(inArray(listings.id, ids))
    .orderBy(listings.id)
    .for("share");
  await db
    .select({ id: currentPublications.id })
    .from(currentPublications)
    .where(inArray(currentPublications.listingId, ids))
    .orderBy(currentPublications.id)
    .for("share");
  const manifests = await db
    .select({ localeId: publicationManifests.localizedRevisionId })
    .from(publicationManifests)
    .where(
      inArray(
        publicationManifests.id,
        items.map((item) => item.manifestId),
      ),
    );
  const localizedIds = manifests.flatMap((manifest) =>
    manifest.localeId ? [manifest.localeId] : [],
  );
  if (localizedIds.length)
    await db
      .select({ id: localizedRevisions.id })
      .from(localizedRevisions)
      .where(inArray(localizedRevisions.id, localizedIds))
      .orderBy(localizedRevisions.id)
      .for("share");
  const propertyIds = rows.map((row) => row.propertyId);
  if (!propertyIds.length) return;
  await db
    .select({ id: sellerInstructions.id })
    .from(sellerInstructions)
    .where(inArray(sellerInstructions.listingId, ids))
    .orderBy(sellerInstructions.id)
    .for("share");
  const relations = await db
    .select({ partyId: propertyRelationships.partyId })
    .from(propertyRelationships)
    .where(inArray(propertyRelationships.propertyId, propertyIds))
    .orderBy(propertyRelationships.id)
    .for("share");
  const partyIds = [...new Set(relations.map((row) => row.partyId))].sort();
  if (partyIds.length)
    await db
      .select({ id: parties.id })
      .from(parties)
      .where(inArray(parties.id, partyIds))
      .orderBy(parties.id)
      .for("share");
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.propertyId, propertyIds),
        inArray(documents.purpose, ["seller_authority", "seller_instruction"]),
      ),
    )
    .orderBy(documents.id)
    .for("share");
  if (docs.length)
    await db
      .select({ id: documentVersions.id })
      .from(documentVersions)
      .where(
        inArray(
          documentVersions.documentId,
          docs.map((doc) => doc.id),
        ),
      )
      .orderBy(documentVersions.id)
      .for("share");
}
export const criteriaHash = (criteria: unknown) => hashRequest(criteria);
