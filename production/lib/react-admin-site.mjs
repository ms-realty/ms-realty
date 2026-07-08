import { h, renderStaticElement } from "./react-static-html.mjs";

function metricList(metrics) {
  return h("dl", null, ...metrics.flatMap(([label, value]) => [h("dt", { key: `${label}-dt` }, label), h("dd", { key: `${label}-dd` }, value)]));
}

function LeadInboxBody({ page }) {
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const metrics = [
    ["Leads", page.summary.leads],
    ["Replies queued", page.summary.replies],
    ["SLA reminders", page.summary.leadSlaReminders],
    ["Manager escalations", page.summary.leadSlaManagerEscalations],
    ["Language requests", page.summary.languageRequests],
    ["Viewings", page.summary.viewings],
    ["Saved searches", page.summary.savedSearches],
    ["Seller pipeline", page.summary.sellerPipeline],
  ];
  return h(
    "main",
    {
      "data-kind": "admin-lead-inbox",
      "data-react-admin-ui": "lead-inbox",
      "data-admin-workbench": "crm",
      "data-inbox-layout": "list-detail-action",
      "data-lead-count": page.summary.leads,
      "data-sla-reminders": page.summary.leadSlaReminders,
      "data-admin-locale": page.workspace.locale,
      "data-interface-locales": page.workspace.interface_locales.join(","),
    },
    h("h1", null, page.workspace.modules.find((module) => module.id === "crm")?.primary_view || "Lead inbox"),
    metricList(metrics),
    h(
      "nav",
      { "aria-label": "Lead queues", "data-lead-queue-tabs": "true" },
      h("button", { type: "button", "data-lead-filter": "all" }, "All"),
      h("button", { type: "button", "data-lead-filter": "needs_reply" }, "Needs reply"),
      h("button", { type: "button", "data-lead-filter": "sla" }, "SLA"),
    ),
    h(
      "section",
      { "aria-label": "CRM leads" },
      h("h2", null, "CRM leads"),
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h("tr", null, h("th", null, "Lead"), h("th", null, "Type"), h("th", null, "Source"), h("th", null, "Language"), h("th", null, "Contact"), h("th", null, "SLA"), h("th", null, "Escalation due"), h("th", null, "Reply")),
        ),
        h(
          "tbody",
          null,
          ...page.leads.map((lead) => {
            const leadSla = leadSlaById.get(lead.lead_id);
            const slaStatus = leadSla?.status || "pending";
            const brokerId = lead.broker_assignment?.broker_id || "";
            return h(
              "tr",
              {
                key: lead.lead_id,
                "data-lead-row": "true",
                "data-lead-id": lead.lead_id,
                "data-lead-type": lead.lead_type,
                "data-original-language": lead.original_language,
                "data-admin-locale": lead.admin_locale,
                "data-contact-preference": lead.contact_preference,
                "data-broker-assignment": brokerId,
              },
              h("td", null, h("code", null, lead.lead_id)),
              h("td", null, lead.lead_type),
              h("td", null, lead.source),
              h("td", null, `${lead.original_language} -> ${lead.admin_locale}`),
              h("td", null, lead.contact_preference),
              h("td", { "data-sla-status": slaStatus }, slaStatus.replaceAll("_", " ")),
              h("td", null, leadSla?.manager_escalation_due_at || ""),
              h(
                "td",
                null,
                h(
                  "form",
                  {
                    method: "post",
                    action: "/api/admin/replies",
                    "data-reply-approval-required": "true",
                    "data-hermes-reply-draft": "broker_review_required",
                    "data-original-language": lead.original_language,
                  },
                  h("input", { type: "hidden", name: "leadId", defaultValue: lead.lead_id }),
                  h("input", { type: "hidden", name: "language", defaultValue: lead.original_language }),
                  h("input", { type: "hidden", name: "approved", defaultValue: "true" }),
                  h("input", { type: "hidden", name: "hermesDraft", defaultValue: "true" }),
                  h("label", { "data-show-original-toggle": "true" }, h("input", { type: "checkbox", name: "showOriginal" }), " Show original"),
                  h("label", null, "Reviewer ", h("input", { name: "reviewer", required: true, autoComplete: "name" })),
                  h("label", null, "Reviewed reply ", h("textarea", { name: "reviewedReply", required: true })),
                  h("button", { type: "submit" }, "Queue reply"),
                ),
              ),
            );
          }),
        ),
      ),
    ),
    h(
      "section",
      { "aria-label": "Language requests" },
      h("h2", null, "Language requests"),
      h("ul", null, ...page.languageRequests.map((request) => h("li", { key: `${request.requested_locale}-${request.fallback_locale}` }, `${request.requested_locale} -> ${request.fallback_locale}`))),
    ),
  );
}

