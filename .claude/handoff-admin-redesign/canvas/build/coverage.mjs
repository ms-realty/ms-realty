import fs from 'node:fs';
import assert from 'node:assert/strict';
import { sheet } from '../shell.mjs';
import { ADMIN_PAGE_SURFACES, ADMIN_ROUTE_COVERAGE } from '../../../../production/lib/owner-operator-catalog.mjs';

const rows=[
  ['System examples',['Foundations','Components','Interaction'],null,'Shared design contracts and interaction states.'],
  ['Today',['Main','Mobile'],'today','Current task and queue composition.'],
  ['Lead inbox',['LeadInbox','MobileLead'],'lead_inbox','Assignment, draft review, snooze and delivery remain distinct.'],
  ['Pipeline',['Pipeline'],'lead_pipeline','Qualification and source outcomes.'],
  ['Viewings',['Viewings'],'viewings','Booking and external calendar receipts remain distinct.'],
  ['Tasks',['Tasks'],'tasks','Authored tasks and work derived from owning records.'],
  ['Requests',['Requests'],'requests','Saved searches, language and viewing-trip requests.'],
  ['Contacts',['Contacts'],'contacts','Identity, purpose and private contact access.'],
  ['Consent',['Consent'],'consents','A purpose-specific grant or withdrawal.'],
  ['Transaction cases',['Cases','CaseDetail','MobileCase'],'realty_cases','Step evidence and condition decisions.'],
  ['Document records',['Documents','DocumentEditor'],'document_records','Document records and revisions; a record does not prove a signature.'],
  ['Listings',['Listings','ListingEditor'],'listing_manager','Source facts and listing decisions.'],
  ['Translations',['Translations'],'translation_queue','Draft, review and publication boundaries.'],
  ['Website pages',['SitePages','PageEditor'],null,'Canvas editor concept; route and persistence integration need verification.'],
  ['Media',['Media','MediaEditor','MediaStates'],'media_library','Media records and review states.'],
  ['SEO and redirects',['SeoRedirects'],'migration_review','Recorded legacy decisions; live parity needs separate evidence.'],
  ['Hermes',['Hermes','HermesRun'],'hermes','Registered surface does not establish a live worker or run-history interface.'],
  ['Integrations',['Integrations','IntegrationCatalogue'],'connections','Provider definitions do not establish authorisation or a successful sync.'],
  ['Automations',['Automations'],null,'The separate draft PR #173 is not integrated here.'],
  ['Settings',['Settings'],'settings','Workspace settings and approval boundaries.'],
  ['Team',['Team'],'team','Account roles and access.'],
  ['Reports',['Reports'],'reports','Metrics require their source, scope and reporting period.'],
  ['Activity',['Activity'],'activity','Recorded actions remain distinct from external outcomes.'],
  ['Launch readiness',['LaunchReadiness'],null,'Saved launch report; fresh gate evidence remains required.'],
  ['Sign-in',['SignIn'],null,'Authentication composition; not an admin catalogue page.'],
  ['Public home',['PublicHome'],null,'Public composition; not an admin catalogue page.'],
  ['Public search',['PublicSearch','PublicMobileSearch'],null,'Search composition with explicit empty and failure states.'],
  ['Public listing',['PublicListing','PublicMobileListing','PublicMobileHebrew'],null,'Source facts and unknown availability; Hebrew preview is unapproved.'],
  ['Location guide',['PublicLocation'],null,'Reading layout; no invented local facts or legal advice.'],
  ['Seller enquiry',['PublicSeller'],null,'Initial contact is separate from authorising a listing.'],
  ['Contact',['PublicContact'],null,'Enquiry permission is separate from marketing consent.'],
  ['Flows and coverage',['FlowLead','FlowPublish','Coverage'],null,'Design evidence maps; not runtime completion reports.'],
];
const pages=new Map(ADMIN_PAGE_SURFACES.map(page=>[page.id,page]));
const names=rows.flatMap(([,boards])=>boards);
const generated=fs.readdirSync(new URL('../',import.meta.url)).filter(name=>name.endsWith('.dc.html')).map(name=>name.replace('.dc.html',''));
assert.deepEqual([...names].sort(),generated.sort(),'Every artboard must appear exactly once');
for(const [, ,id] of rows)if(id)assert(pages.has(id),`Unknown catalogue page ${id}`);
const report=JSON.parse(fs.readFileSync(new URL('../../../../production/data/launch-readiness.json',import.meta.url),'utf8'));
const pending=report.gates.filter(gate=>gate.status!=='pass');
const CSS=`
  .cv { display:grid; gap:24px; }
  .cv h1 { font-size:22px; font-weight:600; }
  .cv h2 { font-size:16px; }
  .cv-hd,.cv-section { display:grid; gap:12px; }
  .cv p { max-width:1080px; }
  .cv-table { table-layout:fixed; border-collapse:collapse; }
  .cv-table th { font-size:13px; }
  .cv-table td { height:44px; font-size:13px; padding:12px; vertical-align:top; border-bottom:1px solid var(--joint); white-space:normal; overflow-wrap:anywhere; }
  .cv-table th:nth-child(1) { width:160px; }
  .cv-table th:nth-child(2) { width:320px; }
  .cv-table th:nth-child(3) { width:256px; }
  .cv-table td code { font-size:11px; }
  .cv-section { padding-top:24px; border-top:1px solid var(--joint); }
  .cv-facts { display:grid; grid-template-columns:200px minmax(0,1fr); gap:12px 24px; margin:0; }
  .cv-facts dd { margin:0; }
  .cv-facts dt { color:var(--text-muted); }
  .cv a { display:inline-flex; width:fit-content; align-items:center; min-height:44px; }
  .cv a:focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
`;
const body=`<div class="cv"><header class="cv-hd"><h1>Design, source and delivery evidence</h1><p>${names.length} artboards are mapped below. The generator reads ${ADMIN_PAGE_SURFACES.length} admin page declarations and ${ADMIN_ROUTE_COVERAGE.length} method-and-path declarations from the current source catalogue. These are declarations, not a count of verified working screens.</p><span class="wit wit--none">Live adoption not verified</span></header><table class="cv-table"><thead><tr><th>Surface</th><th>Artboards</th><th>Declared admin page</th><th>Boundary to verify</th></tr></thead><tbody>${rows.map(([title,boards,id,note])=>`<tr><td><b>${title}</b></td><td>${boards.join(', ')}</td><td>${id?`<code>${pages.get(id).path}</code>`:'No catalogue page mapped'}</td><td>${note}</td></tr>`).join('')}</tbody></table><section class="cv-section"><h2>Evidence is specific to its layer</h2><dl class="cv-facts"><dt>Canvas</dt><dd>Generated composition, measured frames and individual review verdicts. A visual control does not prove an implemented action.</dd><dt>Source</dt><dd>Trace the rendered route, its action handler, capability check and persistence path. Catalogue membership alone is insufficient.</dd><dt>Local checks</dt><dd>Run focused tests, validation, build and smoke against the revision being considered. A fixture is not a live service report.</dd><dt>Pull request</dt><dd>Check the current head, draft state, CI and release conditions. PR #182 stays draft and unmerged; its listing-URL change is not included by implication.</dd><dt>Production</dt><dd>Verify the deployed revision, public and authenticated routes, external receipts and current launch gates. A successful upload is not a complete release.</dd></dl></section><section class="cv-section"><h2>Saved launch authority</h2><p>The saved report was generated at <bdi dir="ltr">${report.generated_at}</bdi>. It reports <b>${report.status}</b>: ${pending.length} of ${report.gates.length} gates are not passing. This is a historical file read, not a fresh production check.</p><dl class="cv-facts">${pending.map(gate=>`<dt>${gate.id.replaceAll('_',' ')}</dt><dd>${gate.message}</dd>`).join('')}</dl><a href="LaunchReadiness.html">Inspect the saved gate evidence</a></section><section class="cv-section"><h2>Approval remains with a person</h2><p>Hermes may draft. It does not publish pages, send customer messages, mark translations indexable or approve legal claims. Bulgarian is the source locale; the seven public languages and three admin languages keep their separate approval and layout requirements.</p><p>Detailed composition verdicts are recorded in REVIEW-2026-09-04.md. They identify what was reviewed and what was not verified.</p></section></div>`;
fs.writeFileSync(new URL('../Coverage.dc.html',import.meta.url),sheet({body,width:1560,height:0,extraCss:CSS}));
console.log('Coverage');
