import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { bedroomsRequired } from "./listing-facts.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { latestTourForListing, readTourApprovals } from "./tours.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LISTING_QUALITY_REPORT = fromRoot("production", "data", "listing-quality-report.json");
export const DEFAULT_LISTING_QUALITY_WORKBOOK = fromRoot("production", "data", "listing-quality-workbook.csv");
export const DEFAULT_LISTING_QUALITY_REVIEW_INPUT = fromRoot("migration", "reviews", "listing-quality.csv");
export const DEFAULT_LISTING_QUALITY_PREFLIGHT_REPORT = fromRoot("production", "data", "listing-quality-preflight-report.json");
export const DEFAULT_LISTING_QUALITY_REVIEW_DRAFT = fromRoot("production", "data", "listing-quality-review-draft.csv");
export const DEFAULT_LISTING_QUALITY_REVIEW_PACKET = fromRoot("production", "data", "listing-quality-review-packet.json");

const FACT_FIELDS_BY_ISSUE = {
  missing_price: "price_eur",
  missing_bedrooms: "bedrooms",
  missing_location: "location",
  missing_description: "description",
};
const MEDIA_FIELDS_BY_ISSUE = {
  media_review_pending: "media_review",
  missing_alt_text: "media_alt_text",
  thin_public_gallery: "public_gallery",
  tour_review_pending: "tour_review",
};
const KNOWN_ISSUES = [...Object.keys(FACT_FIELDS_BY_ISSUE), ...Object.keys(MEDIA_FIELDS_BY_ISSUE)];
const LISTING_QUALITY_REVIEW_STATUSES = new Set(["missing_review", "invalid_review", "pass"]);
const LEGACY_SOURCE_DOMAINS = new Set(["makler-realty.com", "makler-realty.ru"]);
const REQUIRED_REVIEW_SNAPSHOT_FIELDS = [
  "editor_path",
  "review_status",
  "issues",
  "required_editor_fields",
  "public_gallery_assets",
  "public_gallery_sample",
  "missing_alt_text_assets",
];

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function issueCounts(rows) {
  return rows.reduce((counts, row) => {
    for (const issue of row.issues) counts[issue] = (counts[issue] || 0) + 1;
    return counts;
  }, Object.fromEntries(KNOWN_ISSUES.map((issue) => [issue, 0])));
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function reviewStatus(issues) {
  const needsFacts = issues.some((issue) => FACT_FIELDS_BY_ISSUE[issue]);
  const needsMedia = issues.some((issue) => MEDIA_FIELDS_BY_ISSUE[issue]);
  if (needsFacts && needsMedia) return "needs_facts_and_media_review";
  if (needsFacts) return "needs_facts_review";
  return "needs_media_review";
}

function requiredEditorFields(issues) {
  return issues.map((issue) => FACT_FIELDS_BY_ISSUE[issue] || MEDIA_FIELDS_BY_ISSUE[issue]).filter(Boolean);
}

function assertNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) throw new Error(message);
}

function assertCountMap(actual, expected, label) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error(`Listing quality report must include ${label}`);
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.join("|") !== expectedKeys.join("|")) {
    throw new Error(`Listing quality report ${label} keys must match rows`);
  }
  for (const key of expectedKeys) {
    assertNonNegativeInteger(actual[key], `Listing quality report ${label} must use non-negative integers`);
    if (actual[key] !== expected[key]) {
      throw new Error(`Listing quality report ${label} must match rows`);
    }
  }
}

