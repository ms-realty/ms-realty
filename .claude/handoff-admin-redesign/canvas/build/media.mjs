import fs from 'node:fs';
import assert from 'node:assert/strict';
import { page, icon } from '../shell.mjs';
import { sourceListing, html } from '../public-shell.mjs';
import { MEDIA_UPLOAD_KINDS, mediaUploadLimitsFromEnv } from '../../../../production/lib/media-uploads.mjs';
import { createMediaReview, mediaAssetId } from '../../../../production/lib/media-reviews.mjs';

const limits=mediaUploadLimitsFromEnv({});
const asset=sourceListing.media.gallery[0];
const seed={records:[{id:sourceListing.facts.id,collection:'listings',media:[asset]}]};
const reviewInput={listingId:sourceListing.facts.id,assetId:mediaAssetId(asset),reviewer:'Canvas example',reviewConfirmed:true,decision:'keep_private',kind:'photo'};
assert.equal(createMediaReview(seed,reviewInput,'2026-09-05T00:00:00Z').is_public,false);
assert.throws(()=>createMediaReview(seed,{...reviewInput,reviewConfirmed:false},'2026-09-05T00:00:00Z'));
assert.throws(()=>createMediaReview(seed,{...reviewInput,decision:'publish',alt:''},'2026-09-05T00:00:00Z'));
const CSS=`
  .med { display:grid; gap:20px; }
  .med .ph { margin:0; }
  .med h2 { font-size:16px; }
  .med-section { display:grid; gap:16px; padding:20px; min-width:0; }
  .med-cols,.med-form,.med-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
  .med-wide { grid-column:1/-1; }
  .med .in { width:100%; font:inherit; color:var(--text-body); }
  .med textarea.in { min-height:96px; resize:vertical; }
  .med :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .med button:disabled { opacity:.5; cursor:not-allowed; }
  .med-check { display:flex; align-items:start; gap:12px; }
  .med-check input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--spring-700); }
  .med-photo { min-height:240px; display:grid; place-content:center; justify-items:center; gap:16px; padding:24px; background:var(--tile); border:1px solid var(--joint); color:var(--text-muted); text-align:center; }
  .med-photo p { max-width:320px; }
  .med-row { display:grid; grid-template-columns:minmax(0,1fr) 180px 200px 80px; gap:16px; align-items:center; height:44px; border-top:1px solid var(--joint); padding:0 20px; }
  .med-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .med-row:hover { background:var(--tile); }
  .med-facts { display:grid; grid-template-columns:128px minmax(0,1fr); gap:12px; margin:0; }
  .med-facts dt { color:var(--text-muted); }
  .med-facts dd { margin:0; overflow-wrap:anywhere; }
  .med-state { display:grid; gap:12px; border-top:1px solid var(--joint); padding-top:20px; }
  .med-state .btn,.med-section > .btn { justify-self:start; }
`;
const button=(label,primary=false,disabled=false)=>`<button type="button" class="btn${primary?' btn--accent':''}"${disabled?' disabled':''}>${label}</button>`;
const field=(id,label,type='text',value='')=>`<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}" value="${html(value)}"></div>`;
const note=(id,label,value='')=>`<div class="field med-wide"><label for="${id}">${label}</label><textarea class="in" id="${id}" dir="auto">${html(value)}</textarea></div>`;
const select=(id,label,values)=>`<div class="field"><label for="${id}">${label}</label><select class="in" id="${id}">${values.map(([value,name])=>`<option value="${value}">${name}</option>`).join('')}</select></div>`;
const witness=text=>`<span class="wit wit--none">${text}</span>`;
const section=(title,body)=>`<section class="panel"><div class="panel-hd"><h2>${title}</h2></div><div class="med-section">${body}</div></section>`;
const photo=`<div class="med-photo" role="img" aria-label="Photo placeholder; image not loaded">${icon('image',28)}<b>Photo placeholder</b><p>No image bytes are loaded in this design. Inspect the actual asset before reviewing it.</p></div>`;
const identity=`<dl class="med-facts"><dt>Listing</dt><dd><bdi dir="ltr">${html(sourceListing.facts.id)}</bdi></dd><dt>File name</dt><dd>${html(new URL(asset.url).pathname.split('/').at(-1))}</dd><dt>Source URL</dt><dd><bdi dir="ltr">${html(asset.url)}</bdi></dd><dt>Review witness</dt><dd>${witness('No named review loaded')}</dd></dl>`;
const states=`<div class="med-states">${[
  ['No matching assets','Keep the listing and filters visible. A filtered empty view is not proof that storage is empty.','Change filters'],
  ['Image is loading','Keep the file identity visible and wait for the actual image before reviewing it.','Loading…',true],
  ['Upload or review failed','Retain the selected listing and note. Do not label the file as saved or approved.','Review entered values'],
  ['Metadata without image bytes','A file name, URL or thumbnail does not prove that the original is accessible.','Review missing image'],
  ['Many assets','Keep the selected asset and page position. Inspect each asset before making its decision.','Next page'],
  ['Saved review, delivery unknown','Read back the original decision and public asset before repeating an action.','Publish again',true],
].map(([title,text,action,disabled])=>`<section class="med-state"><h2>${title}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const header=(title,text)=>`<div class="ph"><div><h1>${title}</h1><p>${text}</p></div></div><p class="muted">Saved fixture · image bytes and live media reviews are not loaded.</p>`;
const LIBRARY=header('Media','Find the right asset, inspect it, then record its intended use.')+section('Find media',`<div class="med-form">${field('media-find','File name or listing reference','search')}${select('media-kind','Asset kind',[['all','All kinds'],['photo','Photo'],['floor_plan','Floor plan'],['video','Video']])}</div><p>One gallery entry in the saved listing fixture. This is not a storage inventory.</p><a class="btn btn--accent" href="MediaEditor.html">Review selected asset</a>`)+`<section class="panel"><div class="med-row"><b>${html(new URL(asset.url).pathname.split('/').at(-1))}</b><span>${html(sourceListing.facts.id)}</span>${witness('Review not loaded')}<a href="MediaEditor.html">Review</a></div></section>`+`<div class="med-cols">${section('Selected asset',photo+identity)}${section('Upload to a listing',`<p>Choose the listing before selecting files. Uploading does not approve publication.</p>${field('upload-listing','Listing reference','text',sourceListing.facts.id)}${select('upload-kind','Upload kind',MEDIA_UPLOAD_KINDS.map(v=>[v,v==='photo'?'Photo':'Floor plan']))}<div class="field"><label for="upload-files">Photos or floor plans</label><input class="in" id="upload-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif"></div><p class="hint">Source defaults: up to ${limits.maxFiles} files, ${limits.maxFileBytes/1024/1024} MiB each and ${limits.maxRequestBytes/1024/1024} MiB per request. The runtime may impose lower limits. Files must pass image validation.</p>${witness('No upload receipt')}${button('Upload for review')}<p class="hint">Photos submitted with a public enquiry stay with that enquiry. They do not enter a listing gallery through this form.</p>`)}</div>`+states;
const EDITOR=header('Review media','A public-use decision needs the actual image and a named human review.')+`<div class="med-cols">${section('Inspect the asset',photo+identity)}${section('Record a review',`${witness('Image inspection required')}${select('review-decision','Use',[['keep_private','Keep private'],['publish','Approve public use']])}${select('review-kind','Kind',[['photo','Photo'],['floor_plan','Floor plan'],['video','Video']])}${note('review-alt','Alternative text or accessibility caption')}${field('replacement-url','Replacement URL (if needed)','url')}${note('review-note','Review note and reason')}<label class="med-check"><input type="checkbox"><span>I, Mariya, have inspected the actual asset and confirm this decision.</span></label>${button('Record media review',true,true)}<p class="hint">Unavailable while the image is not loaded. Public use requires alternative text and an allowed asset URL. A private decision does not delete the file.</p>`)}</div>`+`<div class="med-cols">${section('Replace an asset',`<p>Select a replacement file for this exact asset. Inspect it and record its own review before it replaces the public version.</p><div class="field"><label for="replacement-file">Replacement photo or floor plan</label><input class="in" id="replacement-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></div>${button('Upload replacement for review')}${witness('No replacement receipt')}`)}${section('Readback after a decision',`<p>Show the saved reviewer, date and decision beside this asset. Confirm its actual public or private state from the returned record.</p>${witness('Decision not recorded')}<p>Do not claim a crop, redaction, checksum, removed metadata or served rendition without evidence for the actual file.</p><a href="MediaStates.html">Review media state examples</a>`)}</div>`+states;
for(const [name,body] of [['Media',LIBRARY],['MediaEditor',EDITOR]]){assert.equal((body.match(/btn--accent/g)||[]).length,1);fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active:'website',body:`<div class="med">${body}</div>`,extraCss:CSS,height:0,healthText:'Saved fixture preview'}));}
console.log('Media, MediaEditor');
