import { isPublicBrokerContact } from "./broker-contacts.mjs";

const SAMPLE_LIMIT = 20;

function task(input) {
  return { status: "open", ...input };
}

function lane({ id, title, owner, priority, adminPath, guardrail, count, tasks }) {
  return {
    id,
    title,
    owner,
    priority,
    status: count ? "open" : "complete",
    count,
    admin_path: adminPath,
    guardrail,
    tasks: tasks.slice(0, SAMPLE_LIMIT),
  };
}

export function buildAgencyReviewQueue({
  pendingRoutes = [],
  listingQuality = {},
  listingVerification = {},
  translationCoverage = {},
  brokerContacts = [],
  seoEvidence = {},
  launchReadiness = {},
} = {}) {
  const qualityRows = listingQuality.rows || [];
  const qualityCount = listingQuality.review_queue?.summary?.pending_review_rows ?? qualityRows.length;
  const verificationRows = listingVerification.rows || [];
  const translationRows = translationCoverage.rows || [];
  const translationCount = translationCoverage.summary?.open_translation_tasks ?? translationRows.length;
  const approvedContactListings = new Set(
    brokerContacts.filter(isPublicBrokerContact).map((row) => row.listing_id),
  );
  const contactRows = verificationRows.filter((row) => !approvedContactListings.has(row.listing_id));
  const missingSeoSources = seoEvidence.missingRequiredSources || seoEvidence.missing_required_sources || [];
  const operationalSignoffs = (launchReadiness.gates || []).filter(
    (gate) => gate.status === "blocked" && ["monitoring_rollback", "production_recovery"].includes(gate.id),
  );

  const lanes = [
    lane({
      id: "legacy_routes",
      title: "Legacy URL decisions",
      owner: "content_and_seo",
      priority: "high",
      adminPath: "/admin/migration/review",
      guardrail: "No DNS cutover until every legacy URL has a reviewed terminal decision.",
      count: pendingRoutes.length,
      tasks: pendingRoutes.map((row) =>
        task({
          id: `route-${row.id || encodeURIComponent(row.old_url)}`,
          title: row.old_url,
          owner: row.source_domain === "makler-realty.ru" ? "ru_preservation_editor" : "content_editor",
          priority: row.priority || "high",
          admin_path: `/admin/migration/review?q=${encodeURIComponent(row.old_url)}`,
        }),
      ),
    }),
    lane({
      id: "listing_quality",
      title: "Listing facts and media",
      owner: "broker",
      priority: "high",
      adminPath: "/admin/migration/review",
      guardrail: "Unreviewed listings remain blocked from publication.",
      count: qualityCount,
      tasks: qualityRows.map((row) =>
        task({
          id: `listing-quality-${row.listing_id}`,
          title: row.title || row.listing_id,
          owner: row.source_locale === "ru" ? "broker_ru" : "broker_bg",
          priority: "high",
          admin_path: row.editor_path,
        }),
      ),
    }),
    lane({
      id: "broker_verification",
      title: "Broker listing verification",
      owner: "broker",
      priority: "high",
      adminPath: "/admin/listings",
      guardrail: "Availability, canonical facts, and SEO approval must be verified before publication.",
      count: verificationRows.length,
      tasks: verificationRows.map((row) =>
        task({
          id: row.verification_task?.id || `verify-${row.listing_id}`,
          title: row.listing_id,
          owner: row.verification_task?.owner || (row.source_locale === "ru" ? "broker_ru" : "broker_bg"),
          priority: row.priority || "high",
          admin_path: row.admin_path,
        }),
      ),
    }),
    lane({
      id: "broker_contacts",
      title: "Broker contact approval",
      owner: "broker",
      priority: "high",
      adminPath: "/admin/listings",
      guardrail: "Listings use the safe enquiry fallback until an independently verified contact is approved.",
      count: contactRows.length,
      tasks: contactRows.map((row) =>
        task({
          id: `broker-contact-${row.listing_id}`,
          title: row.listing_id,
          owner: row.verification_task?.owner || "broker",
          priority: "high",
          admin_path: row.admin_path,
        }),
      ),
    }),
    lane({
      id: "translations",
      title: "Translation review and approval",
      owner: "translation_editors",
      priority: "medium",
      adminPath: "/admin/translations",
      guardrail: "Draft and missing translations stay non-indexable until human approval and publication.",
      count: translationCount,
      tasks: translationRows.map((row) =>
        task({
          id: row.task?.id || `translation-${row.listing_id}-${row.target_locale}`,
          title: `${row.listing_id} → ${String(row.target_locale || "").toUpperCase()}`,
          owner: row.task?.owner || row.reviewer_role,
          priority: row.current_status === "stale" ? "high" : "medium",
          admin_path: row.admin_path,
        }),
      ),
    }),
    lane({
      id: "external_seo",
      title: "External SEO evidence",
      owner: "seo_editor",
      priority: "high",
      adminPath: "/admin/migration/review",
      guardrail: "Legacy-domain cutover remains blocked until both domains have reviewed source evidence.",
      count: missingSeoSources.length,
      tasks: missingSeoSources.map((source) =>
        task({
          id: `seo-${source}`,
          title: source,
          owner: "seo_editor",
          priority: "high",
          admin_path: "/admin/migration/review",
        }),
      ),
    }),
    lane({
      id: "operational_signoff",
      title: "Monitoring and recovery sign-off",
      owner: "agency_admin",
      priority: "high",
      adminPath: "/admin/migration/review",
      guardrail: "Public launch remains blocked until production evidence and the required reviewer sign-off exist.",
      count: operationalSignoffs.length,
      tasks: operationalSignoffs.map((gate) =>
        task({
          id: `signoff-${gate.id}`,
          title: gate.id,
          owner: "agency_admin",
          priority: "high",
          admin_path: "/admin/migration/review",
        }),
      ),
    }),
  ].filter((item) => item.count > 0);

  return {
    kind: "agency_review_queue",
    deployment_mode: "production_review",
    status: lanes.length ? "open" : "complete",
    review_after_deploy: true,
    public_launch_ready: launchReadiness.launch_ready === true,
    summary: {
      open_lanes: lanes.length,
      open_tasks: lanes.reduce((total, item) => total + item.count, 0),
    },
    guardrails: {
      unreviewed_listing_publication: "blocked",
      unreviewed_translation_indexing: "blocked",
      unapproved_customer_messages: "blocked",
      unverified_direct_contact: "blocked",
      legacy_domain_cutover: launchReadiness.launch_ready === true ? "allowed" : "blocked",
    },
    lanes,
  };
}