function assertListingQualityRow(row, seen) {
  if (!filled(row?.listing_id)) throw new Error("Listing quality rows must include listing_id");
  if (seen.has(row.listing_id)) throw new Error(`Listing quality rows must be unique: ${row.listing_id}`);
  seen.add(row.listing_id);
  if (!filled(row.source_locale)) throw new Error(`Listing quality row ${row.listing_id} must include source_locale`);
  if (!LEGACY_SOURCE_DOMAINS.has(row.source_domain)) {
    throw new Error(`Listing quality row ${row.listing_id} must include a legacy source domain`);
  }
  if (!filled(row.target_path)) throw new Error(`Listing quality row ${row.listing_id} must include target_path`);
  if (!row.editor_path?.startsWith("/admin/listings/edit?listingId=")) {
    throw new Error("Listing quality rows must link to the admin listing editor");
  }
  if (!Array.isArray(row.issues) || row.issues.length < 1) {
    throw new Error(`Listing quality row ${row.listing_id} must include issues`);
  }
  for (const issue of row.issues) {
    if (!KNOWN_ISSUES.includes(issue)) throw new Error(`Listing quality row ${row.listing_id} has unknown issue ${issue}`);
  }
  if (row.review_status !== reviewStatus(row.issues)) {
    throw new Error(`Listing quality row ${row.listing_id} review status must match issues`);
  }
  if (JSON.stringify(row.required_editor_fields) !== JSON.stringify(requiredEditorFields(row.issues))) {
    throw new Error(`Listing quality row ${row.listing_id} required editor fields must match issues`);
  }
  for (const key of ["public_gallery_assets", "missing_alt_text_assets", "review_gated_assets"]) {
    assertNonNegativeInteger(row[key], `Listing quality row ${row.listing_id} ${key} must be a non-negative integer`);
  }
  if (!Array.isArray(row.public_gallery_sample)) {
    throw new Error(`Listing quality row ${row.listing_id} must include public_gallery_sample`);
  }
}

function publicGallerySample(publicPhotos) {
  const seen = new Set();
  return publicPhotos
    .map((media) => ({ url: media.asset_url || media.url, alt: media.alt || "" }))
    .filter((media) => {
      if (!media.url || seen.has(media.url)) return false;
      seen.add(media.url);
      return true;
    })
    .slice(0, 3)
    .map((media) => (media.alt ? `${media.url} [alt: ${media.alt}]` : media.url));
}

function qualityRow(record, approvedTour = null) {
  const facts = record.facts || {};
  const tour = approvedTour || record.tour;
  const publicPhotos = (record.media || []).filter((media) => media.kind === "photo" && media.is_public);
  const publicGalleryAssets = record.media_workflow?.public_gallery_assets ?? publicPhotos.length;
  const missingAltTextAssets = publicPhotos.filter((media) => !filled(media.alt)).length;
  const issues = [];
  if (!filled(facts.price_eur) && facts.price_on_request !== true) issues.push("missing_price");
  if (bedroomsRequired(facts) && !filled(facts.bedrooms) && facts.bedrooms_not_applicable !== true) {
    issues.push("missing_bedrooms");
  }
  if (!filled(facts.location)) issues.push("missing_location");
  if (!filled(facts.description)) issues.push("missing_description");
  if (record.media_workflow?.review_gated_assets) issues.push("media_review_pending");
  if (missingAltTextAssets) issues.push("missing_alt_text");
  if (publicGalleryAssets < 3) issues.push("thin_public_gallery");
  if (tour?.panorama_url && !tour.is_public) issues.push("tour_review_pending");
  if (!issues.length) return null;

  return {
    listing_id: record.id,
    source_locale: record.source_locale,
    source_domain: record.source_domain,
    target_path: record.routing?.target_path || null,
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
    review_status: reviewStatus(issues),
    required_editor_fields: requiredEditorFields(issues),
    title: facts.h1 || facts.title || record.id,
    location: facts.location || "",
    description: facts.description || "",
    issues,
    price_eur: facts.price_eur,
    price_on_request: facts.price_on_request === true,
    bedrooms: facts.bedrooms,
    bedrooms_not_applicable: facts.bedrooms_not_applicable === true,
    public_gallery_assets: publicGalleryAssets,
    public_gallery_sample: publicGallerySample(publicPhotos),
    missing_alt_text_assets: missingAltTextAssets,
    review_gated_assets: record.media_workflow?.review_gated_assets || 0,
  };
}

