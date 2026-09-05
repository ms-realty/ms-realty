import fs from 'node:fs';
import assert from 'node:assert/strict';
import { BASE, FONT_LINKS, icon } from '../shell.mjs';

const CSS = `
  .wm { width:390px; min-height:844px; display:flex; flex-direction:column; background:var(--canvas); }
  .wm-hd { display:flex; gap:12px; padding:12px 16px; align-items:center; border-bottom:1px solid var(--joint); }
  .wm h1 { font-size:22px; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wm h2 { font-size:16px; }
  .wm h3 { font-size:13px; }
  .wm .wm-back { display:grid; place-items:center; width:44px; height:44px; flex:0 0 auto; border:1px solid var(--border-control); border-radius:var(--r-edge); color:var(--text-strong); }
  .wm-body { display:grid; gap:20px; padding:16px; align-content:start; flex:1; }
  .wm-section { display:grid; gap:16px; padding:16px; background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); min-width:0; }
  .wm-section > * { min-width:0; }
  .wm .btn { min-height:44px; height:auto; white-space:normal; justify-content:center; }
  .wm .in { width:100%; min-height:44px; font:inherit; color:var(--text-body); }
  .wm textarea.in { min-height:96px; resize:vertical; }
  .wm :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .wm .btn:disabled { opacity:.5; cursor:not-allowed; }
  .wm .wit { white-space:normal; flex-wrap:wrap; }
  .wm p,.wm dd { overflow-wrap:anywhere; }
  .wm-facts { display:grid; grid-template-columns:96px minmax(0,1fr); gap:12px; margin:0; }
  .wm-facts dt { color:var(--text-muted); }
  .wm-facts dd { margin:0; }
  .wm-check { display:flex; align-items:center; gap:12px; min-height:44px; }
  .wm-check input { width:20px; height:20px; flex:0 0 auto; accent-color:var(--spring-700); }
  .wm-queue { border-top:1px solid var(--joint); }
  .wm-row { display:grid; grid-template-columns:minmax(0,1fr) 72px; gap:12px; align-items:center; height:44px; border-bottom:1px solid var(--joint); color:var(--text-body); }
  .wm-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wm-row span { font-size:11px; color:var(--text-muted); text-align:end; }
  .wm-row:hover { background:var(--tile); text-decoration:none; }
  .wm-states { display:grid; gap:20px; }
  .wm-state { display:grid; gap:12px; border-top:1px solid var(--joint); padding-top:20px; }
  .wm-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); border-top:1px solid var(--joint); background:var(--surface); }
  .wm-tab { display:grid; justify-items:center; align-content:center; gap:4px; min-height:64px; color:var(--text-muted); font-size:11px; font-weight:600; border-top:2px solid transparent; }
  .wm-tab[aria-current] { color:var(--text-strong); border-top-color:var(--ink-900); }
  .wm-tab:hover { color:var(--text-strong); background:var(--tile); text-decoration:none; }
`;
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const button = (text, primary=false, disabled=false) => `<button class="btn${primary?' btn--accent':''}" type="button"${disabled?' disabled':''}>${text}</button>`;
const field = (id, label, type='text', value='') => `<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}" value="${esc(value)}"></div>`;
const note = (id,label,value='') => `<div class="field"><label for="${id}">${label}</label><textarea class="in" id="${id}">${esc(value)}</textarea></div>`;
const confirm = text => `<label class="wm-check"><input type="checkbox"><span>I, Mariya, ${text}</span></label>`;
const section = (title,body) => `<section class="wm-section"><h2>${title}</h2>${body}</section>`;
const witness = text => `<span class="wit wit--none">${text}</span>`;
const states = (subject, failed) => `<div class="wm-states">${[
  ['Nothing in this view',`No ${subject} matches the current filter. Check the scope before treating the workspace as clear.`,'Change filters'],
  ['Loading the record','Keep the selected identity visible until the record has loaded.','Loading…',true],
  ['The action failed',failed,'Review entered values'],
  ['Some evidence is unavailable','The record can load while a private document, contact channel or external receipt is unavailable.','Review missing evidence'],
  ['More records to review','Keep the selected record and page position. Long identities stay on a single queue row.','Next page'],
  ['Save outcome unknown','Check for the original receipt before repeating a consequential action.','Try again',true],
].map(([title,text,action,disabled])=>`<section class="wm-state"><h2>${title}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const tabs = current => `<nav class="wm-tabs" aria-label="Workspace">${[['Mobile','today','Today'],['MobileLead','inbox','Inbox'],['MobileCase','case','Cases']].map(([name,glyph,label])=>`<a class="wm-tab" href="${name}.html"${name===current?' aria-current="page"':''}>${icon(glyph,20)}${label}</a>`).join('')}</nav>`;
const wrap = (name,title,body) => `<!doctype html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc><helmet>${FONT_LINKS}<style>${BASE}${CSS}</style></helmet><div class="wm"><header class="wm-hd"><a class="wm-back" href="Mobile.html" aria-label="Back to Today">${icon('left',20)}</a><h1>${title}</h1></header><div class="wm-body"><p class="muted">Illustrative workspace · Mariya · no live record loaded.</p>${body}</div>${tabs(name)}</div></x-dc></body></html>`;

