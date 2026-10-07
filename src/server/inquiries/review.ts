import "server-only";
import { timingSafeEqual } from "node:crypto";
import { parseContentReference } from "@/domain/inquiry-content";
import { parseComparisonReferences, parseSelectedListingsJson } from "@/domain/inquiry-selection";
import type { InquiryValues } from "@/features/discovery/inquiry-state";
import { viewingPreferencesFromFields } from "@/features/discovery/viewing-fields";
import type { PublicLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import { readApprovedContent } from "../content/public";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { getPublicListing } from "../listings/detail";
import type { ListingCard } from "../listings/view-models";
import { parseInquiry } from "./intake";

export function inquiryPayload(values: InquiryValues, key: string, locale: PublicLocale) {
  const selectedListings = values.selectedListings
    ? parseSelectedListingsJson(values.selectedListings)
    : undefined;
  const comparisonReferences = values.comparisonReferences
    ? parseComparisonReferences(values.comparisonReferences)
    : undefined;
  if (selectedListings === null || comparisonReferences === null)
    throw new AppError("validation_failed", {
      fieldErrors: {
        [selectedListings === null ? "selectedListings" : "comparisonReferences"]: ["invalid"],
      },
    });
  const owner = ["seller_consultation", "landlord_consultation"].includes(values.purpose);
  const contentReference = values.contentReference
    ? parseContentReference(values.contentReference)
    : undefined;
  if (
    contentReference === null ||
    (values.purpose === "service_consultation" && contentReference?.kind !== "service")
  )
    throw new AppError("validation_failed", { fieldErrors: { contentReference: ["invalid"] } });
  return parseInquiry({
    submissionKey: key,
    locale,
    purpose: values.purpose,
    name: values.name,
    contact: { kind: values.contactKind, value: values.contactValue },
    message: values.message,
    callbackWindow: values.callbackWindow,
    privacyNotice: values.privacyNotice === "true",
    listingReference: values.listingReference,
    observedManifestId: values.observedManifestId,
    selectedListings,
    comparisonReferences,
    contentReference,
    ...(values.purpose === "viewing_request"
      ? { viewingPreferences: viewingPreferencesFromFields(values) }
      : {}),
    ...(owner
      ? {
          ownerInput: {
            version: 1,
            provenance: "self_declared",
            locality: values.ownerLocality,
            propertyType: values.ownerPropertyType || undefined,
            transaction: values.ownerTransaction || undefined,
            documentArea: values.ownerDocumentArea,
            relationship: values.ownerRelationship || undefined,
            propertyStatus: values.ownerPropertyStatus,
            documentSource: values.ownerDocumentSource,
          },
        }
      : {}),
  });
}

/** Read-only preflight. Confirmation independently rechecks under the intake transaction locks. */
export async function reviewInquirySources(
  db: Executor,
  input: ReturnType<typeof inquiryPayload>,
  refresh = false,
) {
  const subjects =
    input.selectedListings ??
    (input.listingReference
      ? [{ reference: input.listingReference, observedManifestId: input.observedManifestId }]
      : []);
  const cards: ListingCard[] = [];
  for (const subject of subjects) {
    const result = await getPublicListing(db, {
      reference: subject.reference,
      locale: input.locale,
    });
    if (
      result.status !== "listing" ||
      (!refresh &&
        subject.observedManifestId &&
        result.listing.manifestId !== subject.observedManifestId) ||
      result.listing.availability.primaryAction === "view_similar"
    )
      throw new AppError("version_conflict", { current: { reason: "listing_changed" } });
    const listing = result.listing;
    cards.push({
      reference: listing.reference,
      manifestId: listing.manifestId,
      slug: listing.slug,
      locale: listing.locale,
      purpose: listing.purpose,
      propertyType: listing.propertyType,
      title: listing.title,
      price: listing.price,
      place: listing.place,
      bedrooms: listing.bedrooms,
      area: listing.area,
      availability: listing.availability,
      cover: listing.cover,
    });
  }
  return cards;
}

/** Explicit visitor intent only: never drop, reorder or substitute an unavailable subject. */
export async function refreshInquirySources(
  db: Executor,
  values: InquiryValues,
  key: string,
  locale: PublicLocale,
) {
  const input = inquiryPayload(values, key, locale);
  const listings = await reviewInquirySources(db, input, true);
  const next = { ...values };
  if (input.selectedListings)
    next.selectedListings = JSON.stringify(
      listings.map(({ reference, manifestId }) => ({ reference, observedManifestId: manifestId })),
    );
  else if (input.listingReference && listings[0]) next.observedManifestId = listings[0].manifestId;
  if (input.contentReference) {
    const content = await readApprovedContent(
      db,
      input.contentReference.kind,
      input.contentReference.slug,
      locale,
    );
    if (!content)
      throw new AppError("version_conflict", { current: { reason: "content_changed" } });
    next.contentReference = JSON.stringify({
      ...input.contentReference,
      versionId: content.version.id,
    });
  }
  return next;
}

const lifetimeMs = 30 * 60 * 1000;
const reviewMac = (payload: string) =>
  keyedHash(getEnv().authSecret, `inquiry-review:v1:${payload}`);
const binding = (key: string, locale: PublicLocale, session: string, values: InquiryValues) => ({
  version: 1,
  key,
  locale,
  session: keyedHash(getEnv().authSecret, `inquiry-review-session:${session}`),
  payload: hashRequest(values),
});

/** Token contains only hashes and operation metadata, never the entered personal data. */
export function issueInquiryReview(
  key: string,
  locale: PublicLocale,
  session: string,
  values: InquiryValues,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ ...binding(key, locale, session, values), expiresAt: now + lifetimeMs }),
  ).toString("base64url");
  return `${payload}.${reviewMac(payload)}`;
}

export function validInquiryReview(
  token: unknown,
  key: string,
  locale: PublicLocale,
  session: string,
  values: InquiryValues,
  now = Date.now(),
) {
  if (
    typeof token !== "string" ||
    token.length > 1024 ||
    !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)
  )
    return false;
  const [payload = "", mac = ""] = token.split(".");
  if (!timingSafeEqual(Buffer.from(reviewMac(payload)), Buffer.from(mac))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const expected = binding(key, locale, session, values);
    return (
      Number.isSafeInteger(parsed.expiresAt) &&
      parsed.expiresAt > now &&
      parsed.expiresAt <= now + lifetimeMs &&
      Object.entries(expected).every(([name, value]) => parsed[name] === value)
    );
  } catch {
    return false;
  }
}
