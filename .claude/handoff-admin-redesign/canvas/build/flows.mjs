import fs from 'node:fs';
import assert from 'node:assert/strict';
import { sheet } from '../shell.mjs';

const CSS=`
  .fl { display:grid; gap:24px; }
  .fl h1 { font-size:22px; font-weight:600; }
  .fl h2 { font-size:16px; }
  .fl p { max-width:960px; }
  .fl-hd,.fl-close { display:grid; gap:12px; }
  .fl-group { display:grid; gap:16px; }
  .fl-row { display:grid; grid-template-columns:160px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); gap:24px; padding:20px 0; border-top:1px solid var(--joint); align-items:start; }
  .fl-row > div { display:grid; gap:8px; min-width:0; }
  .fl-row b { color:var(--text-strong); }
  .fl-row .wit { white-space:normal; }
  .fl-head { padding:12px 0; color:var(--text-muted); font-weight:600; }
  .fl-close { border-top:1px solid var(--joint); padding-top:24px; }
  .fl a { display:inline-flex; align-items:center; min-height:44px; width:fit-content; }
  .fl a:focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
`;
const LEAD=[
  ['Receive and assign',[
    ['Buyer','Sends an enquiry','The request is associated with its source and contact purpose.','Request receipt needed','A failed or unknown response does not prove that no request arrived. Check before retrying.'],
    ['Broker','Assigns the enquiry','A broker, reason and named human confirmation identify the decision.','Assignment receipt needed','Keep the proposed owner and reason; do not show a saved assignment without its receipt.'],
  ]],
  ['Review and reply',[
    ['Hermes','Drafts a response','Use approved listing and enquiry sources. Unknown availability stays unknown.','Human review needed','Unavailable credentials or a rejected draft leave the enquiry open. No reply is invented.'],
    ['Broker','Reviews, then sends','Review note and human confirmation are separate from recipient, channel and delivery.','Delivery receipt needed','A reviewed draft is not a delivered reply. An unknown delivery outcome needs inspection before a repeat send.'],
  ]],
  ['Qualify and arrange',[
    ['Broker','Records qualification','Budget, location and timeline come from the customer. Purchase and monthly rental budgets remain distinct.','Qualification receipt needed','Incomplete or invalid facts do not advance the lead. Keep the entered values available for correction.'],
    ['Broker','Books a viewing','Select a qualified lead, broker and time. Check the proposed arrangement with the people involved.','Calendar receipt separate','The local booking can exist while synchronisation is pending, unavailable or failed. No invitation is assumed delivered.'],
  ]],
  ['Record the outcome',[
    ['Broker','Records viewing feedback','Keep follow-up, feedback and the lead outcome distinct; each has its own source state.','Outcome receipt needed','A viewing without feedback is not a sale, an offer or a completed task.'],
    ['Responsible person','Reviews the case evidence','The case records evidence references and accepted producers. Each decision remains attributed.','Human decision needed','A workflow label does not certify legal sufficiency, signatures, payment, possession or registry completion.'],
  ]],
  ['Respect the contact purpose',[
    ['Broker','Records a withdrawal','Choose the affected purpose and source reason; a named human confirms the decision.','Withdrawal receipt needed','Retain the earlier grant as history. Verify enforcement separately for each downstream channel.'],
  ]],
];
const PUBLICATION=[
  ['Preserve the source',[
    ['Reviewer','Checks the legacy URL','Keep the original URL, source content and recorded destination decision together.','Decision evidence needed','Do not infer that an old home or search page should redirect to a new home page.'],
    ['Editor','Checks listing facts','Keep the reference, price, area, bedrooms, location and source URL exact. Unknown facts stay unknown.','Fact review needed','A missing price is not zero; descriptive prose is not automatically a verified numeric field.'],
  ]],
  ['Review media and language',[
    ['Reviewer','Checks each photograph','Inspect the file and its rights, property association and public safety; record the reason and named confirmation.','Media approval needed','A stored or mirrored file is not automatically an approved public photograph. No photograph is supplied in this canvas.'],
    ['Hermes','Drafts a translation','Bulgarian remains the source locale. Copy approved facts without extending their claims.','Human language review needed','An automated draft or successful generation is not approval to index the language.'],
    ['Language reviewer','Approves the wording','Check the current source and target text. Retain who reviewed it and which version they reviewed.','Version-specific approval needed','A changed source can invalidate a prior translation review. Do not preserve a green status without checking its version.'],
  ]],
  ['Release with evidence',[
    ['Authorised person','Reviews publication','Check the listing, media, language and applicable release gates before publication.','Publication receipt needed','A canvas verdict, local test or green CI run does not supply missing human listing or translation approval.'],
    ['Operator','Verifies the public result','Read back the deployed page, canonical URL, language, media and indexing decisions for the released revision.','Live readback needed','A successful build or upload does not prove that the intended route is serving the intended content.'],
    ['Operator','Verifies search and redirects','Check live search behaviour and the preserved old addresses against their recorded decisions.','Live parity evidence needed','Do not replace missing search results or failed redirects with a broad homepage fallback.'],
  ]],
];
const render=(title,intro,groups,close)=>`<div class="fl"><header class="fl-hd"><h1>${title}</h1><p>${intro}</p><p class="muted">Design sequence · no completed action or live service is asserted. Filled witnesses belong to actual recorded decisions; the unfilled witnesses below mark evidence still needed.</p></header><div class="fl-row fl-head"><span>Who</span><span>Action</span><span>Evidence at the decision</span><span>If it fails or is incomplete</span></div>${groups.map(([heading,rows])=>`<section class="fl-group"><h2>${heading}</h2>${rows.map(([who,action,evidence,witness,failure])=>`<div class="fl-row"><b>${who}</b><div><b>${action}</b></div><div><p>${evidence}</p><span class="wit wit--none">${witness}</span></div><p>${failure}</p></div>`).join('')}</section>`).join('')}<footer class="fl-close"><h2>What this flow does not establish</h2><p>${close}</p><a href="Coverage.html">Review source and delivery coverage</a></footer></div>`;
for(const [name,title,intro,groups,close] of [
  ['FlowLead','From enquiry to an evidenced outcome','A broker sees the next action and the evidence it still needs. Hermes contributes drafts; people own the consequential decisions.',LEAD,'No live enquiry, acknowledgement, reply, appointment, case closure or external consent enforcement was exercised. Reply deadlines come from the saved workspace and lead state, not this diagram.'],
  ['FlowPublish','From source content to a verified public page','Preserve the old address and property facts, then review media, language and publication before checking the live result.',PUBLICATION,'PR #182 remains draft and unmerged. Its listing-URL migration is outside this release path. Current launch status must be checked against the launch authority and fresh service reports; this sequence supplies no production approval.'],
]){
  const actions=groups.flatMap(([,rows])=>rows.map(row=>row[1]));
  assert.equal(new Set(actions).size,actions.length,`${name} repeats an action`);
  assert(groups.every(([,rows])=>rows.every(row=>row.length===5&&row.every(Boolean))));
  fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),sheet({body:render(title,intro,groups,close),width:1560,height:0,extraCss:CSS}));
}
console.log('FlowLead, FlowPublish');