const queue=[['Екатерина Константинова-Александрова','Assign','MobileLead'],['Anna Weber','Case','MobileCase'],['מרים כהן','Reply','MobileLead'],['Elena Dimitrova','Review','MobileLead']];
assert.equal(new Set(queue.map(([name])=>name)).size,queue.length);
const TODAY = section('Next: assign the enquiry', `<h3 lang="bg">Екатерина Константинова-Александрова</h3><p>A viewing question needs an owner. Check the property’s availability before proposing an appointment.</p>${witness('No assignment confirmed')}${field('owner','Proposed broker','text','Mariya · example')}${note('assign-reason','Reason for assignment')}${confirm('confirm the broker and reason for this assignment.')}${button('Save assignment',true)}`)
  + section('Work waiting',`<p>${queue.length} sample records. No live deadline or overdue count is asserted.</p>${field('queue-search','Find a person or task','search')}<div class="wm-queue">${queue.map(([name,action,target])=>`<a class="wm-row" href="${target}.html"><b title="${esc(name)}"><bdi dir="auto">${name}</bdi></b><span>${action}</span></a>`).join('')}</div><p class="hint">Open the owning record to resolve a derived task.</p>`)
  + states('work','The proposed broker and assignment reason remain entered. No new owner is confirmed.');

const LEAD = section('The enquiry',`<h3 lang="bg">Екатерина Константинова-Александрова</h3><dl class="wm-facts"><dt>Language</dt><dd>Bulgarian</dd><dt>Owner</dt><dd>Mariya · example</dd><dt>Contact</dt><dd>Not loaded</dd><dt>Availability</dt><dd>Not verified</dd></dl><p lang="bg">Примерно запитване: Може ли да уточним дали е възможен оглед?</p>`)
  + section('Review the draft',`${witness('Human review needed')}<p>Hermes draft · illustrative English reply.</p>${note('reply','Reply text','Thank you for your enquiry. We will check the property’s current availability before proposing a viewing.')}${note('review-note','Source and review note')}${confirm('have checked the draft against its source facts.')}${button('Record draft review',true)}<p class="hint">Review is separate from delivery. Check the recipient and channel before a person sends a reply. No message is sent by this preview.</p>`)
  + section('Snooze with a reason',`${field('snooze-time','Return date and time','datetime-local')}${note('snooze-reason','Why should this wait?')}${confirm('confirm the return time and reason.')}${button('Review snooze')}`)
  + states('enquiry','The draft and review note remain entered. No review or delivery is confirmed.');

const CASE = section('Anna Weber · example case',`<p>Buyer purchase · Bulgaria · manual case.</p><dl class="wm-facts"><dt>Reference</dt><dd><bdi dir="ltr">CASE-0007</bdi></dd><dt>Property facts</dt><dd>Not loaded</dd><dt>Responsible</dt><dd>Mariya · example</dd><dt>Evidence</dt><dd>Review pending</dd></dl><p>No transaction value, notary appointment or legal clearance is asserted.</p>`)
  + section('Review the current step',`<h3>Evidence pack review · example</h3>${witness('No completion recorded')}${field('step-ref','Internal evidence reference')}${field('producer-ref','Evidence producer reference')}${note('step-note','Review note')}${confirm('have checked the evidence and confirm this step.')}${button('Complete step',true)}<p class="hint">The source requires evidence from an accepted producer and resolved earlier phases. A reference alone does not certify legal sufficiency.</p>`)
  + section('Waive a condition',`<h3>Mortgage approval · example condition</h3>${witness('No waiver recorded')}${field('authority','Authority or written instruction reference')}${field('waive-code','Reason code','text','client_instruction')}${note('waive-note','Reason for this decision')}${confirm('confirm this waiver and the authority it rests on.')}${button('Waive condition')}<p class="hint">A waiver records a human decision. It does not establish finance approval or a refund entitlement. The source retains earlier events.</p>`)
  + states('case','The evidence references and note remain entered. No step or condition change is confirmed.');

for(const [name,title,body] of [['Mobile','Today',TODAY],['MobileLead','Lead enquiry',LEAD],['MobileCase','Transaction case',CASE]]){
  assert.equal((body.match(/btn--accent/g)||[]).length,1,`${name} needs one primary action`);
  fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),wrap(name,title,body));
}
console.log('Mobile, MobileLead, MobileCase');
