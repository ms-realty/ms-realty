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

export function renderReactAdminBody(page) {
  if (page.kind === "admin_lead_inbox") return renderStaticElement(h(LeadInboxBody, { page }));
  if (page.kind === "admin_listing_editor") return renderStaticElement(h(ListingEditorBody, { page }));
  return "";
}
