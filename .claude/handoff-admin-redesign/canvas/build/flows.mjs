import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const F_CSS = `
    .doc-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
    .doc-hd h1 { font-family:var(--font-display); font-size:32px; font-weight:600; letter-spacing:-.02em; }
    .doc-hd p { margin-top:4px; font-size:13px; color:var(--text-muted); max-width:700px; }
    .lane { display:grid; grid-template-columns:132px minmax(0,1fr); gap:0; border:1px solid var(--border);
      border-radius:var(--r-lg); overflow:hidden; background:var(--surface); margin-bottom:16px; }
    .lane-l { background:var(--tile); border-right:1px solid var(--border); padding:16px 16px;
      display:grid; align-content:start; gap:4px; }
    .lane-l b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .lane-l span { font-size:11px; color:var(--text-muted); }
    .lane-r { padding:16px; display:flex; align-items:center; gap:0; flex-wrap:wrap; }
    .node { display:grid; gap:4px; min-width:150px; max-width:186px; padding:12px 12px; border-radius:var(--r-md);
      border:1px solid var(--border); background:var(--surface); }
    .node b { font-size:13px; font-weight:600; color:var(--text-strong); line-height:1.3; }
    .node span { font-size:11px; color:var(--text-muted); line-height:1.35; }
    .node--ai { border-color:var(--brick-300); background:var(--brick-50); }
    .node--gate { border-color:var(--warning-700); background:var(--warning-50); }
    .node--out { border-color:var(--success-500); background:var(--success-50); }
    .node--stop { border-color:var(--danger-600); background:var(--danger-50); }
    .arw { display:grid; place-items:center; width:34px; color:var(--text-muted); flex:0 0 auto; }
    .legend { display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:var(--text-muted); margin-top:8px; }
    .legend span { display:inline-flex; align-items:center; gap:8px; }
    .key { width:13px; height:13px; border-radius:var(--r-edge); border:1px solid; flex:0 0 auto; }
    .grp > h2 { font-size:13px; font-weight:600; color:var(--text-muted); margin:24px 0 12px;
      padding-bottom:8px; border-bottom:1px solid var(--border); }
`;

const node = (kind, title, sub) =>
  `<div class="node${kind ? ` node--${kind}` : ""}"><b>${title}</b><span>${sub}</span></div>`;
const arw = () => `<span class="arw">${icon("arrow", 17)}</span>`;
const lane = (name, note, nodes) => `<div class="lane">
  <div class="lane-l"><b>${name}</b><span>${note}</span></div>
  <div class="lane-r">${nodes.join(arw())}</div>
</div>`;

const LEG = `<div class="legend">
  <span><i class="key" style="background:var(--surface); border-color:var(--border)"></i>A person does it</span>
  <span><i class="key" style="background:var(--brick-50); border-color:var(--brick-300)"></i>Hermes drafts it</span>
  <span><i class="key" style="background:var(--warning-50); border-color:var(--warning-700)"></i>Approval gate — a named person</span>
  <span><i class="key" style="background:var(--success-50); border-color:var(--success-500)"></i>Reaches the customer or the public site</span>
  <span><i class="key" style="background:var(--danger-50); border-color:var(--danger-600)"></i>Refused to the agent, always</span>
</div>`;

