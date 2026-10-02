// The same live consent predicate gates activation, public search/counts and detail reads.
import "server-only";
import { and, eq, isNull, or, type SQLWrapper, sql } from "drizzle-orm";
import { sellerInstructions } from "@/db/schema";

export function currentSellerEvidence(
  now: Date = new Date(),
  listingId: string | SQLWrapper = sellerInstructions.listingId,
) {
  const at = now.toISOString();
  return and(
    eq(sellerInstructions.state, "agreed"),
    eq(sellerInstructions.publicationPermission, true),
    sql`${sellerInstructions.mediaUsageRights}->'granted' = 'true'::jsonb`,
    isNull(sellerInstructions.invalidatedAt),
    sql`${sellerInstructions.agreedAt} <= ${at}::timestamptz`,
    or(
      isNull(sellerInstructions.expiresAt),
      sql`${sellerInstructions.expiresAt} > ${at}::timestamptz`,
    ),
    // Consent belongs to one listing/property/purpose. A later recorded agreement remains
    // authoritative after expiry or withdrawal: falling back would resurrect old permission.
    // A property-wide instruction for letting does not replace a sale instruction, while an
    // explicitly listing-scoped replacement always takes precedence for that listing.
    sql`exists (
      select 1 from listings consent_listing
      where consent_listing.id = ${listingId}
        and consent_listing.property_id = ${sellerInstructions.propertyId}
        and (${sellerInstructions.listingId} is null or ${sellerInstructions.listingId} = consent_listing.id)
        and (${sellerInstructions.representationScope} = 'sale_and_letting'
          or (consent_listing.purpose = 'sale' and ${sellerInstructions.representationScope} = 'sale')
          or (consent_listing.purpose = 'long_term_rent' and ${sellerInstructions.representationScope} = 'letting'))
        and not exists (
          select 1 from seller_instructions newer
          where newer.property_id = consent_listing.property_id
            and newer.revision_number > ${sellerInstructions.revisionNumber}
            and newer.agreed_at is not null and newer.state <> 'draft'
            and (newer.listing_id = consent_listing.id
              or (newer.listing_id is null and (newer.representation_scope = 'sale_and_letting'
                or (consent_listing.purpose = 'sale' and newer.representation_scope = 'sale')
                or (consent_listing.purpose = 'long_term_rent' and newer.representation_scope = 'letting'))))
        )
    )`,
    // Compare UUIDs as text: malformed imported evidence must fail closed, not abort a read.
    sql`exists (
      select 1 from property_relationships authority
      join parties seller on seller.id = authority.party_id
      join document_versions authority_file on authority_file.id::text = authority.scope->>'documentVersionId'
      join documents authority_document on authority_document.id = authority_file.document_id
      join document_versions agreement_file on agreement_file.id::text = ${sellerInstructions.commercialTerms}->'agreement'->>'documentVersionId'
      join documents agreement_document on agreement_document.id = agreement_file.document_id
      where authority.id::text = ${sellerInstructions.commercialTerms}->>'authorityRelationshipId'
        and authority.property_id = ${sellerInstructions.propertyId}
        and authority.party_id::text = ${sellerInstructions.commercialTerms}->>'sellerPartyId'
        and seller.merged_into_party_id is null
        and authority.role in ('seller', 'landlord', 'authorized_representative')
        and authority.authority = 'reviewed' and authority.revoked_at is null
        and authority.valid_from <= ${at}::timestamptz
        and (authority.expires_at is null or authority.expires_at > ${at}::timestamptz)
        and authority_document.property_id = ${sellerInstructions.propertyId}
        and authority_document.purpose = 'seller_authority'
        and authority_document.current_version_number = authority_file.version_number
        and (authority_document.expires_at is null or authority_document.expires_at > ${at}::timestamptz)
        and authority_file.state = 'reviewed' and authority_file.review_type = 'accepted_for_purpose'
        and authority_file.scan = 'clean' and authority_file.sealed_key is not null
        and authority_file.scanned_at is not null and authority_file.scanner_version is not null
        and authority_file.scanned_sha256 = authority_file.sha256
        and authority_file.sha256 = authority.scope->>'digest'
        and authority_file.superseded_by_version_id is null
        and agreement_document.property_id = ${sellerInstructions.propertyId}
        and agreement_document.purpose = 'seller_instruction'
        and agreement_document.current_version_number = agreement_file.version_number
        and (agreement_document.expires_at is null or agreement_document.expires_at > ${at}::timestamptz)
        and agreement_file.state = 'reviewed' and agreement_file.review_type = 'accepted_for_purpose'
        and agreement_file.scan = 'clean' and agreement_file.sealed_key is not null
        and agreement_file.scanned_at is not null and agreement_file.scanner_version is not null
        and agreement_file.scanned_sha256 = agreement_file.sha256
        and agreement_file.sha256 = ${sellerInstructions.commercialTerms}->'agreement'->>'digest'
        and agreement_file.superseded_by_version_id is null
    )`,
  );
}
