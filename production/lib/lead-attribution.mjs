// Source and channel attribution for enquiries.
//
// `source` already names the exact form a person used. `channel` names the
// surface family that produced it, so a report can answer "which channel
// converts" without inventing a marketing taxonomy. `first_touch_path` is the
// site-relative path of the page where the visit started.
//
// Privacy boundary, deliberately narrow:
//   * a channel is one of a closed list, never free text;
//   * a first-touch path is a site path only - no origin, no query string, no
//     fragment, no identifiers. A query string is where campaign and visitor
//     ids live, so it is stripped, never stored;
//   * nothing here identifies a visitor beyond what the lead already captures,
//     and none of it is ever placed in a URL.

export const LEAD_CHANNELS = Object.freeze([
  "listing_detail",
  "search_results",
  "home",
  "contact_page",
  "seller_page",
  "buyer_onboarding",
  "guide",
  "broker_direct",
  "unknown",
]);
const CHANNEL_SET = new Set(LEAD_CHANNELS);

// The channel a source belongs to when the submission does not declare one.
const SOURCE_CHANNELS = Object.freeze({
  website_listing_detail: "listing_detail",
  website_search_result: "search_results",
  website_callback_request: "listing_detail",
  website_viewing_request: "listing_detail",
  website_contact_callback: "contact_page",
  website_seller_callback: "seller_page",
  website_seller_valuation: "seller_page",
  website_consultation_request: "contact_page",
  website_buyer_onboarding: "buyer_onboarding",
  broker_phone: "broker_direct",
  broker_viber: "broker_direct",
  broker_whatsapp: "broker_direct",
  broker_email: "broker_direct",
  broker_walk_in: "broker_direct",
  partner_referral: "broker_direct",
});

const MAX_PATH_LENGTH = 200;
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/%]*$/;

export function leadChannelForSource(source) {
  return SOURCE_CHANNELS[String(source || "").trim()] || "unknown";
}

export function normalizeLeadChannel(value, source) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return leadChannelForSource(source);
  if (!CHANNEL_SET.has(text)) throw new Error(`channel must be one of: ${LEAD_CHANNELS.join(", ")}`);
  return text;
}

// A site-relative path with no query, no fragment, and no origin. Anything
// that is not obviously one of our own paths is refused rather than guessed.
export function normalizeFirstTouchPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > MAX_PATH_LENGTH) throw new Error(`firstTouchPath must be ${MAX_PATH_LENGTH} characters or fewer`);
  if (!raw.startsWith("/") || raw.startsWith("//")) throw new Error("firstTouchPath must be a site relative path");
  const path = raw.split("#")[0].split("?")[0];
  if (!path.startsWith("/")) throw new Error("firstTouchPath must be a site relative path");
  if (path.includes("..")) throw new Error("firstTouchPath must not traverse");
  if (!SAFE_PATH.test(path)) throw new Error("firstTouchPath must be a site relative path");
  return path === "/" ? "/" : path.replace(/\/+$/, "") || "/";
}

export function normalizeLeadAttribution(input = {}, source = null) {
  const declaredSource = source ?? input.source;
  return {
    channel: normalizeLeadChannel(input.channel ?? input.lead_channel ?? input.leadChannel, declaredSource),
    first_touch_path: normalizeFirstTouchPath(input.firstTouchPath ?? input.first_touch_path),
  };
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

// Which channel converts: one row per channel, counted from the ledger the
// operations report already reads. No visitor level data crosses into it.
export function buildChannelAttribution(leads = [], { deliveryStates = [], viewings = [], deals = [] } = {}) {
  const sentLeadIds = new Set(deliveryStates.filter((row) => row.status === "sent").map((row) => row.lead_id));
  const viewedLeadIds = new Set(viewings.map((row) => row.lead_id));
  const dealLeadIds = new Set(deals.map((row) => row.lead_id));
  const channels = [...new Set(leads.map((lead) => lead.channel || leadChannelForSource(lead.source)))].sort();
  const rows = channels.map((channel) => {
    const channelLeads = leads.filter((lead) => (lead.channel || leadChannelForSource(lead.source)) === channel);
    const ids = new Set(channelLeads.map((lead) => lead.lead_id));
    const repliesSent = [...ids].filter((id) => sentLeadIds.has(id)).length;
    const viewingLeads = [...ids].filter((id) => viewedLeadIds.has(id)).length;
    const closedDeals = [...ids].filter((id) => dealLeadIds.has(id)).length;
    return {
      channel,
      leads: channelLeads.length,
      replies_sent: repliesSent,
      response_rate_pct: percent(repliesSent, channelLeads.length),
      viewing_leads: viewingLeads,
      closed_deals: closedDeals,
      deal_conversion_pct: percent(closedDeals, channelLeads.length),
      sources: [...new Set(channelLeads.map((lead) => lead.source || "unknown"))].sort(),
    };
  });
  const entryPaths = new Map();
  for (const lead of leads) {
    const path = lead.first_touch_path;
    if (!path) continue;
    entryPaths.set(path, (entryPaths.get(path) || 0) + 1);
  }
  return {
    measurement: "lead_ledger_attribution",
    attributed_leads: leads.filter((lead) => Boolean(lead.channel)).length,
    first_touch_known: leads.filter((lead) => Boolean(lead.first_touch_path)).length,
    rows: rows.sort((left, right) => right.leads - left.leads || left.channel.localeCompare(right.channel)),
    entry_paths: [...entryPaths.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([path, count]) => ({ path, leads: count })),
  };
}