export function buildListingQualityReport({
  seed = loadCmsSeed(),
  tourApprovals = readTourApprovals(),
  generatedAt = new Date().toISOString(),
  limit = null,
} = {}) {
  const allRows = seed.records
    .filter((record) => record.collection === "listings")
    .map((record) => qualityRow(record, latestTourForListing(tourApprovals, record.id)))
    .filter(Boolean);
  const rows = limit ? allRows.slice(0, limit) : allRows;
  return {
    generated_at: generatedAt,
    summary: {
      listings: seed.summary.listings,
      affected_listings: allRows.length,
      issue_counts: issueCounts(allRows),
      by_source_locale: countBy(allRows, (row) => row.source_locale),
      by_source_domain: countBy(allRows, (row) => row.source_domain),
    },
    rows,
  };
}

export function assertListingQualityReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Listing quality report must include valid generated_at");
  }
  if (!report.summary || typeof report.summary !== "object") throw new Error("Listing quality report must include summary");
  if (report.summary.listings !== 165) throw new Error("Listing quality report must cover CMS listing inventory");
  assertNonNegativeInteger(report.summary.affected_listings, "Listing quality report must count affected listings");
  if (!Array.isArray(report.rows)) throw new Error("Listing quality report must include rows");
  if (report.rows.length !== report.summary.affected_listings) {
    throw new Error("Listing quality report rows must cover every affected listing");
  }
  if (!Object.hasOwn(report.summary.issue_counts, "missing_price")) {
    throw new Error("Listing quality report must expose missing price counts");
  }
  if (!Object.hasOwn(report.summary.issue_counts, "media_review_pending")) {
    throw new Error("Listing quality report must expose pending media review");
  }
  if (!Object.hasOwn(report.summary.issue_counts, "missing_alt_text")) {
    throw new Error("Listing quality report must expose missing media alt text");
  }
  const seen = new Set();
  for (const row of report.rows) assertListingQualityRow(row, seen);
  assertCountMap(report.summary.issue_counts, issueCounts(report.rows), "issue counts");
  assertCountMap(report.summary.by_source_locale, countBy(report.rows, (row) => row.source_locale), "source locale counts");
  assertCountMap(report.summary.by_source_domain, countBy(report.rows, (row) => row.source_domain), "source domain counts");
  return true;
}

export function renderListingQualityWorkbook(report) {
  const headers = [
    "listing_id",
    "target_path",
    "source_locale",
    "source_domain",
    "issues",
    "review_status",
    "required_editor_fields",
    "title",
    "location",
    "description",
    "price_eur",
    "bedrooms",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
    "review_gated_assets",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
  ];
  return `${[headers.join(","), ...report.rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
}

function reviewNoteForRow(row) {
  const notes = [];
  if (row.required_editor_fields.includes("public_gallery")) {
    notes.push(`Review public gallery: currently ${row.public_gallery_assets} public asset(s).`);
  }
  if (row.required_editor_fields.includes("media_alt_text")) {
    notes.push(`Review media alt text: ${row.missing_alt_text_assets} public asset(s) missing alt text.`);
  }
  if (row.required_editor_fields.includes("media_review")) {
    notes.push(`Review gated media: ${row.review_gated_assets} asset(s) still gated.`);
  }
  if (row.required_editor_fields.includes("tour_review")) notes.push("Review 360 tour before public display.");
  return notes.join(" ");
}

export function renderListingQualityReviewDraft(report) {
  const headers = [
    "listing_id",
    "price_eur",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const rows = report.rows.map((row) => ({
    listing_id: row.listing_id,
    price_eur: row.required_editor_fields.includes("price_eur") ? row.price_eur || "" : "",
    bedrooms: row.required_editor_fields.includes("bedrooms") ? row.bedrooms ?? "" : "",
    location: row.required_editor_fields.includes("location") ? row.location || "" : "",
    description: row.required_editor_fields.includes("description") ? row.description || "" : "",
    facts_reviewer: "",
    media_reviewer: "",
    review_notes: reviewNoteForRow(row),
    editor_path: row.editor_path,
    review_status: row.review_status,
    issues: row.issues,
    required_editor_fields: row.required_editor_fields,
    public_gallery_assets: row.public_gallery_assets,
    public_gallery_sample: row.public_gallery_sample,
    missing_alt_text_assets: row.missing_alt_text_assets,
  }));
  return `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
}

