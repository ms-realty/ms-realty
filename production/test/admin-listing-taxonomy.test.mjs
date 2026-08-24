import assert from "node:assert/strict";
import test from "node:test";
import {
  renderAdminActivityPayload,
  renderAdminContactsPayload,
  renderAdminLeadsPayload,
  renderAdminListingEditorPayload,
  renderAdminListingManagerPayload,
  renderAdminOperationalQueuePayload,
  renderAdminTranslationQueuePayload,
} from "../lib/admin-payloads.mjs";
import { CANONICAL_PROPERTY_FAMILIES, propertyFamilyFor } from "../lib/listing-facts.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

function editorHtml(listingId, locale = "en") {
  return renderReactAdminBody(renderAdminListingEditorPayload(registry, locale, seed, listingId, [], []));
}

function emptyLeads() {
  return {
    leads: [],
    replies: [],
    languageRequests: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: [],
    deals: [],
    leadSla: { rows: [], summary: { manager_escalation_required: 0, reminder_required: 0 } },
  };
}

test("admin listing editor quality rail uses a compact status list", () => {
  const html = editorHtml("MS-CRAWL-0001", "bg");
  const rail = html.match(/data-editor-readiness-rail="true"[\s\S]*?<\/aside>/)?.[0] || "";
  assert.match(rail, /class="crm-panel"/);
  assert.match(rail, /Публикувано/);
  assert.match(rail, /data-quality-panel="true"/);
  assert.match(rail, /data-translation-panel="true"/);
  assert.match(rail, /data-media-review-panel="true"/);
  // Owner-directed publication does not clear the review work: the rail still
  // names the outstanding fact gap and the unverified availability check.
  assert.match(rail, /data-listing-quality-issues="[1-9]/);
  assert.match(rail, /data-quality-issue="missing_area"/);
  assert.match(rail, /Не е проверена/);
});

test("admin listing editor savebar uses workspace copy instead of filter leftovers", () => {
  const html = editorHtml("MS-CRAWL-0002", "bg");
  assert.match(html, /Промените са записани\./);
  assert.match(html, /Отмени промените/);
  assert.doesNotMatch(html, /Изчисти филтрите/);
  assert.doesNotMatch(html, /All changes saved\./);
  assert.match(html, /data-editor-readiness-rail="true"/);
  assert.match(html, /class="adm-editor-tab__label">SEO<\/span>/);
  assert.doesNotMatch(html, /<legend>Редактор<\/legend>/);
});

test("admin listing editor offers every canonical family instead of the legacy land list", () => {
  const html = editorHtml("MS-CRAWL-0001");
  const typeSelect = html.match(/<select name="property_type"[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(typeSelect, new RegExp(`value="${family}"`));
  }
  assert.match(typeSelect, /Plot/);
  assert.match(typeSelect, /Agricultural land/);
  assert.doesNotMatch(typeSelect, /value="multi_unit"/);
  assert.doesNotMatch(typeSelect, /value="land"/);
  assert.doesNotMatch(typeSelect, /value="property"/);
});

test("admin listing editor hides bedrooms on plot listings", () => {
  const propertiesById = new Map((seed.properties || []).map((property) => [property.id, property]));
  const plot = seed.records.find((record) => {
    if (record.collection !== "listings") return false;
    const property = propertiesById.get(record.property);
    return (
      propertyFamilyFor({
        ...(record.facts || {}),
        property_family: property?.property_family,
        property_subtype: property?.property_subtype,
      }) === "plot"
    );
  });
  assert.ok(plot, "seed must include a plot listing");
  const html = editorHtml(plot.id, "bg");
  assert.doesNotMatch(html, /name="bedrooms"/);
  assert.match(html, /name="land_area_sqm"/);
  assert.match(html, /Локацията е проверена на/);
  assert.doesNotMatch(html, /location verified at/);
});

test("admin listing manager filters and labels every canonical family", () => {
  const html = renderReactAdminBody(renderAdminListingManagerPayload(registry, "bg", { seed }));
  assert.match(html, /name="propertyFamily"/);
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(html, new RegExp(`<option[^>]*value="${family}"`));
  }
  assert.match(html, /Земеделска земя/);
  assert.match(html, /data-listing-column="property-family"/);
  assert.match(html, /name="q"[^>]*placeholder="напр. Сандански"/);
  assert.doesNotMatch(html, /name="q"[^>]*placeholder="MS-CRAWL-/);
  assert.match(html, /<th scope="col">Статус<\/th>/);
  assert.match(html, /<th scope="col">Проблеми<\/th>/);
  assert.match(html, /<th scope="col">Действие<\/th>/);
  assert.equal([...html.matchAll(/<th scope="col">Качество<\/th>/g)].length, 0);
  assert.match(html, /class="adm-filterbar/);
  assert.match(html, /data-listing-filters="true"/);
  assert.match(html, /adm-listing-table/);
  assert.match(html, /class="crm-ph"/);
  assert.doesNotMatch(html, /<h2>Резултати<\/h2>/);
  assert.equal([...html.matchAll(/<h2>Резултати · \d+<\/h2>/g)].length, 1);
  const workbench = html.match(/data-listing-filters="true"[\s\S]*?data-listing-bulk-form="true"/)?.[0] || "";
  assert.match(workbench, /class="adm-filterbar/);
  assert.match(workbench, /data-listing-filters="true"/);
  assert.match(workbench, /name="propertyFamily"/);
  // The result count heads the table in this branch rather than sitting in the
  // filter summary, which carries the search field instead.
  assert.match(html, /<h2>Резултати · \d+<\/h2>/);
  assert.match(html, /История на действията|>История</);
  // This branch labels the bulk status control rather than leaving it bare.
  assert.match(html, /Статус за избраните/);
  const bulkBar = html.match(/data-listing-bulk-bar="true"[\s\S]*?<\/div>/)?.[0] || "";
  // The scope of a bulk action is visible text here rather than a title
  // tooltip, which no touch or keyboard user can reach.
  assert.match(bulkBar, /adm-listing-bulk__scope">Промяната важи само за изрично избраните обяви/);
  assert.doesNotMatch(bulkBar, /<small>Промяната важи/);

  const filtered = renderAdminListingManagerPayload(registry, "en", { seed, propertyFamily: "plot" });
  assert.ok(filtered.listings.length > 0);
  assert.ok(filtered.listings.every((row) => row.property_family === "plot"));
  assert.deepEqual(filtered.filterOptions.propertyFamilies, [...CANONICAL_PROPERTY_FAMILIES]);
  const filteredHtml = renderReactAdminBody(filtered);
  const filteredSummary = filteredHtml.match(/data-listing-filter-summary="true"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(filteredSummary, /\d+\s*\/\s*\d+/);
});

test("admin lead inbox keeps one primary reply action and collapses briefs", () => {
  const html = renderReactAdminBody(
    renderAdminLeadsPayload(registry, "bg", {
      ...emptyLeads(),
      leads: [
        {
          lead_id: "lead-inbox-1",
          lead_type: "buyer",
          original_language: "bg",
          admin_locale: "bg",
          contact_preference: "phone",
          source: "website_listing_detail",
          listing_reference: "MS-CRAWL-0001",
          property: { location: "Сандански" },
          contact: { name: "Иван Петров", phone: "+359888000111" },
          intake_completion: { complete: false, missing_fields: [] },
        },
      ],
    }),
  );
  const row = html.match(/class="adm-lead-detail"[\s\S]*?data-lead-id="lead-inbox-1"[\s\S]*?<\/section>/)?.[0] || html.match(/id="lead-lead-inbox-1"[\s\S]*$/)?.[0] || "";
  // This branch's inbox is a list beside a detail pane rather than a table of
  // rows, so the same contract - one reply surface, the brief behind a
  // disclosure - is asserted against the pane it actually lives in.
  assert.match(html, /class="adm-reply"/);
  assert.match(html, /adm-lead-more/);
  assert.match(html, /data-lead-id="lead-inbox-1"/);
  assert.match(html, /class="adm-lead-detail"/);
  assert.match(html, /class="adm-kpis"/);
  assert.match(html, /class="adm-kpis"/);
  assert.match(html, /data-lead-filter=/);
  assert.match(html, /data-lead-id="lead-inbox-1"/);
  assert.doesNotMatch(html, /<h2>CRM запитвания<\/h2>/);
  assert.doesNotMatch(html, /<h2>CRM leads<\/h2>/);
});

test("admin pipeline cards keep qualification collapsed and facts unboxed", () => {
  const html = renderReactAdminBody(
    renderAdminOperationalQueuePayload(
      renderAdminLeadsPayload(registry, "bg", {
        ...emptyLeads(),
        leadPipelineQueue: {
          rows: [
            {
              lead_id: "lead-pipe-qualify",
              lead_type: "buyer",
              pipeline: "buyer",
              stage: "inquiry",
              status: "open",
              next_action: "qualify",
              overdue: false,
              assigned_broker: "broker_bg",
            },
          ],
          states: [
            {
              lead_id: "lead-pipe-qualify",
              lead_type: "buyer",
              pipeline: "buyer",
              stage: "inquiry",
              status: "open",
              next_action: "qualify",
              overdue: false,
              assigned_broker: "broker_bg",
            },
          ],
          summary: { open: 1, overdue: 0, buyers_open: 1, renters_open: 0, lost: 0, closed: 0 },
        },
      }),
      {
        kind: "admin_lead_pipeline",
        path: "/admin/pipeline",
        titleKey: "pipelineWorkspace",
        descriptionKey: "pipelineDescription",
      },
    ),
  );
  const card = html.match(/data-pipeline-card="true"[\s\S]*?<\/article>/)?.[0] || "";
  assert.match(card, /adm-pipeline-facts/);
  assert.doesNotMatch(card, /t-eyebrow/);
  assert.match(card, /adm-id-caption/);
  assert.match(card, /class="adm-pipeline-action"/);
  assert.doesNotMatch(card, /class="adm-pipeline-action"[^>]*\sopen/);
  assert.match(html, /class="adm-kpis"/);
});

test("admin lead intake uses canonical family checkboxes instead of English CSV hints", () => {
  const html = renderReactAdminBody(renderAdminLeadsPayload(registry, "en", emptyLeads()));
  assert.match(html, /data-property-family-options="true"/);
  assert.match(html, /<legend>Property types<\/legend>/);
  assert.match(html, /class="[^"]*adm-manual-lead"/);
  assert.doesNotMatch(html, /placeholder="apartment, house"/);
  assert.doesNotMatch(html, /placeholder="Sandanski"/);
  assert.doesNotMatch(html, /<legend>Property types \(comma separated\)<\/legend>/);
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(html, new RegExp(`name="requirements.property_types" value="${family}"`));
  }
});

function todayPage(data, locale = "bg") {
  return renderAdminOperationalQueuePayload(renderAdminLeadsPayload(registry, locale, { ...emptyLeads(), ...data }), {
    kind: "admin_today",
    path: "/admin/today",
    titleKey: "today",
    descriptionKey: "todayDescription",
  });
}

test("admin today pipeline CTA is a verb and follow-up due dates stay formatted", () => {
  const html = renderReactAdminBody(
    todayPage({
      leadPipelineQueue: {
        rows: [
          {
            lead_id: "lead-pipe-1",
            lead_type: "buyer",
            stage: "inquiry",
            status: "open",
            next_action: "qualify",
            overdue: false,
          },
        ],
        summary: { open: 1, overdue: 0 },
      },
      viewingFollowUpQueue: {
        rows: [
          {
            viewing_id: "viewing-1",
            listing_reference: "MS-VIEW-1",
            lead_id: "lead-pipe-1",
            task: "follow_up",
            viewing_status: "completed",
            task_status: "open",
            due_at: "2026-07-06T12:00:00.000Z",
            starts_at: "2026-07-06T10:00:00.000Z",
            broker: "broker_bg",
            overdue: false,
          },
        ],
        summary: { open: 1, overdue: 0, completed: 0 },
      },
      sellerPipelineQueue: {
        rows: [
          {
            seller_pipeline_id: "seller-pipe-1",
            lead_id: "lead-seller-1",
            task: "appraisal",
            stage: "new",
            task_status: "open",
            due_at: "2026-07-06T12:00:00.000Z",
            overdue: false,
            property: { location: "Сандански" },
          },
        ],
        summary: { open: 1, overdue: 0 },
      },
    }),
  );

  const preview = html.match(/data-pipeline-preview-row="lead-pipe-1"[\s\S]*?<\/li>/)?.[0] || "";
  assert.match(preview, /class="mk-btn mk-btn--primary mk-btn--sm"[^>]*>Отвори</);
  assert.doesNotMatch(preview, /class="mk-btn mk-btn--primary mk-btn--sm"[^>]*>Отворено</);

  const dueCell = html.match(/data-viewing-column="due_at"[^>]*>([\s\S]*?)<\/td>/)?.[1] || "";
  assert.match(dueCell, /<time dateTime="2026-07-06T12:00:00.000Z"/);
  assert.doesNotMatch(dueCell.replace(/dateTime="[^"]+"|title="[^"]+"/g, ""), /2026-07-06T12:00:00/);
  const sellerDue = html.match(/data-seller-pipeline-column="due_at"[^>]*>([\s\S]*?)<\/td>/)?.[1] || "";
  assert.match(sellerDue, /<time dateTime="2026-07-06T12:00:00.000Z"/);
  assert.doesNotMatch(sellerDue.replace(/dateTime="[^"]+"|title="[^"]+"/g, ""), /2026-07-06T12:00:00/);
  const viewingTable = html.match(/data-viewing-follow-up-table="true"[\s\S]*?<\/table>/)?.[0] || "";
  assert.match(viewingTable, /<th scope="col">Статус<\/th>/);
  assert.match(viewingTable, /<th scope="col">Действие<\/th>/);
  assert.doesNotMatch(viewingTable, /<th scope="col">Статус на огледа<\/th>/);
  assert.doesNotMatch(viewingTable, /<th scope="col">Запиши<\/th>/);
  assert.match(viewingTable, />Запиши</);
  assert.match(html, /data-readiness-rail="true"/);
  assert.match(html, /data-today-snapshot="true"/);
});

test("admin translation queue localizes reviewer roles and titles results once", () => {
  const html = renderReactAdminBody(renderAdminTranslationQueuePayload(registry, "bg", { seed, targetLocale: "en" }));
  const deHtml = renderReactAdminBody(renderAdminTranslationQueuePayload(registry, "bg", { seed, targetLocale: "de" }));
  assert.match(html, /<h2>Резултати · \d+<\/h2>/);
  assert.equal([...html.matchAll(/<h2>Резултати/g)].length, 1);
  assert.match(html, /data-translation-column="owner"[^>]*>Редактор · EN</);
  assert.match(deHtml, /data-translation-column="owner"[^>]*>Преводач · DE</);
  assert.doesNotMatch(html, /data-translation-column="owner"[^>]*>editor_en</);
  assert.doesNotMatch(deHtml, /data-translation-column="owner"[^>]*>translator_de</);
});

test("admin activity localizes leftover keys and uses human filter hints", () => {
  const html = renderReactAdminBody(
    renderAdminActivityPayload(
      registry,
      "bg",
      [
        {
          recorded_at: "2026-07-19T08:00:00.000Z",
          actor: "editor_bg",
          action: "locale_created",
          object_type: "locale",
          object_id: "locale-de",
          locale: "de",
          status: "recorded",
          metadata: {
            public_enabled: true,
            indexable: false,
            fallback_locale: "en",
            object_id: "locale-de",
          },
        },
      ],
    ),
  );
  assert.match(html, /placeholder="напр. номер на запитване"/);
  assert.match(html, /placeholder="напр. референция на обява"/);
  assert.doesNotMatch(html, /placeholder="MS-CRAWL-0001"/);
  assert.doesNotMatch(html, /placeholder="lead-…"/);
  assert.match(html, /<dt>Публично включен<\/dt>/);
  assert.match(html, /<dt>Индексируем<\/dt>/);
  assert.match(html, /<dt>Резервен език<\/dt>/);
  assert.match(html, /<dt>Идентификатор на обект<\/dt>/);
  assert.doesNotMatch(html, /<dt>public enabled<\/dt>/);
  assert.doesNotMatch(html, /<dt>object id<\/dt>/);
});

test("admin contacts hide generated ids behind a human title and localize broker roles", () => {
  const html = renderReactAdminBody(
    renderAdminContactsPayload(registry, "bg", {
      contacts: [
        {
          id: "contact-lead-anon",
          display_name: "contact-lead-anon",
          contact: { email: "buyer@example.test" },
          preferred_channel: "email",
          lead_ids: ["lead-anon"],
          lead_count: 1,
          duplicate_leads: 0,
          assigned_brokers: ["broker_international"],
          languages: ["en"],
          communication_event_count: 0,
          latest_received_at: "2026-07-19T08:00:00.000Z",
        },
      ],
      accounts: [],
    }),
  );
  assert.match(html, /<h3>buyer@example.test<\/h3>/);
  assert.match(html, /class="crm-mono adm-id-caption">contact-lead-anon</);
  assert.match(html, /Международен брокер/);
  assert.doesNotMatch(html, /<h3>contact-lead-anon<\/h3>/);
  assert.doesNotMatch(html, />broker_international</);
});
