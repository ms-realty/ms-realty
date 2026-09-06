import fs from 'node:fs';
import assert from 'node:assert/strict';
import { page } from '../shell.mjs';
import { sourceListing, sourcePrice, publicLanguages, html } from '../public-shell.mjs';
import { LISTING_STATUSES, LISTING_FACT_EDIT_FIELDS } from '../../../../production/lib/listing-edits.mjs';

const facts=sourceListing.facts;
const editable=['h1','description','location','price_eur','price_on_request','area_sqm','land_area_sqm','bedrooms','condition','listing_status'];
for(const key of editable)assert(LISTING_FACT_EDIT_FIELDS.includes(key));
assert.equal(sourceListing.verification.verified,false,'Refresh the unverified fixture composition when its witness changes');
const CSS=`
  .lcg { display:grid; gap:20px; }
  .lcg .ph { margin:0; }
  .lcg h2 { font-size:16px; }
  .lcg-section { display:grid; gap:16px; padding:20px; min-width:0; }
  .lcg-form,.lcg-cols,.lcg-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; align-items:start; }
  .lcg-wide { grid-column:1/-1; }
  .lcg .in { width:100%; font:inherit; color:var(--text-body); }
  .lcg textarea.in { min-height:144px; resize:vertical; }
  .lcg :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .lcg button:disabled { opacity:.5; cursor:not-allowed; }
  .lcg-check { display:flex; gap:12px; align-items:start; }
  .lcg-check input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--spring-700); }
  .lcg-row { display:grid; grid-template-columns:minmax(0,1fr) 128px 128px 200px 72px; gap:16px; align-items:center; height:44px; padding:0 20px; border-top:1px solid var(--joint); }
  .lcg-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lcg-row:hover { background:var(--tile); }
  .lcg-lang { grid-template-columns:128px minmax(0,1fr) 200px 72px; }
  .lcg-facts { display:grid; grid-template-columns:160px minmax(0,1fr); gap:12px; margin:0; }
  .lcg-facts dt { color:var(--text-muted); }
  .lcg-facts dd { margin:0; overflow-wrap:anywhere; }
  .lcg-state { display:grid; gap:12px; padding-top:20px; border-top:1px solid var(--joint); }
  .lcg-state .btn,.lcg-section > .btn { justify-self:start; }
  .lcg-quote { margin:0; padding:0; border:0; overflow-wrap:anywhere; }
`;
const title=v=>v.charAt(0).toUpperCase()+v.slice(1).replaceAll('_',' ');
const field=(id,label,type='text',value='')=>`<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}" value="${html(value)}"></div>`;
const note=(id,label,value='')=>`<div class="field lcg-wide"><label for="${id}">${label}</label><textarea class="in" id="${id}" dir="auto">${html(value)}</textarea></div>`;
const check=(label,checked=false)=>`<label class="lcg-check"><input type="checkbox"${checked?' checked':''}><span>${label}</span></label>`;
const button=(label,primary=false,disabled=false)=>`<button class="btn${primary?' btn--accent':''}" type="button"${disabled?' disabled':''}>${label}</button>`;
const pending=text=>`<span class="wit wit--none">${text}</span>`;
const section=(name,body)=>`<section class="panel"><div class="panel-hd"><h2>${name}</h2></div><div class="lcg-section">${body}</div></section>`;
const sourceNote=`<p class="muted">Saved Bulgarian fixture · <bdi dir="ltr">${html(facts.id)}</bdi> · no fresh listing or publication approval is asserted.</p>`;
const states=`<div class="lcg-states">${[
  ['No matching records','Keep the current filter visible. Empty results do not establish that the full catalogue is empty.','Change filters'],
  ['Record is loading','Retain its reference and selected language while facts load.','Loading…',true],
  ['Save or review failed','Keep entered values and the review note. No approval is shown as saved.','Review entered values'],
  ['Some evidence is missing','The source text can exist while price, availability, media or language approval is unknown.','Review evidence'],
  ['Many matching records','Keep a single identity line and the current page position.','Next page'],
  ['Source changed during review','Read the latest source before approving a draft or applying an edit based on the older version.','Approve old draft',true],
].map(([name,text,action,disabled])=>`<section class="lcg-state"><h2>${name}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const header=(name,text)=>`<div class="ph"><div><h1>${name}</h1><p>${text}</p></div></div>${sourceNote}`;
const LIST=header('Listings','Keep the source identity, asking-price state and availability witness together.')+section('Find a listing',`<div class="lcg-form">${field('listing-search','Reference, title or location','search')}${field('listing-location','Location','text',facts.location)}</div><p>One saved fixture result. This is not a current stock count.</p><a class="btn btn--accent" href="ListingEditor.html">Open listing editor</a>`)+`<section class="panel"><div class="lcg-row"><b lang="bg" title="${html(sourceListing.h1)}">${html(sourceListing.h1)}</b><span><bdi dir="ltr">${html(facts.id)}</bdi></span><span>${sourcePrice}</span>${pending('Availability not verified')}<button class="btn btn--sm" type="button">Review</button></div></section>`+section('Read the status with its evidence',`<dl class="lcg-facts"><dt>Saved lifecycle</dt><dd>${title(facts.listing_status)} · source value</dd><dt>Availability check</dt><dd>${pending('No reviewer or date')}</dd><dt>Publication approval</dt><dd>${sourceListing.lifecycle.publish_approved?'Present in saved fixture':'Absent in saved fixture'}</dd><dt>Built area</dt><dd>${facts.area_sqm??'Not recorded'}</dd><dt>Bedrooms</dt><dd>${facts.bedrooms??'Not recorded'}</dd></dl><p>Do not treat an available status as a fresh inspection. A missing numeric fact is neither zero nor a guessed value from the description.</p>`)+states;
const EDITOR=header('Review listing facts','Save source-backed changes with their reason; review publication separately.')+section('Source identity',`<blockquote class="lcg-quote" lang="bg">${html(sourceListing.h1)}</blockquote><dl class="lcg-facts"><dt>Reference</dt><dd><bdi dir="ltr">${html(facts.id)}</bdi></dd><dt>Property type</dt><dd>${title(facts.property_type)}</dd><dt>Offer</dt><dd>${title(facts.offer_type)}</dd><dt>Availability</dt><dd>${pending('No reviewer or date')}</dd></dl><p>The reference and URL are not editable in this composition. The separate PR #182 remains draft and unmerged.</p>`)+section('Facts from the saved source',`<form class="lcg-form">${field('listing-h1','Bulgarian title','text',sourceListing.h1)}${field('fact-location','Location','text',facts.location)}${field('fact-price','Price in EUR (unknown if empty)','number',facts.price_eur??'')}${field('fact-area','Built area in m² (unknown if empty)','number',facts.area_sqm??'')}${field('fact-land','Land area in m² (unknown if empty)','number',facts.land_area_sqm??'')}${field('fact-bedrooms','Bedrooms (unknown if empty)','number',facts.bedrooms??'')}${check('Price is on request',facts.price_on_request)}<div class="field"><label for="fact-status">Lifecycle status</label><select class="in" id="fact-status">${LISTING_STATUSES.map(value=>`<option value="${value}"${value===facts.listing_status?' selected':''}>${title(value)}</option>`).join('')}</select></div>${note('fact-description','Bulgarian source description',sourceListing.description)}${note('fact-review','Source reference and reason for the changes')}${check('I, Mariya, have checked the proposed changes against their source.')}${pending('Changes not saved')}${button('Save fact changes',true)}</form><p class="hint">The source description is preserved verbatim in this preview. Its narrative area claims have not been promoted into confirmed numeric fields.</p>`)+`<div class="lcg-cols">${section('Publication decision',`${pending('Publication review needed')}<p>Check facts, media, language and the applicable release gates. Saving an edit must not manufacture missing human reviews.</p>${button('Review publication')}<p class="hint">No public route, indexing flag, canonical URL or redirect is changed by this preview.</p>`)}${section('Media and languages',`${pending('Review records not loaded')}<p>A media count does not prove that each file was inspected. A generated translation does not prove human approval.</p><a href="MediaEditor.html">Review media evidence</a><a href="Translations.html">Review a translation</a>`)}</div>`+states;
const TRANSLATIONS=header('Translations','Read the current Bulgarian source beside the target wording before approving a version.')+`<section class="panel"><div class="panel-hd"><h2>Public languages</h2><span>${publicLanguages.length} languages</span></div>${publicLanguages.map(lang=>`<div class="lcg-row lcg-lang"><b>${html(lang.label||lang.code.toUpperCase())}</b><span>${lang.code==='bg'?'Source text':'Target translation'}</span>${pending(lang.code==='bg'?'Review record not loaded':'Approval not loaded')}<button class="btn btn--sm" type="button">Open</button></div>`).join('')}</section>`+`<div class="lcg-cols">${section('Bulgarian source',`<blockquote class="lcg-quote" lang="bg"><b>${html(sourceListing.h1)}</b><p>${html(sourceListing.description)}</p></blockquote><p>Reference: <bdi dir="ltr">${html(facts.id)}</bdi>. Price: ${sourcePrice}. Confirmed area and bedroom count are not recorded.</p>`)}${section('Target text for review',`<div class="field"><label for="target-language">Target language</label><select class="in" id="target-language">${publicLanguages.filter(lang=>lang.code!=='bg').map(lang=>`<option value="${lang.code}">${html(lang.label||lang.code.toUpperCase())}</option>`).join('')}</select></div>${pending('Draft and human approval missing')}${note('translation-text','Target wording')}${note('translation-review','Source and language review note')}${check('I, Mariya, can review this language and confirm that the wording preserves the current source facts.')}${button('Record approval',true,true)}<p class="hint">Approval is unavailable while no target draft is loaded. Hermes can draft; a person reviews the wording. Publication remains a separate authorised action.</p>`)}</div>`+section('Before a language becomes indexable',`<p>Match the review to the current source and target version. Check every price, area, bedroom count, location and reference. Keep unapproved or stale wording out of the indexable page.</p>${pending('Publication evidence needed')}${button('Review publication',false,true)}<p class="hint">The Bulgarian quotation is preserved as source material. This preview does not approve, publish or index a translation.</p>`)+states;
for(const [name,body,active] of [['Listings',LIST,'listings'],['ListingEditor',EDITOR,'listings'],['Translations',TRANSLATIONS,'translations']]){assert.equal((body.match(/btn--accent/g)||[]).length,1);fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active,body:`<div class="lcg">${body}</div>`,extraCss:CSS,height:0,healthText:'Saved fixture preview'}));}
console.log('Listings, ListingEditor, Translations');
