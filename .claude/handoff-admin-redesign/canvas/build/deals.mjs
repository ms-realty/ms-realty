import fs from 'node:fs';
import assert from 'node:assert/strict';
import { page } from '../shell.mjs';
import { REALTY_CASE_TYPES, REALTY_WORKFLOW_VERSION, planOpenRealtyCase, planRealtyCaseAction } from '../../../../production/lib/realty-cases.mjs';

const labels={buyer_purchase:'Buyer purchase',seller_sale:'Seller sale',tenant_rental:'Tenant rental',landlord_rental:'Landlord rental',short_term_rental:'Short-term rental',property_management:'Property management'};
const people=['Anna Weber','Екатерина Константинова-Александрова','Georgi Nikolov','מרים כהן','Elena Dimitrova','Kostas Papadakis'];
const examples=REALTY_CASE_TYPES.map((type,i)=>planOpenRealtyCase({id:`CASE-EXAMPLE-${i+1}`,caseType:type,jurisdiction:i===5?'GR':'BG',assetKind:'residential',clientRef:`client-example-${i+1}`,executionMode:'manual',actor:'mariya-example',executorKind:'human',mandate:{ref:'mandate-example',grantedByRef:'client-example',signedAt:'2026-09-01T09:00:00Z',signedEvidenceRef:'evidence-example',capabilities:['case:*']}},{recordedAt:'2026-09-05T09:00:00Z'}));
const selected=examples[0].case;
const current=selected.steps[0];
const completion={caseId:selected.id,action:'step_completed',stepKey:current.key,actor:'mariya-example',executorKind:'human',evidenceRefs:[{ref:'evidence-example',type:'review',producerKind:current.evidence_producers[0]}]};
assert(planRealtyCaseAction(completion,{events:[examples[0].event],recordedAt:'2026-09-05T09:01:00Z'}).event.evidence_refs.length);
assert.throws(()=>planRealtyCaseAction({...completion,executorKind:'agent'},{events:[examples[0].event],recordedAt:'2026-09-05T09:01:00Z'}),/human executor/);
assert.throws(()=>planRealtyCaseAction({...completion,evidenceRefs:[]},{events:[examples[0].event],recordedAt:'2026-09-05T09:01:00Z'}),/evidenceRefs/);
for(const type of REALTY_CASE_TYPES)assert(labels[type]);
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const CSS=`
  .rc { display:grid; gap:20px; }
  .rc .ph { margin:0; }
  .rc-section { display:grid; gap:16px; padding:20px; min-width:0; }
  .rc h2 { font-size:16px; }
  .rc-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; }
  .rc-form .rc-wide { grid-column:1/-1; }
  .rc .in { width:100%; font:inherit; color:var(--text-body); }
  .rc textarea.in { min-height:96px; resize:vertical; }
  .rc :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .rc button:disabled { opacity:.5; cursor:not-allowed; }
  .rc-check { display:flex; gap:12px; align-items:start; }
  .rc-check input { width:16px; height:16px; accent-color:var(--spring-700); flex:0 0 auto; }
  .rc-row { display:grid; grid-template-columns:minmax(0,1fr) 160px 96px 128px 72px; gap:16px; align-items:center; height:44px; padding:0 20px; border-top:1px solid var(--joint); }
  .rc-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rc-row:hover { background:var(--tile); }
  .rc-step { grid-template-columns:minmax(0,1fr) 160px 200px 72px; }
  .rc-group { padding:12px 20px; border-top:1px solid var(--joint); background:var(--tile); font-size:13px; font-weight:600; }
  .rc-cols,.rc-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
  .rc-state { display:grid; gap:12px; padding-top:20px; border-top:1px solid var(--joint); }
  .rc-state .btn,.rc-section > .btn { justify-self:start; }
  .rc-facts { display:grid; grid-template-columns:160px minmax(0,1fr); gap:12px; margin:0; }
  .rc-facts dt { color:var(--text-muted); }
  .rc-facts dd { margin:0; overflow-wrap:anywhere; }
`;
const button=(label,primary=false,disabled=false)=>`<button class="btn${primary?' btn--accent':''}" type="button"${disabled?' disabled':''}>${label}</button>`;
const field=(id,label,type='text',value='')=>`<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}" value="${esc(value)}"></div>`;
const select=(id,label,options)=>`<div class="field"><label for="${id}">${label}</label><select class="in" id="${id}">${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></div>`;
const note=(id,label)=>`<div class="field rc-wide"><label for="${id}">${label}</label><textarea class="in" id="${id}"></textarea></div>`;
const confirm=text=>`<label class="rc-check rc-wide"><input type="checkbox"><span>I, Mariya, ${text}</span></label>`;
const pending=text=>`<span class="wit wit--none">${text}</span>`;
const section=(title,body)=>`<section class="panel"><div class="panel-hd"><h2>${title}</h2></div><div class="rc-section">${body}</div></section>`;
const states=`<div class="rc-states">${[
  ['No matching cases','Check the type, jurisdiction and owner filters before treating the workspace as clear.','Change filters'],
  ['Case is loading','Retain the selected reference while evidence is loading.','Loading…',true],
  ['Evidence was rejected','Keep the supplied reference. Check the accepted producer and any unresolved earlier phases.','Review evidence'],
  ['Private evidence unavailable','A case may load while an attached document or external record cannot be read.','Review access'],
  ['Many cases','Keep each identity on one line and retain the current page.','Next page'],
  ['Action outcome unknown','Read the existing event before repeating completion or waiver.','Repeat action',true],
].map(([title,text,action,disabled])=>`<section class="rc-state"><h2>${title}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const header=(title,text)=>`<div class="ph"><div><h1>${title}</h1><p>${text}</p></div></div><p class="muted">Illustrative cases and mandates · no live transaction, legal clearance or external receipt loaded.</p>`;
const CASES=header('Transaction cases','See the current step, its owner and the evidence it still needs.')+section('Case queue',`${field('case-search','Find a client or case','search')}<p>${examples.length} sample cases, generated from the current case types. Each starts with unresolved steps.</p>`)+`<section class="panel">${examples.map(({case:row},i)=>`<div class="rc-row"><b title="${esc(people[i])}"><bdi dir="auto">${people[i]}</bdi></b><span>${labels[row.case_type]}</span><span>${row.jurisdiction} · manual</span>${pending('First step open')}<button class="btn btn--sm" type="button">Open</button></div>`).join('')}</section>`+section('Open a case',`<form class="rc-form">${select('case-type','Case type',REALTY_CASE_TYPES.map(type=>[type,labels[type]]))}${select('jurisdiction','Jurisdiction',[['BG','Bulgaria'],['GR','Greece']])}${select('asset-kind','Asset kind',['residential','commercial','land','new_build','mixed_use'].map(x=>[x,x.charAt(0).toUpperCase()+x.slice(1).replaceAll('_',' ')]))}${field('client-ref','Client reference')}${field('property-ref','Property reference (optional)')}${field('mandate-ref','Mandate reference')}${field('granted-by','Mandate granted by · reference')}${field('mandate-evidence','Signed mandate evidence reference')}${field('signed-at','Mandate signed at','datetime-local')}${field('mandate-expires','Mandate expiry (optional)','datetime-local')}${note('mandate-scope','Approved scope and reason for opening')}${confirm('have checked the mandate and confirm this manual case.')}${pending('Opening decision not saved')}${button('Open case',true)}</form><p class="hint">The case must have a mandate that permits opening and the later actions it will need. Changing execution mode requires separate authority; opening this example does not authorise Hermes to complete a manual case.</p>`)+states;
const DETAIL=header('Anna Weber · example case','Review the step and its evidence before recording an outcome.')+section('Case record',`<dl class="rc-facts"><dt>Reference</dt><dd><bdi dir="ltr">${selected.id}</bdi></dd><dt>Type</dt><dd>${labels[selected.case_type]} · ${selected.jurisdiction}</dd><dt>Execution</dt><dd>Manual · example mandate</dd><dt>Workflow version</dt><dd>${REALTY_WORKFLOW_VERSION}</dd><dt>Resolved steps</dt><dd>0 of ${selected.steps.length}</dd><dt>Responsible</dt><dd>Mariya · example</dd></dl><p>The step labels below come from the saved workflow. They are not a current legal opinion or proof that a requirement has been satisfied.</p>`)+`<section class="panel"><div class="panel-hd"><h2>Steps and evidence</h2>${pending('No step completed')}</div>${selected.workflow_phases.map(phase=>`<h3 class="rc-group">${phase.charAt(0).toUpperCase()+phase.slice(1)}</h3>${selected.steps.filter(step=>step.phase===phase).map(step=>`<div class="rc-row rc-step"><b title="${esc(step.label)}">${step.label}</b><span>${step.optional?'Optional · unresolved':'Required · unresolved'}</span>${pending('Evidence needed')}<button class="btn btn--sm" type="button">Review</button></div>`).join('')}`).join('')}</section>`+section('Complete the current step',`<h3>${current.label}</h3><form class="rc-form">${field('evidence-ref','Internal evidence reference')}${field('evidence-type','Evidence type')}${select('producer-kind','Evidence producer',current.evidence_producers.map(x=>[x,x.charAt(0).toUpperCase()+x.slice(1)]))}${field('issued-at','Evidence issued at (optional)','datetime-local')}${note('step-review','Review note')}${confirm('have checked the evidence and confirm this completion.')}${pending('Completion not saved')}${button('Complete step',true)}</form><p class="hint">The backend checks the mandate, executor, step order and accepted evidence producer. This preview does not write a case event.</p>`)+`<div class="rc-cols">${section('Waive a condition',`<h3>Mortgage approval · illustrative open condition</h3>${pending('No waiver recorded')}${field('waiver-authority','Authority or instruction reference')}${field('waiver-code','Reason code','text','client_instruction')}${note('waiver-note','Reason for the decision')}${confirm('confirm the waiver and the authority it rests on.')}${button('Waive condition')}<p class="hint">Waiver records a human decision; it does not assert finance approval or a refund entitlement. Reopening requires authority, a reason and a new due date.</p>`)}${section('Hermes and external evidence',`<p>Hermes can help draft an evidence summary for review. A manual case requires a human executor for its actions.</p><p>There is no live bank, registry or notary receipt in this example. Do not replace missing evidence with an automated success label.</p>${button('Review a draft')}<p class="hint">No message, signature request or legal approval is produced by this preview.</p>`)}</div>`+states;
for(const [name,body] of [['Cases',CASES],['CaseDetail',DETAIL]]){assert.equal((body.match(/btn--accent/g)||[]).length,1);fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active:'cases',body:`<div class="rc">${body}</div>`,extraCss:CSS,height:0,healthText:'Illustrative workspace'}));}
console.log('Cases, CaseDetail');
