import fs from "node:fs";
import path from "node:path";

const DIR = new URL("..", import.meta.url).pathname;
// Frame heights are measured from the rendered artboard, never guessed: a frame
// shorter than its content clips, and clipping is the only way a frame can fail.
const MEASURED = JSON.parse(fs.readFileSync(new URL("../measured.json", import.meta.url), "utf8"));
const SLACK = 24;
const GAP_X = 120, GAP_Y = 170;

// [file, title, w, h]
const PAGES = [
  ["page-0", "Public site", [
    ["PublicHome.dc.html", "Home", 1440, 3026],
    ["PublicSearch.dc.html", "Search with map", 1440, 2278],
    ["PublicListing.dc.html", "Property page", 1440, 3210],
    ["PublicLocation.dc.html", "Location — Sandanski", 1440, 2350],
    ["PublicSeller.dc.html", "Sell with us", 1440, 2140],
    ["PublicContact.dc.html", "Contact", 1440, 1980],
    ["PublicMobileSearch.dc.html", "Phone — search", 390, 1117],
    ["PublicMobileListing.dc.html", "Phone — property", 390, 917],
    ["PublicMobileHebrew.dc.html", "Phone — Hebrew, right to left", 390, 895],
  ]],
  ["page-1", "Foundations", [
    ["Foundations.dc.html", "Foundations — tokens, type, layout", 1440, 2560],
    ["Components.dc.html", "Components and every state", 1440, 2020],
    ["Interaction.dc.html", "Interaction rules", 1560, 2064],
  ]],
  ["page-2", "Daily work", [
    ["Main.dc.html", "Today", 1440, 980],
    ["LeadInbox.dc.html", "Lead inbox", 1440, 980],
    ["Pipeline.dc.html", "Pipeline", 1440, 900],
    ["Viewings.dc.html", "Viewings", 1440, 980],
    ["Tasks.dc.html", "Tasks", 1440, 900],
    ["Requests.dc.html", "Requests from the website", 1440, 900],
    ["Contacts.dc.html", "Contacts", 1440, 900],
    ["Consent.dc.html", "Consent", 1440, 900],
  ]],
  ["page-3", "Deals and documents", [
    ["Cases.dc.html", "Transaction cases", 1440, 960],
    ["CaseDetail.dc.html", "Case detail — BG step list", 1440, 1180],
    ["Documents.dc.html", "Documents", 1440, 1180],
    ["DocumentEditor.dc.html", "Document composer and signature", 1440, 1080],
  ]],
  ["page-4", "Catalogue and website", [
    ["Listings.dc.html", "Listings", 1440, 940],
    ["ListingEditor.dc.html", "Listing editor", 1440, 1180],
    ["Translations.dc.html", "Translation approval", 1440, 900],
    ["SitePages.dc.html", "Website — pages", 1440, 960],
    ["PageEditor.dc.html", "Page editor — blocks", 1440, 1140],
    ["Media.dc.html", "Media library", 1440, 900],
    ["MediaEditor.dc.html", "Photo editor", 1440, 1371],
    ["MediaStates.dc.html", "Upload and edit — every state", 1560, 1947],
    ["SeoRedirects.dc.html", "SEO and legacy redirects", 1440, 960],
  ]],
  ["page-5", "AI and integrations", [
    ["Hermes.dc.html", "Hermes console", 1440, 1240],
    ["HermesRun.dc.html", "Hermes run — what it did", 1440, 1120],
    ["Integrations.dc.html", "Connected services", 1440, 1320],
    ["IntegrationCatalogue.dc.html", "Integration catalogue", 1440, 1080],
    ["Automations.dc.html", "Automations and webhooks", 1440, 1080],
  ]],
  ["page-6", "System", [
    ["Settings.dc.html", "Settings", 1440, 1080],
    ["Team.dc.html", "Team and roles", 1440, 900],
    ["Reports.dc.html", "Insight", 1440, 1020],
    ["Activity.dc.html", "Activity log", 1440, 900],
    ["LaunchReadiness.dc.html", "Launch readiness", 1440, 1020],
    ["SignIn.dc.html", "Sign in", 1440, 900],
  ]],
  ["page-7", "Flows, phone, coverage", [
    ["FlowLead.dc.html", "Flow — enquiry to keys", 1560, 1180],
    ["FlowPublish.dc.html", "Flow — legacy URL to published listing", 1560, 1240],
    ["Coverage.dc.html", "Design against the backend", 1560, 1720],
    ["Mobile.dc.html", "Phone — Today", 390, 844],
    ["MobileLead.dc.html", "Phone — lead and reply", 390, 844],
    ["MobileCase.dc.html", "Phone — case", 390, 844],
  ]],
];

