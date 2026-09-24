// The frozen legacy extraction in data/legacy (see its README). Only the fields the import
// reads are typed; everything else stays in the files as evidence.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const defaultLegacyDir = fileURLToPath(new URL("../../../data/legacy", import.meta.url));

export const legacyFiles = [
  "listings.json",
  "geography.json",
  "media-manifest.json",
  "url-decisions.json",
  "content.json",
] as const;

export interface LegacyTranslation {
  locale: string;
  is_source_locale: boolean;
  translation_state: string;
  human_approved: boolean;
  public_indexable: boolean;
  translator: string | null;
  content_origin: string;
  source_hash: string | null;
  translated_hash: string | null;
  title: string | null;
  description: string | null;
  seo_title: string | null;
  meta_description: string | null;
}

export interface LegacyMediaEntry {
  order: number;
  type: string;
  legacy_kind: string;
  original_url: string;
  r2_key: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

export interface LegacyAreaValue {
  basis: string;
  legacy_field: string | null;
  value_sqm: number;
  unit: string;
}

export interface LegacyListing {
  reference: { id: string; kind: string; lot_number: number | null; lot_suffix: string | null };
  legacy_ids: {
    migration_id: string;
    legacy_lot_id: string | null;
    legacy_post_id: string | null;
    legacy_domain: string;
    crawl_record_id: string | null;
    merged_into: string | null;
  };
  purpose: string;
  property_type: {
    legacy: string;
    family: string | null;
    subtype: string | null;
    taxonomy_version: string | null;
    taxonomy_review_status: string;
  };
  price: {
    amount: number | null;
    currency: string | null;
    period: string | null;
    period_recorded: boolean;
    on_request: boolean;
    note?: string | null;
  };
  rooms: { count: number | null; recorded: boolean; note?: string | null };
  bedrooms: {
    count: number | null;
    recorded: boolean;
    not_applicable: boolean;
    property_record_count: number | null;
    /** The legacy record's 0 was a placeholder default, not a count. */
    zero_value_placeholder: boolean;
    /** The legacy property's own fact_verification state for bedrooms_count. */
    property_verification_state: string | null;
  };
  areas: {
    extraction: {
      status: string;
      proposal: { value_sqm: number | null; basis: string | null } | null;
      review_reasons?: string[];
      human_decision: {
        action: string;
        confidence?: string | null;
        reason?: string | null;
        values?: LegacyAreaValue[];
      } | null;
    };
  };
  location: {
    country: { code: string; name: string };
    region: { name: string; id: string };
    municipality: { name: string; code: string } | null;
    settlement: { name: string; native_name: string | null; geography_id: string };
    neighborhood: { name: string | null; recorded: boolean };
    public_precision: string;
    legacy_label: string | null;
    place_key: string;
    review_status: string;
  };
  source_description: {
    locale: string;
    title: string | null;
    h1: string | null;
    description: string | null;
    source_url: string;
  };
  features: {
    known: Record<string, unknown>;
    unknown: { field: string; recorded_state: string }[];
  };
  media: LegacyMediaEntry[];
  translations: LegacyTranslation[];
  legacy_urls: {
    domain: string;
    url: string;
    slug: { path: string };
    decision: { status: number; decision: string; target_path: string | null };
    is_primary_source_url: boolean;
  }[];
  lifecycle_at_freeze: {
    state: string;
    source_review_status: string;
    reason: string;
    checked_at: string;
    freeze_approval_id: string;
    freeze_at: string;
  };
  publication_approval: {
    approval_id: string;
    covers_this_listing: boolean;
    scope: string;
    decision: string;
    boundary: string;
    approved_by: string;
    approved_at: string;
    covered_surface: string;
  } | null;
  open_work: { enrichment_task?: { task_type: string; state: string } | null };
  provenance: { source_artifact: string; crawl_captured_at: string; source_url: string };
}

export interface LegacyRegistryName {
  id: string;
  level: string;
  official_code: string;
  names: { native: string; en: string };
}

export interface LegacyPlace {
  place_key: string;
  level: string;
  country: { code: string; name: string };
  region: LegacyRegistryName;
  geography_id: string;
  registry_entry: LegacyRegistryName & { parent_id: string | null };
  ancestors: LegacyRegistryName[];
  names: {
    native: string;
    latin: string;
    official_native: string;
    official_transliteration: string;
  };
  aliases: string[];
}

export interface LegacyMediaObject {
  r2_key: string;
  original_url: string;
  content_type: string;
  content_type_source: string;
  bytes: number | null;
  sha256: string | null;
  listing_references: string[];
}

export interface LegacyUrlDecision {
  domain: string;
  source_path: string;
  source_path_encoded: string;
  source_query: string | null;
  source_url: string;
  url_type: string;
  decision: string;
  status: number;
  target: { path: string | null; kind: string | null; locale: string | null };
  listing_reference: string | null;
  equivalent_content: boolean;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface LegacyContentRecord {
  id: string;
  type: string;
  locale: string;
  source_locale: string;
  status: string;
  human_approved: boolean;
  reviewer: string | null;
  approved_at: string | null;
  source_hash: string;
  title: string;
  area_key?: string;
  guide_key?: string;
  [key: string]: unknown;
}

export interface LegacySources {
  readonly dir: string;
  /** sha256 per file, and one over all of them: a batch is bound to exactly this input. */
  readonly fileSha256: Record<string, string>;
  readonly sha256: string;
  readonly listings: {
    listings: LegacyListing[];
    approvals: { listing_publication: { does_not_cover: string[] } };
  };
  readonly geography: { places: LegacyPlace[] };
  readonly media: { bucket: string; objects: LegacyMediaObject[] };
  readonly urls: { decisions: LegacyUrlDecision[] };
  readonly content: {
    area_guides: { guides: LegacyContentRecord[] };
    guide_documents: { documents: LegacyContentRecord[] };
  };
}

export async function loadLegacySources(dir = defaultLegacyDir): Promise<LegacySources> {
  const raw: Record<string, Buffer> = {};
  for (const file of legacyFiles) raw[file] = await readFile(`${dir}/${file}`);
  const fileSha256 = Object.fromEntries(
    legacyFiles.map((f) => [
      f,
      createHash("sha256")
        .update(raw[f] as Buffer)
        .digest("hex"),
    ]),
  );
  const parse = (file: (typeof legacyFiles)[number]) => JSON.parse(String(raw[file]));
  return {
    dir,
    fileSha256,
    sha256: createHash("sha256")
      .update(legacyFiles.map((f) => `${f}:${fileSha256[f]}`).join("\n"))
      .digest("hex"),
    listings: parse("listings.json"),
    geography: parse("geography.json"),
    media: parse("media-manifest.json"),
    urls: parse("url-decisions.json"),
    content: parse("content.json"),
  };
}