function editorInputFor(field, value) {
  if (field === "description") return h("textarea", { name: field, defaultValue: value });
  return h("input", { name: field, defaultValue: value });
}

function ListingEditorBody({ page }) {
  const facts = page.listing.facts || {};
  const staleTranslations = page.translationTasks.filter((task) => task.status === "stale");
  return h(
    "main",
    {
      "data-kind": "admin-listing-editor",
      "data-react-admin-ui": "listing-editor",
      "data-admin-workbench": "cms",
      "data-editor-layout": "facts-translations-quality",
      "data-cms-status": page.listing.cms_status,
      "data-schema-ready": page.listing.seo?.schema_present ? "true" : "false",
      "data-stale-translation-count": staleTranslations.length,
      "data-listing-id": page.listing.id,
      "data-admin-locale": page.workspace.locale,
    },
    h("h1", null, "Property editor"),
    h("p", null, `${page.listing.source_domain} ${page.listing.source_locale}`),
    h(
      "nav",
      { "aria-label": "Editor sections", "data-editor-tabs": "true" },
      h("a", { href: "#listing-facts", "data-editor-tab": "facts" }, "Facts"),
      h("a", { href: "#listing-translations", "data-editor-tab": "translations" }, "Translations"),
      h("a", { href: "#listing-media", "data-editor-tab": "media" }, "Media"),
      h("a", { href: "#listing-quality", "data-editor-tab": "quality" }, "Quality"),
    ),
    h(
      "form",
      { id: "listing-facts", method: "post", action: "/api/admin/listings/edit", "data-editor-form": "listing", "data-editor-panel": "facts" },
      h("input", { type: "hidden", name: "listingId", defaultValue: page.listing.id }),
      h("label", null, "Editor ", h("input", { name: "editor", required: true, autoComplete: "name" })),
      ...page.editableFields.map((field) =>
        h("label", { key: field }, `${field.replaceAll("_", " ")} `, editorInputFor(field, facts[field] ?? "")),
      ),
      h("button", { type: "submit" }, "Save source edit"),
    ),
    h(
      "section",
      { id: "listing-translations", "aria-label": "Translation state", "data-translation-panel": "true" },
      h("h2", null, "Translation state"),
      h(
        "ul",
        null,
        ...(page.listing.translations || []).map((translation) =>
          h(
            "li",
            { key: `${translation.locale}-${translation.status}`, "data-translation-locale": translation.locale, "data-translation-status": translation.status },
            `${translation.locale}: ${translation.status}`,
          ),
        ),
        ...staleTranslations.map((task) => {
          const locale = task.target_locale || task.locale;
          return h("li", { key: `${locale}-stale`, "data-translation-locale": locale, "data-translation-status": "stale" }, `${locale} stale`);
        }),
      ),
    ),
    h(
      "section",
      {
        id: "listing-media",
        "aria-label": "Media review",
        "data-media-review-panel": "true",
        "data-tour-review-status": page.listing.tour?.available ? "available" : "review_required",
      },
      h("h2", null, "Media review"),
      metricList([
        ["Media assets", (page.listing.media || []).length],
        ["Public tour", page.listing.tour?.available ? "available" : "review required"],
      ]),
    ),
    h(
      "section",
      { id: "listing-quality", "aria-label": "Quality", "data-quality-panel": "true" },
      h("h2", null, "Quality"),
      metricList([
        ["CMS status", page.listing.cms_status],
        ["Schema", page.listing.seo?.schema_present ? "present" : "missing"],
      ]),
    ),
  );
}

