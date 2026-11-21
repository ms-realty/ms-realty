// C · a home on the client's own Deal (ADR 0015). A broker may add a home the agency holds that
// is not on the public website; its participant reads the same title, text, facts and photos the
// broker sees as "what the public will see" (publishContent in ../publication/attested), only
// for homes on that Deal and only while their participation is live. Nothing internal: no notes,
// no seller, no address beyond the property's approved public precision, and only photos a
// person has already cleared for the public.
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { PublicLocale } from "@/config/tenant";
import { currentPublications, interests, listings, properties, propertyFacts } from "@/db/schema";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { FileDownload } from "../files/download";
import { digestOf, type FileStorage } from "../files/storage";
import {
  latestRevision,
  photoReadiness,
  placedPhotos,
  publishContent,
} from "../publication/attested";
import { publicDestination } from "../publication/presentation";
import { caseFor } from "./shared";

const denied = () => new AppError("not_found");

/** Coarser than settlement precision hides the settlement; finer shows the neighbourhood. */
function publicLocation(property: typeof properties.$inferSelect) {
  const precision = property.publicPrecision;
  return {
    region: property.region,
    settlement: precision === "region" ? null : property.settlement,
    neighborhood: ["exact", "street", "neighborhood"].includes(precision)
      ? property.neighborhood
      : null,
  };
}

async function source(db: Executor, session: Session, caseId: string, reference: string) {
  const { row, live } = await caseFor(db, session, caseId);
  if (live.account.kind !== "client" || !["buyer", "tenant"].includes(row.kind)) throw denied();
  const [home] = await db
    .select({ listing: listings, property: properties })
    .from(interests)
    .innerJoin(listings, eq(listings.id, interests.listingId))
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(
      and(eq(interests.caseId, row.id), eq(listings.reference, reference.trim().toUpperCase())),
    );
  if (!home) throw denied();
  const revision = await latestRevision(db, home.listing.id);
  const facts = revision
    ? await db
        .select()
        .from(propertyFacts)
        .where(eq(propertyFacts.factRevisionId, revision.factRevisionId))
    : [];
  const content = publishContent(home.listing, home.property, revision, facts);
  const photos = (await placedPhotos(db, home.listing, revision, content.pendingDraft))
    .map(({ asset }) => asset)
    .filter((asset) => photoReadiness(asset) === "shown" && asset.derivativeKey);
  return { row, home, content, photos };
}

/** The private page of one home on the reader's Deal. Not found for anyone else. */
export async function readDealHome(
  db: Executor,
  session: Session,
  caseId: string,
  reference: string,
  /** The reader's language: the page links to the public listing only when it is live in it. */
  locale: PublicLocale,
) {
  const { row, home, content, photos } = await source(db, session, caseId, reference);
  const published = (await publishedIn(db, [home.listing.id], locale)).has(home.listing.id);
  return {
    published,
    caseId: row.id,
    caseReference: row.reference,
    reference: home.listing.reference,
    purpose: home.listing.purpose,
    commercialState: home.listing.commercialState,
    title: content.title,
    description: content.description,
    price: content.price,
    rentAmount: content.rentAmount,
    area: content.area,
    bedrooms: content.bedrooms,
    location: publicLocation(home.property),
    photos: photos.map((asset) => ({
      id: asset.id,
      digest: asset.derivativeSha256 ?? "",
      alt: asset.altText ?? home.listing.reference,
      caption: asset.caption,
    })),
  };
}
export type DealHome = Awaited<ReturnType<typeof readDealHome>>;

/** One cleared photo of a home on the reader's Deal, as its safe derivative. */
export async function dealHomeMedia(
  db: Executor,
  storage: FileStorage,
  session: Session,
  caseId: string,
  reference: string,
  assetId: string,
): Promise<FileDownload> {
  const { home, photos } = await source(db, session, caseId, reference);
  const asset = photos.find((photo) => photo.id === assetId);
  if (!asset?.derivativeKey || !asset.derivativeSha256) throw denied();
  const bytes = await storage.read(asset.derivativeKey);
  if (digestOf(bytes) !== asset.derivativeSha256) throw denied();
  await recordAudit(db, {
    actor: session.actor,
    action: "case.deal_home.media_read",
    recordType: "media",
    recordId: assetId,
    capability: "portal.case.read",
    payload: { caseId, listingId: home.listing.id, rendition: "safe_derivative" },
  });
  return {
    bytes,
    contentType: "image/webp",
    fileName: `${home.listing.reference}.webp`,
    inline: true,
  };
}

/** Which of these listings are live on the public website in a locale. */
export async function publishedIn(
  db: Executor,
  listingIds: readonly string[],
  locale: PublicLocale,
): Promise<Set<string>> {
  if (!listingIds.length) return new Set();
  const rows = await db
    .select({ listingId: currentPublications.listingId })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .where(
      and(
        inArray(currentPublications.listingId, [...listingIds]),
        eq(currentPublications.locale, locale),
        eq(currentPublications.destination, publicDestination),
        eq(currentPublications.state, "active"),
        eq(currentPublications.generation, listings.publicationGeneration),
      ),
    );
  return new Set(rows.map((row) => row.listingId));
}