export function buildListingQualityReviewPacket({
  draftCsvPath = DEFAULT_LISTING_QUALITY_REVIEW_DRAFT,
  generatedAt = new Date().toISOString(),
  report = buildListingQualityReport(),
  reviewPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
} = {}) {
  const factsReviewRows = report.rows.filter((row) =>
    row.required_editor_fields.some((field) => ["price_eur", "bedrooms", "location", "description"].includes(field)),
  ).length;
  const mediaReviewRows = report.rows.filter((row) =>
    row.required_editor_fields.some((field) =>
      ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field),
    ),
  ).length;
  return {
    kind: "listing_quality_review_packet",
    generated_at: generatedAt,
    ready: false,
    status: "draft_not_launch_evidence",
    paths: {
      workbook_csv: DEFAULT_LISTING_QUALITY_WORKBOOK,
      draft_review_csv: draftCsvPath,
      launch_review_csv: reviewPath,
    },
    admin: {
      editor_path_pattern: "/admin/listings/edit?listingId=:listing_id",
      import_endpoint: "POST /api/admin/listing-quality/import",
      workbook_endpoint: "GET /api/admin/listing-quality-workbook",
      draft_review_endpoint: "GET /api/admin/listing-quality-review-draft",
      review_packet_endpoint: "GET /api/admin/listing-quality-review-packet",
    },
    summary: {
      expected_review_rows: report.rows.length,
      facts_review_rows_required: factsReviewRows,
      media_review_rows_required: mediaReviewRows,
      reviewer_fields_blank: report.rows.length,
      issue_counts: report.summary.issue_counts,
      by_review_status: countBy(report.rows, (row) => row.review_status),
    },
    instructions: [
      "Use the draft CSV as a reviewer worksheet only; it is not launch evidence.",
      "Fill facts_reviewer when fact fields are required and media_reviewer when media or gallery review is required.",
      "Copy the completed rows to migration/reviews/listing-quality.csv or set MS_REALTY_LISTING_QUALITY_REVIEW_PATH.",
      "Run npm run listing:preflight before launch:preflight.",
    ],
  };
}

export function assertListingQualityReviewPacket(packet) {
  if (packet.kind !== "listing_quality_review_packet") throw new Error("Listing quality review packet kind is invalid");
  if (packet.ready !== false || packet.status !== "draft_not_launch_evidence") {
    throw new Error("Listing quality review packet must not claim launch readiness");
  }
  if (!packet.paths?.draft_review_csv || !packet.paths?.launch_review_csv) {
    throw new Error("Listing quality review packet must include draft and launch review paths");
  }
  if (packet.paths.draft_review_csv === packet.paths.launch_review_csv) {
    throw new Error("Listing quality draft path must not equal the launch review path");
  }
  if (packet.summary.expected_review_rows < 1) throw new Error("Listing quality review packet must include review rows");
  if (packet.summary.reviewer_fields_blank !== packet.summary.expected_review_rows) {
    throw new Error("Listing quality review packet must keep reviewer fields blank");
  }
  return true;
}

