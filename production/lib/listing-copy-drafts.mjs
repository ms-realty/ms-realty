import { appendAuditLog, createAuditLogEntry, DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import { HERMES_LISTING_COPY_FIELDS, listingCopyPrompt, validateHermesListingCopyDraft } from "./hermes.mjs";
import { assertHermesChatCompletionsEndpoint, hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";

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

// Which figures the draft is allowed to state, and which of them a broker has
// actually confirmed. A description drawn from an unconfirmed area is not
// wrong to draft — it is wrong to publish without someone noticing, so the
// reviewer is told rather than the draft being refused.
export function approvedListingFacts(seed, record) {
  const property = (seed.properties || []).find((row) => row.id === record.property) || null;
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
  take("area_sqm", record.facts?.area_sqm ?? property?.facts?.primary_area_sqm, "primary_area_sqm");
  take("land_area_sqm", record.facts?.land_area_sqm ?? property?.facts?.land_area_sqm, "land_area_sqm");
  take("bedrooms", record.facts?.bedrooms ?? property?.facts?.bedrooms_count, "bedrooms_count");
  take("floor", record.facts?.floor ?? property?.facts?.floor_number, "floor_number");
  take("total_floors", record.facts?.total_floors ?? property?.facts?.storeys_count, "storeys_count");
  take("location", record.facts?.location);
  take("municipality", record.facts?.municipality);
  take("property_type", property?.property_family || record.facts?.property_type);
  take("offer_type", record.facts?.offer_type);
  return { facts, provenance };
}

export async function createHermesListingCopyDraft(
  seed,
  input,
  { auditLogPath = DEFAULT_AUDIT_LOG_PATH, provider = openAiCompatibleHermesListingCopyProvider(), recordedAt = new Date().toISOString() } = {},
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
      sourceSnapshot: { listing_id: record.id, source_locale: record.source_locale },
    });
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
