import fs from 'node:fs';
import assert from 'node:assert/strict';
import { page } from '../shell.mjs';
import { html, publicLanguages } from '../public-shell.mjs';
import { loadLocaleRegistry } from '../../../../production/lib/locales.mjs';
import { sellerPath, contactPath, searchPath, locationPath } from '../../../../production/lib/seo.mjs';
import { readApprovedCmsContent } from '../../../../production/lib/approved-content.mjs';

const registry=loadLocaleRegistry();
const report=JSON.parse(fs.readFileSync(new URL('../../../../production/data/launch-readiness.json',import.meta.url),'utf8'));
const redirects=report.gates.find(g=>g.id==='redirect_reviews');
const guide=readApprovedCmsContent().documents.find(d=>d.type==='guide'&&d.locale==='bg');
const routes=[['Home','/bg','Home'],['Property search',searchPath(registry,'bg'),'Search'],['Sell with us',sellerPath(registry,'bg'),'Seller'],['Contact',contactPath(registry,'bg'),'Contact'],['Sandanski',locationPath(registry,'bg','Sandanski'),'Location'],...(guide?[[guide.title,guide.path,'Guide']]:[])];
assert.equal(new Set(routes.map(r=>r[1])).size,routes.length);
assert.equal(redirects.evidence.resolved_legacy_urls+redirects.evidence.unresolved_legacy_urls,redirects.evidence.total_legacy_urls);
const CSS=`
  .web { display:grid; gap:20px; }
  .web .ph { margin:0; }
  .web h2 { font-size:16px; }
  .web-section { display:grid; gap:16px; padding:20px; min-width:0; }
  .web-cols,.web-form,.web-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
  .web-wide { grid-column:1/-1; }
  .web .in { width:100%; font:inherit; color:var(--text-body); }
  .web textarea.in { min-height:144px; resize:vertical; }
  .web :is(a,button,input,textarea,select):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .web button:disabled { opacity:.5; cursor:not-allowed; }
  .web-check { display:flex; align-items:start; gap:12px; }
  .web-check input { width:16px; height:16px; accent-color:var(--spring-700); flex:0 0 auto; }
  .web-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 112px 200px 64px; align-items:center; gap:16px; height:44px; padding:0 20px; border-top:1px solid var(--joint); }
  .web-row > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .web-row:hover { background:var(--tile); }
  .web-facts { display:grid; grid-template-columns:180px minmax(0,1fr); gap:12px; margin:0; }
  .web-facts dt { color:var(--text-muted); }
  .web-facts dd { margin:0; overflow-wrap:anywhere; }
  .web-state { display:grid; gap:12px; border-top:1px solid var(--joint); padding-top:20px; }
  .web-state .btn,.web-section > .btn { justify-self:start; }
  .web-copy { min-height:144px; display:grid; align-content:center; gap:16px; border-top:1px solid var(--joint); border-bottom:1px solid var(--joint); padding:20px 0; }
`;
const button=(label,primary=false,disabled=false)=>`<button type="button" class="btn${primary?' btn--accent':''}"${disabled?' disabled':''}>${label}</button>`;
const field=(id,label,type='text',value='')=>`<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" type="${type}" value="${html(value)}"></div>`;
const note=(id,label)=>`<div class="field web-wide"><label for="${id}">${label}</label><textarea class="in" id="${id}" dir="auto"></textarea></div>`;
const select=(id,label,values)=>`<div class="field"><label for="${id}">${label}</label><select class="in" id="${id}">${values.map(([value,name])=>`<option value="${value}">${name}</option>`).join('')}</select></div>`;
const witness=text=>`<span class="wit wit--none">${text}</span>`;
const section=(title,body)=>`<section class="panel"><div class="panel-hd"><h2>${title}</h2></div><div class="web-section">${body}</div></section>`;
const confirm=text=>`<label class="web-check"><input type="checkbox"><span>I, Mariya, ${text}</span></label>`;
const states=`<div class="web-states">${[
  ['No matching pages','Keep the selected language and filters visible. A filtered view is not a complete route inventory.','Change filters'],
  ['Content is loading','Keep the selected page identity while its content and review history load.','Loading…',true],
  ['Save or validation failed','Retain the text and review note. The previous published version remains the reference.','Review entered values'],
  ['Some evidence is missing','A page can exist while language approval, media or an external search report is unavailable.','Review missing evidence'],
  ['Many pages or decisions','Keep one identity per row and retain the current page position.','Next page'],
  ['Version changed','Compare the latest version before applying an edit or approval based on older content.','Publish old version',true],
].map(([title,text,action,disabled])=>`<section class="web-state"><h2>${title}</h2><p>${text}</p>${button(action,false,disabled)}</section>`).join('')}</div>`;
const header=(title,text)=>`<div class="ph"><div><h1>${title}</h1><p>${text}</p></div></div>`;
const PAGES=header('Website pages','Keep the page, source language and publication evidence together.')+section('Find a page',`<div class="web-form">${field('page-find','Page title or path','search')}${select('page-language','Language',publicLanguages.map(l=>[l.code,l.label||l.code.toUpperCase()]))}</div><p>Selected route examples from the local source. This is not a current publication or CMS inventory.</p><a class="btn btn--accent" href="PageEditor.html">Prepare a page draft</a>`)+`<section class="panel"><div class="panel-hd"><h2>Bulgarian route examples</h2><span>${routes.length} examples</span></div>${routes.map(([title,path,type])=>`<div class="web-row"><b title="${html(title)}">${html(title)}</b><span title="${html(path)}"><bdi dir="ltr">${html(path)}</bdi></span><span>${type}</span>${witness('Live review not loaded')}<a href="PageEditor.html">Review</a></div>`).join('')}</section>`+`<div class="web-cols">${section('Editing and publication',`<p>A route can be served from a template or approved content. Its presence in this list does not establish that it can already be edited here.</p><p>The page editor is the intended review flow. Source integration and authenticated save/readback remain separate work.</p>${witness('CMS save not verified')}`)}${section('Language review',`<p>Bulgarian is the source language. A translated page needs human approval for its current wording before it can become indexable.</p><p>Keep legal, tax and process claims tied to their reviewed sources. Do not manufacture a review date or reviewer.</p><a href="Translations.html">Review language evidence</a>`)}</div>`+states;
const EDITOR=header('Prepare a page draft','Write the source text, check the preview and record why it should change.')+`<p class="muted">Design preview · no CMS page version is loaded or saved.</p>`+`<div class="web-cols">${section('Bulgarian source draft',`${field('page-title','Page title')}${note('page-copy','Source text')}${field('page-action','Main action label')}${field('page-action-path','Main action destination')}${note('page-sources','Sources supporting factual claims')}${note('page-reason','Reason for this version')}${button('Save draft',true)}<p class="hint">Do not include an unsupported price, response time, fee, business history or legal claim. Drafting does not publish the page.</p>`)}${section('Preview and review',`<div class="web-copy"><h2>Draft preview</h2><p>No wording has been entered. The preview should use the selected page layout and language direction.</p></div>${witness('Source review missing')}${confirm('have checked the current wording, its sources and its intended audience.')}${button('Record source review',false,true)}<p class="hint">Review is unavailable until a current draft is loaded. The saved version needs its own reviewer and date.</p>`)}</div>`+`<div class="web-cols">${section('Search appearance',`${field('page-seo-title','Search title')}${note('page-seo-description','Search description')}<p>The page path and canonical destination are not assigned in this example. A path change must go through the legacy URL review.</p><a href="SeoRedirects.html">Review URL evidence</a>`)}${section('Before publication',`${witness('Publication evidence missing')}<p>Check the current source version, media rights, language approval and any claim-specific review. Inspect desktop and phone previews.</p>${button('Review publication',false,true)}<p>No page is published, translation indexed or form destination changed by this preview.</p>`)}</div>`+states;
const SEO=header('SEO and redirects','Preserve each legacy URL’s reviewed outcome and verify its current behaviour.')+`<p class="muted">Saved launch report: <bdi dir="ltr">${html(report.generated_at)}</bdi>. Historical evidence; not a fresh production check.</p>`+`<div class="web-cols">${section('Saved redirect decisions',`<dl class="web-facts"><dt>Legacy URLs</dt><dd>${redirects.evidence.total_legacy_urls}</dd><dt>Resolved</dt><dd>${redirects.evidence.resolved_legacy_urls}</dd><dt>Unresolved</dt><dd>${redirects.evidence.unresolved_legacy_urls}</dd><dt>Retain 200</dt><dd>${redirects.evidence.decision_statuses['200']}</dd><dt>Redirect 301</dt><dd>${redirects.evidence.decision_statuses['301']}</dd><dt>Approved 410</dt><dd>${redirects.evidence.decision_statuses['410']}</dd></dl><p>The sealed preservation contract carries specific approved exceptions. This editor cannot invent new homepage or search fallbacks.</p>${witness('Live crawl not checked')}`)}${section('Find the exact old URL',`${field('legacy-url','Legacy URL','url')}${select('legacy-domain','Source domain',[['makler-realty.com','makler-realty.com'],['makler-realty.ru','makler-realty.ru']])}${button('Load reviewed decision',true)}<p>Load the known crawl record, its existing decision and the equivalent content before proposing a change.</p>${witness('No URL selected')}`)}</div>`+section('Review a proposed change',`<form class="web-form">${select('route-decision','Outcome',[['redirect_301','Redirect 301 to equivalent content'],['retain_200','Retain 200 with equivalent content'],['approved_410','Approved 410, no equivalent content']])}${field('route-target','Equivalent internal path (200 or 301 only)')}${note('route-reason','Evidence and reason for the decision')}${confirm('have checked the original URL, the proposed outcome and its supporting evidence.')}${button('Record decision',false,true)}</form><p>Unavailable until a known old URL is loaded. A 410 decision has no target; 200 and 301 decisions require verified equivalent content. Recording a decision and deploying it are separate actions.</p>`)+`<div class="web-cols">${section('Release boundary',`<p>PR #182 remains draft and unmerged. The listing-reference change must not enter this redesign release through an incidental merge.</p><p>The saved report still lists ${report.blockers.length} launch blockers: ${report.blockers.map(x=>html(x.replaceAll('_',' '))).join(', ')}.</p><a href="LaunchReadiness.html">Review launch evidence</a>`)}${section('External search evidence',`${witness('Fresh reports not loaded')}<p>Check current Search Console, Yandex Webmaster, backlinks, sitemap and crawl reports against the deployed version.</p><p>A generated redirect file or successful local test is not evidence that the live URL returns its intended outcome.</p>`)}</div>`+states;
for(const [name,body] of [['SitePages',PAGES],['PageEditor',EDITOR],['SeoRedirects',SEO]]){assert.equal((body.match(/btn--accent/g)||[]).length,1);fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active:'website',body:`<div class="web">${body}</div>`,extraCss:CSS,height:0,healthText:'Saved source preview'}));}
console.log('SitePages, PageEditor, SeoRedirects');