function assertReviewFactValue(listingId, field, value) {
  if (!filled(value)) throw new Error(`Listing ${listingId} requires ${field}`);
  if (field === "price_eur") {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Listing ${listingId} requires a positive price_eur`);
  }
  if (field === "bedrooms") {
    const bedrooms = Number(value);
    if (!Number.isInteger(bedrooms) || bedrooms < 0) {
      throw new Error(`Listing ${listingId} requires bedrooms as a non-negative integer`);
    }
  }
}

function assertReviewerValue(listingId, field, value) {
  if (!filled(value)) throw new Error(`Listing ${listingId} requires ${field}`);
  const reviewer = String(value).trim();
  if (
    /^(ai|chatgpt|codex|example|hermes|n\/?a|none|placeholder|reviewer|sample|tbd|test|todo|unknown)$/i.test(
      reviewer,
    ) ||
    /(^|[^a-z0-9])(ai|chatgpt|codex|hermes)([^a-z0-9]|$)/i.test(reviewer)
  ) {
    throw new Error(`Listing ${listingId} requires a real ${field}`);
  }
}

function assertReviewNotes(listingId, value, { mediaRequired = false } = {}) {
  if (!filled(value)) throw new Error(`Listing ${listingId} requires review_notes`);
  const notes = String(value).trim();
  if (/^(done|example|n\/?a|none|ok|placeholder|reviewed|sample|tbd|test|todo|unknown)$/i.test(notes)) {
    throw new Error(`Listing ${listingId} requires real review_notes`);
  }
  if (/^Review (public gallery|media alt text|gated media|360 tour)\b/i.test(notes)) {
    throw new Error(`Listing ${listingId} requires resolved review_notes, not draft instructions`);
  }
  if (
    mediaRequired &&
    !/(source|gallery|media|photo|image|asset|alt|tour|panorama|източник|галер|меди|сним|тур|панорам|источник|галере|фото)/i.test(
      notes,
    )
  ) {
    throw new Error(`Listing ${listingId} media review_notes must cite media or source evidence`);
  }
}

function listValue(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertOptionalSnapshotValue(listingId, label, actual, expected) {
  if (!filled(actual)) return;
  if (String(actual).trim() !== String(expected ?? "").trim()) {
    throw new Error(`Listing ${listingId} review ${label} is stale`);
  }
}

function assertOptionalSnapshotList(listingId, label, actual, expected) {
  if (!filled(actual)) return;
  if (JSON.stringify(listValue(actual)) !== JSON.stringify(expected)) {
    throw new Error(`Listing ${listingId} review ${label} is stale`);
  }
}

export function validateListingQualityReviewCsv(report, csvText, { allowExtraRows = false, requireComplete = false } = {}) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("Listing quality review CSV has no rows");

  const byListing = new Map(report.rows.map((row) => [row.listing_id, row]));
  const seen = new Set();
  const reviewRows = allowExtraRows ? rows.filter((row) => byListing.has(row.listing_id || row.listingId)) : rows;
  const reviews = reviewRows.map((row) => {
    const listingId = row.listing_id || row.listingId;
    const quality = byListing.get(listingId);
    if (!quality) throw new Error(`Listing quality review requires a known listing_id: ${listingId || ""}`);
    if (seen.has(listingId)) throw new Error(`Duplicate listing quality review row: ${listingId}`);
    seen.add(listingId);
    if (requireComplete) {
      const expectedSnapshots = {
        editor_path: quality.editor_path,
        review_status: quality.review_status,
        issues: quality.issues,
        required_editor_fields: quality.required_editor_fields,
        public_gallery_assets: quality.public_gallery_assets,
        public_gallery_sample: quality.public_gallery_sample,
        missing_alt_text_assets: quality.missing_alt_text_assets,
      };
      for (const field of REQUIRED_REVIEW_SNAPSHOT_FIELDS) {
        if (!Object.hasOwn(row, field)) throw new Error(`Listing ${listingId} complete review requires ${field}`);
        const expected = expectedSnapshots[field];
        const expectedValue = Array.isArray(expected) ? expected.length > 0 : expected !== null && expected !== undefined;
        if (expectedValue && !filled(row[field])) throw new Error(`Listing ${listingId} complete review requires ${field}`);
      }
    }
    assertOptionalSnapshotValue(listingId, "review_status", row.review_status, quality.review_status);
    assertOptionalSnapshotValue(listingId, "editor_path", row.editor_path, quality.editor_path);
    assertOptionalSnapshotValue(listingId, "public_gallery_assets", row.public_gallery_assets, quality.public_gallery_assets);
    assertOptionalSnapshotValue(listingId, "missing_alt_text_assets", row.missing_alt_text_assets, quality.missing_alt_text_assets);
    assertOptionalSnapshotList(listingId, "issues", row.issues, quality.issues);
    assertOptionalSnapshotList(listingId, "required_editor_fields", row.required_editor_fields, quality.required_editor_fields);
    assertOptionalSnapshotList(listingId, "public_gallery_sample", row.public_gallery_sample, quality.public_gallery_sample);

    const factIssues = quality.issues.filter((issue) => FACT_FIELDS_BY_ISSUE[issue]);
    const mediaIssues = quality.issues.filter((issue) => MEDIA_FIELDS_BY_ISSUE[issue]);
    if (factIssues.length) assertReviewerValue(listingId, "facts_reviewer", row.facts_reviewer);
    for (const issue of factIssues) {
      assertReviewFactValue(listingId, FACT_FIELDS_BY_ISSUE[issue], row[FACT_FIELDS_BY_ISSUE[issue]]);
    }
    if (mediaIssues.length) assertReviewerValue(listingId, "media_reviewer", row.media_reviewer);
    assertReviewNotes(listingId, row.review_notes, { mediaRequired: mediaIssues.length > 0 });

    return {
      listing_id: listingId,
      fact_issues: factIssues.length,
      media_issues: mediaIssues.length,
      editor: row.facts_reviewer || row.media_reviewer,
      media_reviewer: row.media_reviewer || "",
      review_notes: row.review_notes || "",
      patch: Object.fromEntries(factIssues.map((issue) => [FACT_FIELDS_BY_ISSUE[issue], row[FACT_FIELDS_BY_ISSUE[issue]]])),
    };
  });
  const missingReviewRows = report.rows.filter((row) => !seen.has(row.listing_id));
  if (requireComplete && missingReviewRows.length) {
    const sample = missingReviewRows.slice(0, 5).map((row) => row.listing_id).join(", ");
    throw new Error(
      `Listing quality review is incomplete: ${missingReviewRows.length} listing rows missing review (${sample})`,
    );
  }

  return {
    reviews,
    summary: {
      expected_review_rows: report.rows.length,
      review_rows: reviews.length,
      missing_review_rows: missingReviewRows.length,
      facts_review_rows: reviews.filter((row) => row.fact_issues > 0).length,
      media_review_rows: reviews.filter((row) => row.media_issues > 0).length,
    },
  };
}

function missingReviewSummary(report) {
  return {
    expected_review_rows: report.rows.length,
    review_rows: 0,
    missing_review_rows: report.rows.length,
    facts_review_rows: 0,
    media_review_rows: 0,
  };
}

function pendingReviewSample(rows) {
  return rows.slice(0, 10).map((row) => ({
    listing_id: row.listing_id,
    target_path: row.target_path,
    editor_path: row.editor_path,
    issues: row.issues,
    required_editor_fields: row.required_editor_fields,
    public_gallery_assets: row.public_gallery_assets,
    public_gallery_sample: row.public_gallery_sample,
  }));
}

function reviewState(report, reviewPath, csvText = null) {
  if (csvText === null && !fs.existsSync(reviewPath)) {
    return {
      status: "missing_review",
      path: reviewPath,
      summary: missingReviewSummary(report),
      pending_review_sample: pendingReviewSample(report.rows),
    };
  }

  try {
    const text = csvText ?? fs.readFileSync(reviewPath, "utf8");
    const validation = validateListingQualityReviewCsv(report, text, { allowExtraRows: true });
    if (validation.summary.missing_review_rows > 0) {
      const reviewed = new Set(validation.reviews.map((review) => review.listing_id));
      const missingRows = report.rows.filter((row) => !reviewed.has(row.listing_id));
      const sample = missingRows
        .slice(0, 5)
        .map((row) => row.listing_id)
        .join(", ");
      return {
        status: "invalid_review",
        path: reviewPath,
        summary: validation.summary,
        error: `Listing quality review is incomplete: ${validation.summary.missing_review_rows} listing rows missing review (${sample})`,
        pending_review_sample: pendingReviewSample(missingRows),
      };
    }
    return { status: "pass", path: reviewPath, summary: validation.summary };
  } catch (error) {
    return {
      status: "invalid_review",
      path: reviewPath,
      summary: missingReviewSummary(report),
      error: error.message,
      pending_review_sample: pendingReviewSample(report.rows),
    };
  }
}

export function buildListingQualityPreflightReport({
  report = buildListingQualityReport(),
  reviewPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  csvText = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const review = reviewState(report, reviewPath, csvText);
  return {
    generated_at: generatedAt,
    ready: review.status === "pass",
    status: review.status === "pass" ? "ready" : "blocked",
    review,
    summary: {
      affected_listings: report.summary.affected_listings,
      expected_review_rows: review.summary.expected_review_rows,
      review_rows: review.summary.review_rows,
      missing_review_rows: review.summary.missing_review_rows,
      facts_review_rows: review.summary.facts_review_rows,
      media_review_rows: review.summary.media_review_rows,
      issue_counts: report.summary.issue_counts,
    },
    next_actions:
      review.status === "pass"
        ? ["Run npm run listing:preflight, then npm run launch:preflight with the same listing quality review path."]
        : [
            "Review production/data/listing-quality-workbook.csv.",
            "Write migration/reviews/listing-quality.csv or set MS_REALTY_LISTING_QUALITY_REVIEW_PATH.",
            "Run npm run listing:preflight before launch:preflight.",
          ],
  };
}

export function listingQualityImportSummary(report, review, { reviewPath = null, reviewPersistenceError = "" } = {}) {
  const reviewed = new Set(review.reviews.map((row) => row.listing_id));
  const missingRows = report.rows.filter((row) => !reviewed.has(row.listing_id));
  const ready = review.summary.missing_review_rows === 0 && Boolean(reviewPath);
  return {
    ready,
    status: ready ? "ready" : "blocked",
    expectedReviewRows: review.summary.expected_review_rows,
    reviewRows: review.summary.review_rows,
    missingReviewRows: review.summary.missing_review_rows,
    reviewPersisted: Boolean(reviewPath),
    reviewPath,
    reviewPersistenceError,
    pendingReviewSample: pendingReviewSample(missingRows),
    nextActions: ready
      ? ["Run npm run listing:preflight, then npm run launch:preflight with the same listing quality review path."]
      : [
          "Complete the missing listing review rows in production/data/listing-quality-workbook.csv.",
          "Import the complete CSV through /api/admin/listing-quality/import.",
          "Run npm run listing:preflight before launch:preflight.",
        ],
  };
}

export function assertListingQualityPreflightReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Listing quality preflight report must include valid generated_at");
  }
  if (!LISTING_QUALITY_REVIEW_STATUSES.has(report.review?.status)) {
    throw new Error("Listing quality preflight report must use a known review status");
  }
  const ready = report.review?.status === "pass";
  if (report.ready !== ready) throw new Error("Listing quality preflight ready flag must match review state");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("Listing quality preflight status must match ready flag");
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("Listing quality preflight report must include next actions");
  }
  if (!ready && !report.next_actions.some((action) => action.includes("listing:preflight"))) {
    throw new Error("Listing quality preflight blocked report must point to listing:preflight");
  }
  if (
    ready &&
    !report.next_actions.some((action) => action.includes("listing:preflight") && action.includes("launch:preflight"))
  ) {
    throw new Error("Listing quality preflight ready report must point to listing:preflight before launch:preflight");
  }
  if (!report.summary || !report.review?.summary || report.summary.expected_review_rows < report.summary.review_rows) {
    throw new Error("Listing quality preflight summary must count expected and reviewed rows");
  }
  for (const key of ["expected_review_rows", "review_rows", "missing_review_rows", "facts_review_rows", "media_review_rows"]) {
    if (!Number.isInteger(report.summary[key]) || report.summary[key] < 0) {
      throw new Error("Listing quality preflight summary counts must be non-negative integers");
    }
  }
  if (report.summary.expected_review_rows !== report.summary.review_rows + report.summary.missing_review_rows) {
    throw new Error("Listing quality preflight summary must reconcile expected, reviewed, and missing rows");
  }
  if (report.summary.facts_review_rows > report.summary.review_rows || report.summary.media_review_rows > report.summary.review_rows) {
    throw new Error("Listing quality preflight summary review counts cannot exceed reviewed rows");
  }
  if (!report.summary.issue_counts || typeof report.summary.issue_counts !== "object" || Array.isArray(report.summary.issue_counts)) {
    throw new Error("Listing quality preflight summary must include issue counts");
  }
  if (
    !Number.isInteger(report.summary.affected_listings) ||
    report.summary.affected_listings < report.summary.expected_review_rows
  ) {
    throw new Error("Listing quality preflight summary must cover affected listings");
  }
  for (const key of ["expected_review_rows", "review_rows", "missing_review_rows", "facts_review_rows", "media_review_rows"]) {
    if (report.summary[key] !== report.review.summary?.[key]) {
      throw new Error("Listing quality preflight summary must match review summary");
    }
  }
  if (ready) {
    if (!report.review.path || report.review.path.endsWith(".example")) {
      throw new Error("Listing quality preflight ready report must include non-example review path");
    }
    if (report.summary.expected_review_rows < 1 || report.summary.review_rows !== report.summary.expected_review_rows) {
      throw new Error("Listing quality preflight ready report must cover every review row");
    }
    if (report.summary.affected_listings !== report.summary.expected_review_rows) {
      throw new Error("Listing quality preflight ready report must cover every affected listing");
    }
    if (report.summary.missing_review_rows !== 0) {
      throw new Error("Listing quality preflight ready report must have no missing review rows");
    }
  }
  if (!ready && report.summary.missing_review_rows > 0) {
    if (!Array.isArray(report.review.pending_review_sample) || report.review.pending_review_sample.length < 1) {
      throw new Error("Listing quality preflight report must include pending review sample rows");
    }
    if (report.review.pending_review_sample.length > 10) {
      throw new Error("Listing quality preflight pending sample must stay bounded");
    }
  }
  return true;
}

export function writeListingQualityPreflightReport(report, outPath = DEFAULT_LISTING_QUALITY_PREFLIGHT_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertListingQualityPreflightReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

export function writeListingQualityReport(report, outPath = DEFAULT_LISTING_QUALITY_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertListingQualityReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

export function writeListingQualityWorkbook(report, outPath = DEFAULT_LISTING_QUALITY_WORKBOOK) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertListingQualityReport(report);
  fs.writeFileSync(outPath, renderListingQualityWorkbook(report));
  return outPath;
}

export function writeListingQualityReviewPacket(
  packet,
  {
    draftCsv = null,
    draftCsvPath = packet.paths.draft_review_csv,
    packetPath = DEFAULT_LISTING_QUALITY_REVIEW_PACKET,
    report = null,
  } = {},
) {
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.mkdirSync(path.dirname(draftCsvPath), { recursive: true });
  assertListingQualityReviewPacket(packet);
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(draftCsvPath, draftCsv ?? renderListingQualityReviewDraft(report ?? buildListingQualityReport()));
  return { draftCsvPath, packetPath };
}

export function writeListingQualityReviewCsv(csvText, outPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csvText.endsWith("\n") ? csvText : `${csvText}\n`);
  return outPath;
}

export function writeCompleteListingQualityReviewCsv(report, csvText, outPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT) {
  validateListingQualityReviewCsv(report, csvText, { requireComplete: true });
  return writeListingQualityReviewCsv(csvText, outPath);
}
