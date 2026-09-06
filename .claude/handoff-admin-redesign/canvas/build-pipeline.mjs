import fs from 'node:fs';
import assert from 'node:assert/strict';
import {page} from './shell.mjs';
import {LEAD_PIPELINES} from '../../../production/lib/lead-pipeline-outcomes.mjs';
const labels={new:'New enquiry',inquiry:'Enquiry',qualified:'Qualified',viewing_booked:'Viewing booked',viewed:'Viewed',viewing:'Viewing',offer:'Offer',due_diligence:'Due diligence',contract:'Contract',application:'Application',lease:'Lease',closed:'Closed'};
for(const stage of Object.values(LEAD_PIPELINES).flat())assert(labels[stage],`Describe pipeline stage ${stage}`);
const CSS=`
  .pl { display:grid; gap:20px; }
  .pl .ph { margin:0; }
  .pl-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
  .pl-section { display:grid; gap:16px; padding:20px; border-top:1px solid var(--joint); min-width:0; }
  .pl-section h2,.pl-state h2 { font-size:16px; }
  .pl-section > .btn { justify-self:start; }
  .pl-row { display:grid; grid-template-columns:minmax(0,1fr) 144px 144px 200px 96px; align-items:center; gap:16px; height:var(--row); padding:0 20px; border-top:1px solid var(--joint); }
  .pl-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pl-row:hover { background:var(--tile); }
  .pl-heading { background:var(--tile-deep); font-weight:600; }
  .pl .in { width:100%; font:inherit; color:var(--text-body); }
  .pl textarea.in { min-height:96px; resize:vertical; }
  .pl :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .pl button:disabled { opacity:.5; cursor:not-allowed; }
  .pl-check { display:flex; align-items:start; gap:12px; }
  .pl-check input { width:16px; height:16px; accent-color:var(--spring-700); flex:0 0 auto; }
  .pl-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .pl-state { display:grid; gap:12px; align-content:start; padding:20px 0; border-top:1px solid var(--joint); }
  .pl-state .btn { justify-self:start; }
  .pl-path { display:flex; flex-wrap:wrap; gap:8px 16px; margin:0; padding-inline-start:20px; }
`;
const opportunities=[['Екатерина Константинова-Александрова','buyer','new','Not supplied','Qualify and reply'],['Anna Weber','buyer','viewing_booked','€1,245,000','Review booking'],['מרים כהן','renter','qualified','€800 / month','Arrange viewing'],['Dmitri Volkov','buyer','offer','€245,000','Review the offer']];
assert.equal(new Set(opportunities.map(row=>row[0])).size,opportunities.length);
const body=`<div class="pl"><div class="ph"><div><h1>Buyers and renters</h1><p>Follow the next evidenced action for each opportunity. Buyer and renter stages remain separate.</p></div></div><p class="muted">Illustrative people, budgets and stages · budget is not a property price or expected revenue.</p><section class="panel"><div class="panel-hd"><h2>Open opportunities</h2><span class="sub">Four examples</span></div><div class="pl-row pl-heading"><span>Person</span><span>Stage</span><span>Budget</span><span>Next action</span><span>Action</span></div>${opportunities.map(([name,kind,stage,budget,next])=>`<div class="pl-row"><b title="${name}"><bdi dir="auto">${name}</bdi></b><span>${labels[stage]}</span><span>${budget}</span><span>${next}</span><button class="btn btn--sm" type="button">Open record</button></div>`).join('')}</section><div class="pl-grid"><section class="panel"><div class="panel-hd"><h2>Qualify the selected buyer</h2><span class="wit wit--none">Human review due</span></div><form class="pl-section"><div class="field"><label for="qualify-budget">Maximum budget · EUR</label><input class="in" id="qualify-budget" type="number" min="1" step="1"></div><div class="field"><label for="qualify-location">Preferred locations</label><input class="in" id="qualify-location" value="Sandanski"></div><div class="field"><label for="qualify-timeline">Decision timeline</label><input class="in" id="qualify-timeline"></div><div class="field"><label for="qualify-note">Qualification note</label><textarea class="in" id="qualify-note"></textarea></div><label class="pl-check"><input type="checkbox"><span>I, Mariya, confirm these requirements and their source.</span></label><button class="btn btn--accent" type="button">Record qualification</button></form></section><section class="panel"><div class="panel-hd"><h2>The stage follows the record</h2></div><div class="pl-section"><p>A booking, viewing outcome, offer or signed contract supplies different evidence. Moving a card cannot replace it.</p><p>Open the owning screen to perform the next action. A saved pipeline note does not send a customer reply.</p><p>Seller enquiries have their own path. They are not counted as buyer opportunities here.</p><span class="wit wit--none">Required evidence stays visible</span><button class="btn" type="button">Open related work</button></div></section></div><div class="pl-grid">${Object.entries(LEAD_PIPELINES).map(([kind,stages])=>`<section class="panel"><div class="panel-hd"><h2>${kind==='buyer'?'Buyer':'Renter'} stages</h2></div><div class="pl-section"><ol class="pl-path">${stages.map(s=>`<li>${labels[s]}</li>`).join('')}</ol><p>Stages come from the current pipeline definition. Completed and lost outcomes require their own records.</p></div></section>`).join('')}</div><div class="pl-states">${[['No matching opportunities','Check the selected pipeline and filters.','Change filters'],['Qualification is saving','The proposed requirements remain visible until confirmed.','Saving qualification…',true],['Required facts are missing','Add a positive maximum budget, a location and a decision timeline.','Review requirements'],['Related evidence unavailable','A missing booking or contract readback must not advance the stage.','Reload related record'],['Many opportunities','Filter by pipeline, stage and owner, then page through a single identity row per person.','Open filters'],['Stage change not permitted','Complete the required action in its owning screen.','Move to completed',true]].map(([title,text,action,disabled])=>`<section class="pl-state"><h2>${title}</h2><p>${text}</p><button class="btn" type="button"${disabled?' disabled':''}>${action}</button></section>`).join('')}</div></div>`;
fs.writeFileSync(new URL('./Pipeline.dc.html',import.meta.url),page({active:'pipeline',body,extraCss:CSS,height:0,healthText:'Illustrative workspace'}));
console.log('Pipeline');
