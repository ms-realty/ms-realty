import fs from 'node:fs';
import assert from 'node:assert/strict';
import { page } from '../shell.mjs';
import { DOCUMENT_TYPES, DOCUMENT_SOURCES, DOCUMENT_RETENTION_CLASSES, DOCUMENT_STATUSES, SIGNATURE_REQUEST_STATUSES } from '../../../../production/lib/document-signatures.mjs';
import { buildDocumentChecklistQueue } from '../../../../production/lib/document-checklists.mjs';

const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const title=v=>v.charAt(0).toUpperCase()+v.slice(1).replaceAll('_',' ');
const CSS=`
  .dr { display:grid; gap:20px; }
  .dr .ph { margin:0; }
  .dr h2 { font-size:16px; }
  .dr-section { display:grid; gap:16px; padding:20px; min-width:0; }
  .dr-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; }
  .dr .dr-wide { grid-column:1/-1; }
  .dr .in { width:100%; font:inherit; color:var(--text-body); }
  .dr textarea.in { min-height:96px; resize:vertical; }
  .dr input[type=file] { padding:8px; height:auto; }
  .dr :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .dr button:disabled { opacity:.5; cursor:not-allowed; }
  .dr-check { display:flex; gap:12px; align-items:start; }
  .dr-check input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--spring-700); }
  .dr-row { display:grid; grid-template-columns:minmax(0,1fr) 160px 96px 200px 72px; gap:16px; align-items:center; height:44px; padding:0 20px; border-top:1px solid var(--joint); }
  .dr-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dr-row:hover { background:var(--tile); }
  .dr-checkrow { grid-template-columns:minmax(0,1fr) 200px 72px; }
  .dr-cols,.dr-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
  .dr-state { display:grid; gap:12px; border-top:1px solid var(--joint); padding-top:20px; }
  .dr-state .btn,.dr-section > .btn { justify-self:start; }
  .dr-facts { display:grid; grid-template-columns:160px minmax(0,1fr); gap:12px; margin:0; }
  .dr-facts dt { color:var(--text-muted); }
  .dr-facts dd { margin:0; overflow-wrap:anywhere; }
`;
const button=(label,primary=false,disabled=false)=>`<button class="btn${primary?' btn--accent':''}" type="button"${disabled?' disabled':''}>${label}</button>`;
const field=(id,label,type='text',value='')=>`<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}"${type==='file'?'':` value="${esc(value)}"`}></div>`;
const select=(id,label,values)=>`<div class="field"><label for="${id}">${label}</label><select class="in" id="${id}">${values.map(value=>`<option value="${value}">${title(value)}</option>`).join('')}</select></div>`;
const note=(id,label)=>`<div class="field dr-wide"><label for="${id}">${label}</label><textarea class="in" id="${id}"></textarea></div>`;
const confirm=text=>`<label class="dr-check dr-wide"><input type="checkbox"><span>I, Mariya, ${text}</span></label>`;
const pending=text=>`<span class="wit wit--none">${text}</span>`;
const section=(name,body)=>`<section class="panel"><div class="panel-hd"><h2>${name}</h2></div><div class="dr-section">${body}</div></section>`;
const checklist=buildDocumentChecklistQueue([{lead_id:'lead-example',lead_type:'buyer',original_language:'bg',admin_locale:'en'}],[],{locale:'en'}).rows[0];
assert.equal(checklist.completed_count,0);
assert.equal(checklist.items.length,checklist.item_count);
const documents=[['Agency mandate · example','mandate','active'],['Technical file · example','technical','active'],['Earlier contract · example','contract','archived'],['Superseded annex · example','annex','void']];
for(const [,type,status] of documents){assert(DOCUMENT_TYPES.includes(type));assert(DOCUMENT_STATUSES.includes(status));}
const states=`<div class="dr-states">${[
  ['No matching documents','Change the filter or create a record. Empty results do not prove that the external file store is empty.','Change filters'],
  ['Loading the file record','Keep the document identity and selected revision visible.','Loading…',true],
  ['Upload or save failed','Retain the title and change reason. A failed byte check must not appear as a saved revision.','Review upload'],
  ['Document store unavailable','Metadata, bytes and provider receipts can be unavailable separately. Keep the missing part explicit.','Review availability'],
  ['Many versions','Preserve page position and the selected revision. A long title stays on one list row.','Next page'],
  ['Revision conflict','Another revision may have been saved. Read the current version before repeating the action.','Save over it',true],
].map(([name,text,action,disabled])=>`<section class="dr-state"><h2>${name}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const header=(name,text)=>`<div class="ph"><div><h1>${name}</h1><p>${text}</p></div></div><p class="muted">Illustrative document records · no private file, legal review or signature receipt loaded.</p>`;
const LIST=header('Documents','See the record, its current revision and the evidence that is still missing.')+section('Find a document',`<div class="dr-form">${field('document-search','Document, subject or case','search')}${select('document-filter','Record status',['all_statuses',...DOCUMENT_STATUSES])}</div><p>${documents.length} sample records. Record status is separate from signature status.</p>`)+`<section class="panel">${documents.map(([name,type,status])=>`<div class="dr-row"><b title="${name}">${name}</b><span>${title(type)}</span><span>${title(status)}</span>${pending('File not verified')}<button class="btn btn--sm" type="button">Open</button></div>`).join('')}</section>`+section('Create a document record',`<form class="dr-form">${field('document-title','Title')}${select('document-type','Document type',DOCUMENT_TYPES)}${select('document-source','Source',DOCUMENT_SOURCES)}${select('document-retention','Retention class',DOCUMENT_RETENTION_CLASSES)}${field('subject-type','Subject type')}${field('subject-ref','Subject reference')}${field('document-case','Case reference (optional)')}${field('new-file','Select the source file','file')}${note('create-reason','Reason for adding this document')}${confirm('have checked the source file and its association.')}${pending('Upload and record not saved')}${button('Create document',true)}</form><p class="hint">The uploaded bytes supply the storage reference, type, size and digest. A record is not proof of a signature or legal sufficiency. Retention classes do not specify a statutory period here.</p>`)+`<section class="panel"><div class="panel-hd"><h2>Buyer checklist · illustrative lead</h2><span>${checklist.completed_count} of ${checklist.item_count} complete</span></div>${checklist.items.map(item=>`<div class="dr-row dr-checkrow"><b title="${esc(item.label)}">${item.label}</b>${pending('Review pending')}<button class="btn btn--sm" type="button">Review</button></div>`).join('')}<form class="dr-section"><h3>Record a checklist outcome</h3><div class="dr-form">${select('outcome','Outcome',['complete','blocked','not_applicable'])}${field('outcome-ref','Internal reference (optional)')}${note('outcome-note','Review note')}${confirm('confirm this outcome; it is not an automatic legal approval.')}</div>${button('Save checklist outcome')}<p class="hint">Completion needs a note or internal reference. Other outcomes require a note. A completed item remains immutable.</p></form></section>`+states;
const EDITOR=header('Revise a document','Keep the earlier version and record why this revision is needed.')+section('Current record · example',`<dl class="dr-facts"><dt>Document</dt><dd>Agency mandate · example</dd><dt>Reference</dt><dd><bdi dir="ltr">DOC-EXAMPLE-1</bdi></dd><dt>Current revision</dt><dd>1 · illustrative</dd><dt>Record status</dt><dd>Active · does not mean signed</dd><dt>File evidence</dt><dd>${pending('Bytes not loaded')}</dd></dl><p>No contract text, company number, cadastral identifier, payment amount or signature is invented in this preview.</p>`)+`<div class="dr-cols">${section('Add the next revision',`<form class="dr-section" style="padding:0">${field('revised-file','Select the revised file','file')}${note('revision-reason','What changed, and why?')}${confirm('have checked this file and confirm the new revision.')}${pending('Revision not saved')}${button('Save revision 2',true)}</form><p class="hint">The source appends the next revision and keeps its actor, time, reason and file digest. A version conflict requires reading the current record again.</p>`)}${section('File evidence',`<dl class="dr-facts"><dt>Type</dt><dd>Awaiting file</dd><dt>Size</dt><dd>Awaiting file</dd><dt>Digest</dt><dd>Awaiting byte verification</dd><dt>Source</dt><dd>Agency · example</dd><dt>Retention</dt><dd>Case file · example class</dd></dl><p>The class is a stored label. No deletion date or legal retention period is asserted.</p>`)}</div>`+section('Signature request',`<p>The source supports an internal request record. External signature providers are not configured; creating this record does not dispatch a document.</p><form class="dr-form">${field('signer-ref','Signer reference')}${field('signer-role','Signer role')}${field('signature-version','Revision to sign','number','1')}${field('signature-expiry','Expiry (optional)','datetime-local')}${note('signature-note','Review note')}${confirm('have checked the signer and selected revision.')}${pending('No provider receipt')}${button('Record signature request')}</form><p class="hint">A signed status requires a provider receipt. Editing the current document must not imply that an earlier signature covers the new revision.</p><p>Source request states: ${SIGNATURE_REQUEST_STATUSES.map(title).join(', ')}.</p>`)+states;
for(const [name,body] of [['Documents',LIST],['DocumentEditor',EDITOR]]){assert.equal((body.match(/btn--accent/g)||[]).length,1);fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active:'documents',body:`<div class="dr">${body}</div>`,extraCss:CSS,height:0,healthText:'Illustrative workspace'}));}
console.log('Documents, DocumentEditor');