const LEAD_BODY = `<div class="doc-hd">
  <div><h1>From enquiry to keys</h1>
    <p>The path a buyer takes through the workspace, and exactly where a human signature is required. Hermes
      appears four times and stops at every gate.</p></div>
  <span class="pill pill--ink"><i></i>Buyer purchase · Bulgaria</span>
</div>
${LEG}
<div class="grp"><h2>Arrival and first reply</h2></div>
${lane("Buyer", "on a phone, often abroad", [
  node("", "Finds a listing", "Legacy URL or search"),
  node("", "Sends an enquiry", "Form, WhatsApp or phone"),
  node("out", "Gets an acknowledgement", "Their language, no property claims"),
])}
${lane("Workspace", "lead inbox", [
  node("", "Lead created", "Contact stored encrypted"),
  node("", "Reply clock starts", "4 hours, then escalation"),
  node("ai", "Hermes drafts the reply", "From the lead and the listing facts"),
  node("gate", "Broker approves", "Named, recorded, editable"),
  node("out", "Reply delivered", "WhatsApp or email"),
])}
<div class="grp"><h2>Qualification and viewing</h2></div>
${lane("Broker", "pipeline and calendar", [
  node("", "Qualifies", "Budget, timeline, financing"),
  node("", "Offers real slots", "From availability and the calendar"),
  node("out", "Viewing confirmed", "Invitation to both sides"),
  node("", "Outcome recorded", "Interested, not interested, offer"),
])}
<div class="grp"><h2>Offer, contract and completion</h2></div>
${lane("Case", "the Bulgarian step list", [
  node("", "Case opened", "6 types · 8 phases · BG or GR"),
  node("", "Evidence collected", "Cadastre, register, certificate"),
  node("ai", "Hermes summarises", "From attached documents only"),
  node("gate", "Lawyer confirms", "Due diligence responsibility"),
  node("", "Contract prepared", "From the reviewed template"),
])}
${lane("Signature", "outside the agency", [
  node("", "Fields filled from the case", "Every value traceable"),
  node("stop", "Hermes may not sign or send", "Refused in code"),
  node("gate", "Person sends it", "Named on the document"),
  node("out", "Both parties sign", "Countersigned by the agency"),
  node("out", "Notarial deed", "Then the register entry"),
])}
<div class="grp"><h2>After</h2></div>
${lane("Aftercare", "and the next enquiry", [
  node("", "Deal closed and recorded", "Commission, evidence, handover"),
  node("", "Review requested", "One task, not a campaign"),
  node("", "Consent still governs contact", "A withdrawal ends marketing at once"),
])}
<div class="note note--warn" style="margin-top:16px">${icon("alert", 16)}
  <span><b>Where it breaks today.</b> Two of the green outcomes cannot happen: replies cannot be delivered
    while Google Workspace needs reauthorising and WhatsApp is unconnected, and Hermes cannot draft at all
    until its two secrets are set. Everything else on this path is wired.</span></div>`;
fs.writeFileSync(W("FlowLead.dc.html"), sheet({ body: LEAD_BODY, width: 1560, height: 1180, extraCss: F_CSS }));

const PUB_BODY = `<div class="doc-hd">
  <div><h1>From a legacy page to a published listing</h1>
    <p>Thirteen years of indexed URLs are the asset the rebuild exists to protect. Nothing becomes public
      without a person, and no legacy address changes meaning without a recorded decision.</p></div>
  <span class="pill pill--ink"><i></i>457 URLs · 165 listings · 11,859 files</span>
</div>
${LEG}
<div class="grp"><h2>Preserve first</h2></div>
${lane("Legacy URL", "makler-realty.com and .ru", [
  node("", "Crawled and archived", "Title, metadata, content, media"),
  node("ai", "Hermes proposes an outcome", "200, 301 or 410, with its evidence"),
  node("gate", "A person decides", "419 of 457 done"),
  node("out", "Redirect file built", "Only from approved decisions"),
])}
<div class="grp"><h2>Make the listing true</h2></div>
${lane("Facts", "listing editor", [
  node("", "Imported from the source", "Price, area, rooms, reference"),
  node("", "Checked against the registry", "Cadastral sketch and extract"),
  node("", "Unconfirmed facts stay off", "The page omits rather than guesses"),
])}
${lane("Media", "review queue", [
  node("", "Mirrored to R2", "Checksum recorded"),
  node("ai", "Hermes drafts alt text", "Flags faces, documents, plates"),
  node("gate", "A person approves each photo", "46 in the queue"),
])}
${lane("Language", "translation queue", [
  node("", "Bulgarian approved", "The source, hashed"),
  node("ai", "Hermes translates", "Facts copied verbatim, claims refused"),
  node("gate", "A speaker of that language approves", "Their name goes on it"),
  node("out", "Indexable in that locale", "Sitemap picks it up"),
])}
<div class="grp"><h2>Publish</h2></div>
${lane("Publication", "the boundary", [
  node("gate", "Owner approves publication", "Facts, media and language all green"),
  node("out", "Public page live", "With its structured data"),
  node("out", "Search index updated", "Typesense, on change"),
  node("out", "Legacy URL honoured", "200 kept or one-hop 301"),
])}
${lane("Refused", "to the agent, permanently", [
  node("stop", "Publish a page", ""),
  node("stop", "Mark a translation indexable", ""),
  node("stop", "Change a price", ""),
  node("stop", "Change a redirect", ""),
  node("stop", "Send a customer message", ""),
])}
<div class="note note--info" style="margin-top:16px">${icon("alert", 16)}
  <span><b>What the CMS does not yet cover.</b> This path round-trips for listings and guides. The home,
    search, seller and contact pages still take their text from the renderer, so the Website section
    designs the collection that has to exist for them.</span></div>`;
fs.writeFileSync(W("FlowPublish.dc.html"), sheet({ body: PUB_BODY, width: 1560, height: 1240, extraCss: F_CSS }));

console.log("FlowLead, FlowPublish");