const NOTES = [
  ["note-public", "page-0", 0, -250, 900,
    "The public site — what the 13 years of indexed URLs actually resolve to.\n\nSearch is the hero, not a brochure. Every property page shows where each fact came from and which ones nobody has confirmed, because the agency's promise is that a price and an area are checked against a document rather than retyped.\n\nSeven languages, Bulgarian as the source. Hebrew is a full right-to-left build: the shell mirrors, but references, prices and areas stay left to right inside the mirrored line."],
  ["note-system", "page-1", 0, -250, 900,
    "MS Realty operator workspace — the whole system.\n\nBuilt on the agency's own design system: Commissioner, Source Serif 4 and IBM Plex Mono, an Ink-900 rail over a Stone-50 canvas, a 244px rail, a 64px topbar, 8 and 14px radii, and the Brick red held back for one call to action.\n\nThree token values are new. Each was forced by a measured WCAG 2.2 AA failure, not by taste — the numbers are on the Foundations board."],
  ["note-work", "page-2", 0, -230, 900,
    "The rail is flat: seventeen destinations, no accordions. The three \"More in ...\" disclosures that hid ten routes are gone, and sections with real depth open a sub-nav inside the page instead.\n\nKPI tiles are gone too. Counts became filters, so every number on a screen is something you can click."],
  ["note-deals", "page-3", 0, -230, 900,
    "The richest model in the repository was also the least visible: six case types across eight phases, Bulgarian and Greek step lists, evidence attributed to a notary, registry, bank, lawyer or client, and a manual or autonomous execution mode per case.\n\nDocuments are designed ahead of the code. Today the backend records checklist outcomes only — there is no document to create, version, send or sign."],
  ["note-cms", "page-4", 0, -230, 900,
    "The catalogue already round-trips through the CMS. The website does not: home, search, seller, contact and location copy is rendered from code, so the owner cannot edit five of the seven public page types.\n\nThe Website boards design the collections that have to exist for that."],
  ["note-ai", "page-5", 0, -230, 900,
    "Hermes drafts and checks. Five actions are refused to it in code — publish, send a message, mark a translation indexable, change a price, change a redirect — and the interface never offers them.\n\nThe run board shows a real guardrail firing: a Greek draft called Sandanski a coastal town, and the sentence was dropped rather than softened."],
  ["note-flows", "page-7", 0, -250, 900,
    "The last board checks every screen against the repository: 118 admin routes, 8 CMS collections, 7 public page types. Twenty surfaces are already backed, four are partial, and four need backend that does not exist yet — named, sized and separated from the rest."],
];

const artboards = [], annotations = [], pages = [];
for (const [pid, name, boards] of PAGES) {
  pages.push({ id: pid, name });
  let x = 0, y = 0, rowH = 0, perRow = 0;
  const maxPerRow = 3;
  for (const [file, title, w, h] of boards) {
    if (!fs.existsSync(path.join(DIR, file))) throw new Error(`missing ${file}`);
    if (perRow >= maxPerRow) { x = 0; y += rowH + GAP_Y; rowH = 0; perRow = 0; }
    const mh = MEASURED[file.replace(".dc.html", "")];
    const H = mh ? mh + SLACK : h;
    artboards.push({ file, title, x, y, w, h: H, page: pid });
    x += w + GAP_X;
    rowH = Math.max(rowH, H);
    perRow += 1;
  }
}
for (const [id, page, x, y, w, text] of NOTES) annotations.push({ id, page, x, y, w, text });

const doc = { artboards, annotations, pages, launch: { view: "canvas", page: "page-2" } };
fs.writeFileSync(new URL("../canvas.json", import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
console.log(`canvas.json — ${artboards.length} artboards, ${pages.length} pages, ${annotations.length} notes`);
