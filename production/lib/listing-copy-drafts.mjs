import { appendAuditLog, createAuditLogEntry, DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import { HERMES_LISTING_COPY_FIELDS, listingCopyPrompt, validateHermesListingCopyDraft } from "./hermes.mjs";
import { assertHermesChatCompletionsEndpoint, hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";
import { canAdminAccess } from "./admin-auth.mjs";
import { withPayloadTransaction } from "./listing-draft-service.mjs";
import { derivePrimaryAreaSqm, primaryAreaFieldFor } from "./listing-facts.mjs";
import { listingDraftRevision, loadPayloadCmsImportRuntime } from "./payload-cms-import.mjs";

// Hermes could draft a translation of a listing and a reply to a lead. It could
// not draft the listing's own copy, which is the value a broker rewrites most
// often. This is the same shape as the reply drafter: prompt from approved
// facts, call an injectable provider, validate, audit, return. Nothing here can
// publish; the returned draft says so and a human still has to accept it.

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return JSON.parse(String(value || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

function nonEmptyInvocation(value) {
  if (Array.isArray(value)) return value.some((entry) => nonEmptyInvocation(entry));
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

function providerRequestBody(prompt, model) {
  return {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    tool_choice: "none",
    messages: [
      {
        role: "system",
        content:
          "You are Hermes Agent. Draft listing copy only. Never publish, never mark anything indexable, never change a price, never invoke a tool. Use only the approved facts supplied. Return exactly one JSON object with text and citations.",
      },
      { role: "user", content: JSON.stringify(prompt) },
    ],
  };
}

export function openAiCompatibleHermesListingCopyProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = hermesProviderConfigFromEnv(env);
  if (config.mode !== "self_hosted") throw new Error("Hermes listing copy drafts require self_hosted provider mode");
  if (!config.endpoint) throw new Error("HERMES_CHAT_COMPLETIONS_URL is required");
  assertHermesChatCompletionsEndpoint(config.endpoint);
  if (!config.has_api_key) throw new Error("HERMES_API_KEY is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for the Hermes listing copy provider");

  return async function callHermesListingCopy(prompt) {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.HERMES_API_KEY}` },
      body: JSON.stringify(providerRequestBody(prompt, config.model)),
    });
    if (!response.ok) throw new Error(`Hermes listing copy provider failed: ${response.status}`);
    const payload = await response.json();
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Hermes listing copy provider returned no message");
    if (nonEmptyInvocation(message.tool_calls) || nonEmptyInvocation(message.function_call)) {
      throw new Error("Hermes listing copy provider returned a tool call despite tool_choice none");
    }
    return parseJsonObject(message.content);
  };
}

function listingFor(seed, listingId) {
  const record = (seed.records || []).find((row) => row.collection === "listings" && row.id === listingId);
  if (!record) throw new Error("Listing copy draft requires a known listingId");
  return record;
}

// Read the requested draft and its shared property together. The catalogue
// projection is cached and may contain imported fallback rows; neither is an
// authority for a new model request.
export async function readHermesListingCopySource(listingId, { env = process.env, payload = null, principal } = {}) {
  if (!principal?.id || !canAdminAccess(principal, "content:write")) {
    throw Object.assign(new Error("Listing copy requires content write access"), { status: 403, capability: "content:write" });
  }
  const id = String(listingId || "").trim();
  if (!id || id.length > 80) throw new Error("Listing copy draft requires a known listingId");
  const relationId = (value) => String(value && typeof value === "object" ? value.id || "" : value || "").trim();
  try {
    const runtime = await loadPayloadCmsImportRuntime({ env, payload });
    return await withPayloadTransaction(runtime, { principal, accessMode: "read only", isolationLevel: "repeatable read" }, async (req) => {
      const read = (collection, documentId) => runtime.findByID({
        collection, id: documentId, depth: 0, draft: collection === "listings", overrideAccess: false, disableErrors: true, req,
      });
      const listing = await read("listings", id);
      if (!listing) {
        throw Object.assign(new Error("The requested listing is unavailable to this operator"), { status: 404, code: "listing_draft_not_found" });
      }
      if (String(listing.id) !== id) throw new Error("Payload returned a different listing");
      const propertyId = relationId(listing.property);
      if (!propertyId) throw new Error("The listing's shared property is unavailable");
      const property = await read("properties", propertyId);
      if (!property || String(property.id) !== propertyId) throw new Error("The listing's shared property is unavailable");
      const locale = await read("locales", relationId(listing.source_locale));
      if (!locale?.code) throw new Error("The listing's source locale is unavailable");
      return {
        records: [{
          ...listing,
          collection: "listings",
          property: propertyId,
          source_locale: locale.code,
          draft_revision: listingDraftRevision(listing, property),
        }],
        properties: [property],
      };
    });
  } catch (error) {
    if (error?.status === 403) {
      throw Object.assign(new Error("The requested listing source is unavailable to this operator"), {
        status: 403, capability: "content:write", cause: error,
      });
    }
    if (error?.code === "listing_draft_not_found") throw error;
    throw Object.assign(new Error("The current Payload listing source is unavailable. Try again when the source is restored."), {
      status: 503, code: "payload_draft_unavailable", cause: error,
    });
  }
}

// Which figures the draft is allowed to state, and which of them a broker has
// actually confirmed. A description drawn from an unconfirmed area is not
// wrong to draft — it is wrong to publish without someone noticing, so the
// reviewer is told rather than the draft being refused.
export function approvedListingFacts(seed, record) {
  const property = (seed.properties || []).find((row) => row.id === record.property) || null;
  const currentPropertyFacts = property ? { ...property.facts, property_family: property.property_family } : null;
  const propertyFact = (field, legacyValue) => currentPropertyFacts ? currentPropertyFacts[field] : legacyValue;
  const areaField = currentPropertyFacts ? primaryAreaFieldFor(currentPropertyFacts) : null;
  const floorsField = ["house", "hotel"].includes(property?.property_family) ? "storeys_count" : "total_floors";
  const verified = new Set(
    (property?.fact_verification || []).filter((row) => row.state === "broker_verified").map((row) => row.field),
  );
  const facts = {};
  const provenance = {};
  const take = (key, value, verifiedKey) => {
    if (value === null || value === undefined || value === "") return;
    facts[key] = value;
    provenance[key] = verified.has(verifiedKey || key) ? "broker_verified" : "source_stated";
  };
  take("reference", record.id);
  take("price_eur", record.facts?.price_eur);
  take("area_sqm", currentPropertyFacts ? derivePrimaryAreaSqm(currentPropertyFacts) : record.facts?.area_sqm, areaField || "primary_area_sqm");
  take("land_area_sqm", propertyFact("land_area_sqm", record.facts?.land_area_sqm), "land_area_sqm");
  take("bedrooms", propertyFact("bedrooms_count", record.facts?.bedrooms), "bedrooms_count");
  take("floor", propertyFact("floor_number", record.facts?.floor), "floor_number");
  take("total_floors", propertyFact(floorsField, record.facts?.total_floors), floorsField);
  take("location", propertyFact("location_label", record.facts?.location), "location_label");
  take("municipality", propertyFact("municipality", record.facts?.municipality));
  take("property_type", propertyFact("property_family", record.facts?.property_type), "property_family");
  take("offer_type", record.facts?.offer_type);
  return { facts, provenance };
}

export async function createHermesListingCopyDraft(
  seed,
  input,
  { auditLogPath = DEFAULT_AUDIT_LOG_PATH, provider = openAiCompatibleHermesListingCopyProvider(), recordedAt = new Date().toISOString(), assertSourceCurrent = null } = {},
) {
  const field = String(input.field || "").trim();
  if (!HERMES_LISTING_COPY_FIELDS.includes(field)) {
    throw new Error(`Listing copy draft field must be one of: ${HERMES_LISTING_COPY_FIELDS.join(", ")}`);
  }
  const record = listingFor(seed, input.listingId);
  const { facts, provenance } = approvedListingFacts(seed, record);
  const locale = String(input.locale || record.source_locale || "bg").trim();
  const prompt = listingCopyPrompt({
    field,
    locale,
    listingReference: record.id,
    sourceUrl: record.source_url || null,
    propertyFacts: facts,
    sourceText: String(input.sourceText || "").trim(),
  });

  const audit = (draft, error) => {
    if (!auditLogPath) return;
    appendAuditLog(
      createAuditLogEntry(
        {
          action: "hermes_model_call",
          actor: "hermes_listing_copy_worker",
          objectType: "listing_copy_draft",
          objectId: `listing-copy-${record.id}-${field}`,
          locale,
          status: draft ? "persisted" : "rejected",
          metadata: {
            listing_id: record.id,
            ...(record.draft_revision ? { draft_revision: record.draft_revision } : {}),
            field,
            prompt_role: prompt.role,
            can_publish: false,
            human_approval_required: true,
            ...(error ? { rejection: error.message } : {}),
          },
        },
        recordedAt,
      ),
      { filePath: auditLogPath },
    );
  };

  try {
    const output = await provider(prompt);
    const draft = validateHermesListingCopyDraft({
      draft: output,
      field,
      propertyFacts: facts,
      sourceSnapshot: {
        listing_id: record.id,
        source_locale: record.source_locale,
        ...(record.draft_revision ? { draft_revision: record.draft_revision } : {}),
      },
    });
    if (assertSourceCurrent) await assertSourceCurrent(record);
    audit(draft);
    // The reviewer is told which facts the draft leaned on and which of those
    // no broker has confirmed, because that is the part they have to check.
    const used = Object.keys(facts).filter((key) => draft.text.includes(String(facts[key])));
    return {
      ...draft,
      listing_id: record.id,
      locale,
      prompt_role: prompt.role,
      facts_used: used,
      unverified_facts_used: used.filter((key) => provenance[key] !== "broker_verified"),
    };
  } catch (error) {
    audit(null, error);
    throw error;
  }
}