function MigrationReviewBody({ page }) {
  const gaps = page.dashboard.metadata_gaps || {};
  const metrics = [
    ["URLs", page.routeMap.total],
    ["Review required", page.routeMap.reviewRequired],
    ["Mapped listings", page.routeMap.mappedListings],
    ["Deployable preview", page.deployablePreview.length],
    ["Missing descriptions", gaps.missing_description],
    ["Media rows", page.dashboard.media_reconciliation?.media_rows],
  ];
  const seoSources = ["search_console", "yandex_webmaster", "backlinks"];

  return h(
    "main",
    {
      "data-kind": "admin-migration-review",
      "data-react-admin-ui": "migration-review",
      "data-admin-workbench": "migration",
      "data-admin-locale": page.workspace.locale,
      "data-review-required": page.routeMap.reviewRequired,
      "data-launch-readiness-endpoint": page.launchReadinessEndpoint,
      "data-launch-readiness-export-endpoint": page.launchReadinessExportEndpoint,
      "data-launch-input-checklist-endpoint": page.launchInputChecklistEndpoint,
      "data-preflight-reports-endpoint": page.preflightReportsEndpoint,
      "data-live-service-provisioning-endpoint": page.liveServiceProvisioningEndpoint,
      "data-payload-runtime-endpoint": page.payloadRuntimeEndpoint,
      "data-cms-collections-endpoint": page.cmsCollectionsEndpoint,
      "data-payload-collections-endpoint": page.payloadCollectionsEndpoint,
    },
    h("h1", null, "Migration review"),
    h(
      "nav",
      { "aria-label": "Launch evidence" },
      h("a", { href: page.launchReadinessEndpoint }, "Launch readiness JSON"),
      h("a", { href: page.launchInputChecklistEndpoint }, "Launch input checklist"),
      h("a", { href: page.preflightReportsEndpoint }, "Preflight reports JSON"),
      h("a", { href: page.liveServiceProvisioningEndpoint }, "Live service provisioning JSON"),
      h("a", { href: page.payloadRuntimeEndpoint }, "Payload runtime JSON"),
      h("a", { href: page.cmsCollectionsEndpoint }, "CMS collection contracts"),
      h("a", { href: page.payloadCollectionsEndpoint }, "Payload collection configs"),
    ),
    h(
      "form",
      { method: "post", action: page.launchReadinessExportEndpoint },
      h("button", { type: "submit" }, "Export launch readiness"),
    ),
    metricList(metrics),
    h(
      "section",
      { "aria-label": "Approvable listing redirects" },
      h("h2", null, "Approvable listing redirects"),
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, "Old URL"), h("th", null, "Target"), h("th", null, "Locale"), h("th", null, "Approval"))),
        h(
          "tbody",
          null,
          ...(page.routeMap.approvableSample || []).map((route) =>
            h(
              "tr",
              { key: route.old_url, "data-approvable-listing": "true" },
              h("td", null, h("code", null, route.old_url)),
              h("td", null, h("code", null, route.target_path)),
              h("td", null, route.target_locale),
              h(
                "td",
                null,
                h(
                  "form",
                  { method: "post", action: "/api/admin/redirect-approvals" },
                  h("input", { type: "hidden", name: "oldUrl", defaultValue: route.old_url }),
                  h("input", { type: "hidden", name: "equivalentContent", defaultValue: "true" }),
                  h("label", null, "Reviewer ", h("input", { name: "reviewer", required: true, autoComplete: "name" })),
                  h("label", null, "Reason ", h("input", { name: "reason", defaultValue: "Reviewed same-content route mapping." })),
                  h("button", { type: "submit" }, "Approve 301"),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      "section",
      {
        "aria-label": "Redirect approval CSV import",
        "data-redirect-import-endpoint": page.redirectApprovalImport.endpoint,
        "data-redirect-export-endpoint": page.redirectApprovalImport.exportEndpoint,
        "data-redirect-workbook-endpoint": page.redirectApprovalImport.workbookEndpoint,
        "data-pending-redirect-workbook-endpoint": page.redirectApprovalImport.pendingWorkbookEndpoint,
      },
      h("h2", null, "Import reviewed redirect CSV"),
      h("p", null, h("a", { href: page.redirectApprovalImport.pendingWorkbookEndpoint }, "Download pending workbook")),
      h("form", { method: "post", action: page.redirectApprovalImport.endpoint }, h("textarea", { name: "csv", rows: "5", required: true }), h("button", { type: "submit" }, "Import CSV")),
      h("form", { method: "post", action: page.redirectApprovalImport.exportEndpoint }, h("button", { type: "submit" }, "Export deployable redirects")),
    ),
    h(
      "section",
      {
        "aria-label": "External SEO evidence",
        "data-seo-import-endpoint": page.seoEvidence.importEndpoint,
        "data-seo-template-endpoint": page.seoEvidence.templateEndpoint,
      },
      h("h2", null, "External SEO evidence"),
      h("p", null, `Missing required sources: ${page.seoEvidence.missingRequiredSources.join(", ") || "none"}`),
      h(
        "ul",
        null,
        ...seoSources.map((source) => {
          const status = page.seoEvidence.sources[source];
          return h(
            "li",
            { key: source },
            h("strong", null, source),
            `: ${status.status} / matched ${status.matched_rows} / ${status.row_count} `,
            h("a", { href: `${page.seoEvidence.templateEndpoint}?source=${source}` }, "CSV template"),
          );
        }),
      ),
      h(
        "form",
        { method: "post", action: page.seoEvidence.importEndpoint },
        h(
          "label",
          null,
          "Source ",
          h(
            "select",
            { name: "source", required: true },
            h("option", { value: "search_console" }, "Search Console"),
            h("option", { value: "yandex_webmaster" }, "Yandex Webmaster"),
            h("option", { value: "backlinks" }, "Backlinks"),
          ),
        ),
        h("textarea", { name: "csv", rows: "5", required: true }),
        h("button", { type: "submit" }, "Import SEO CSV"),
      ),
    ),
    h(
      "section",
      {
        "aria-label": "Listing quality queue",
        "data-quality-workbook-endpoint": page.listingQualityWorkbookEndpoint,
        "data-quality-review-draft-endpoint": page.listingQualityReviewDraftEndpoint,
        "data-quality-import-endpoint": page.listingQualityImportEndpoint,
        "data-quality-affected-listings": page.listingQuality?.summary?.affected_listings || 0,
      },
      h("h2", null, "Listing quality queue"),
      h("p", null, h("a", { href: page.listingQualityWorkbookEndpoint }, "Download listing quality workbook")),
      h("p", null, h("a", { href: page.listingQualityReviewDraftEndpoint }, "Download listing quality review draft")),
      h("form", { method: "post", action: page.listingQualityImportEndpoint }, h("textarea", { name: "csv", rows: "5", required: true }), h("button", { type: "submit" }, "Import listing quality CSV")),
      h("p", null, `Issues: ${JSON.stringify(page.listingQuality?.summary?.issue_counts || {})}`),
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, "Listing"), h("th", null, "Locale"), h("th", null, "Location"), h("th", null, "Issues"), h("th", null, "Public photos"), h("th", null, "Missing alt"), h("th", null, "Review-gated media"))),
        h(
          "tbody",
          null,
          ...(page.listingQuality?.rows || []).map((row) =>
            h(
              "tr",
              { key: row.listing_id, "data-quality-listing": "true" },
              h("td", null, h("a", { href: row.editor_path }, row.listing_id)),
              h("td", null, row.source_locale),
              h("td", null, row.location || "missing"),
              h("td", null, row.issues.join(", ")),
              h("td", null, row.public_gallery_assets),
              h("td", null, row.missing_alt_text_assets),
              h("td", null, row.review_gated_assets),
            ),
          ),
        ),
      ),
    ),
    h(
      "section",
      { "aria-label": "Approved redirects" },
      h("h2", null, "Approved redirects"),
      h(
        "ul",
        null,
        ...page.redirectApprovals.map((approval) =>
          h("li", { key: approval.old_url }, h("code", null, approval.old_url), " -> ", h("code", null, approval.target_path)),
        ),
      ),
    ),
  );
}

export function renderReactAdminBody(page) {
  if (page.kind === "admin_lead_inbox") return renderStaticElement(h(LeadInboxBody, { page }));
  if (page.kind === "admin_listing_editor") return renderStaticElement(h(ListingEditorBody, { page }));
  if (page.kind === "admin_migration_review") return renderStaticElement(h(MigrationReviewBody, { page }));
  return "";
}
