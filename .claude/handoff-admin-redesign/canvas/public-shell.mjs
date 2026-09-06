import fs from 'node:fs';
import assert from 'node:assert/strict';
import { BASE, FONT_LINKS } from './shell.mjs';
export { icon } from './shell.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('../../../production/data/public-fixtures.json', import.meta.url), 'utf8'));
export const sourceListing = fixtures.listing_bg.body;
export const publicContact = fixtures.listing_bg.chrome.contact;
export const publicLanguages = fixtures.listing_bg.chrome.languages;
assert.equal(sourceListing.facts.id, fixtures.source_listing_id);
assert.equal(new Set(publicLanguages.map(l => l.code)).size, 7);
export const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sourcePrice = sourceListing.facts.price_eur == null ? 'Price on request' : new Intl.NumberFormat('en-GB', {style:'currency',currency:'EUR',maximumFractionDigits:0}).format(sourceListing.facts.price_eur);

export const PUB_CSS = `
  .pub { background:var(--tile); color:var(--text-body); font:16px/1.5 var(--font-sans); font-variant-numeric:tabular-nums; }
  .pub a { color:var(--spring-700); text-underline-offset:4px; }
  .pub :is(a,button,input,select,textarea):focus-visible { outline:2px solid var(--spring-700); outline-offset:4px; }
  .pub .band :is(a,button,input,select,textarea):focus-visible { outline-color:var(--field-text); }
  .pub button:disabled { opacity:.5; cursor:not-allowed; }
  .pub .pub-wrap { max-width:1240px; margin:0 auto; padding:0 32px; }
  .pub .pub-top { border-bottom:1px solid var(--joint); background:var(--tile-glaze); }
  .pub .pub-bar { display:flex; align-items:center; gap:24px; min-height:96px; }
  .pub .pub-bar img { width:96px; height:auto; display:block; }
  .pub .pub-nav { display:flex; gap:24px; align-items:center; }
  .pub .pub-nav a { color:var(--text-body); font-size:16px; }
  .pub .pub-nav [aria-current] { text-decoration:underline; font-weight:600; }
  .pub .pub-language { margin-inline-start:auto; display:flex; align-items:center; gap:12px; }
  .pub .pub-language select { width:160px; }
  .pub .pbtn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:8px 20px; border:1px solid var(--border-control); border-radius:var(--r-edge); background:var(--tile-glaze); color:var(--text-strong); font:600 16px/1.3 var(--font-sans); text-decoration:none; cursor:pointer; }
  .pub .pbtn:hover { background:var(--tile-deep); }
  .pub .pbtn--accent { background:var(--brick-600); border-color:var(--brick-600); color:var(--tile-glaze); }
  .pub .pbtn--accent:hover { background:var(--brick-700); border-color:var(--brick-700); }
  .pub .pbtn--ghost { background:transparent; }
  .pub .band .pbtn--accent { border-color:var(--field-text); }
  .pub .band .pbtn--ghost { color:var(--field-text); border-color:var(--field-muted); }
  .pub .band .pbtn--ghost:hover { background:var(--spring-900); }
  .pub .band { padding:48px 0; }
  .pub .band :is(h1,h2,p,label) { color:var(--field-text); }
  .pub .band .meta { color:var(--field-muted); }
  .pub .band a:not(.pbtn) { color:var(--field-text); }
  .pub .band .wit--none { color:var(--field-text); }
  .pub .display { font-size:47px; font-weight:800; }
  .pub h2 { font-size:27px; line-height:1.3; color:var(--text-strong); }
  .pub h3 { font-size:19px; line-height:1.4; color:var(--text-strong); }
  .pub .pub-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:32px; align-items:start; }
  .pub .pub-hero { align-items:center; gap:48px; }
  .pub .pub-stack { display:grid; gap:20px; min-width:0; align-content:start; }
  .pub .pub-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  .pub .pub-section { padding:48px 0; border-bottom:1px solid var(--joint); }
  .pub .pub-section-hd { display:flex; align-items:end; justify-content:space-between; gap:24px; margin-bottom:24px; }
  .pub .photo { min-height:256px; display:grid; place-items:center; padding:32px; text-align:center; background:var(--tile-deep); color:var(--text-body); border:1px solid var(--joint); border-radius:var(--r-panel); font-size:13px; }
  .pub .photo--hero { min-height:384px; }
  .pub .meta { font-size:13px; color:var(--text-muted); }
  .pub .pub-field { display:grid; gap:8px; min-width:0; }
  .pub .pub-field label { font-size:16px; font-weight:600; }
  .pub :is(input:not([type=checkbox]):not([type=radio]),select,textarea) { display:block; min-width:0; width:100%; min-height:48px; padding:12px 16px; background:var(--tile-glaze); border:1px solid var(--border-control); border-radius:var(--r-edge); color:var(--text-body); font:16px/1.5 var(--font-sans); }
  .pub textarea { min-height:128px; resize:vertical; }
  .pub .pub-check { display:flex; align-items:start; gap:12px; }
  .pub .pub-check input { width:20px; height:20px; margin-top:4px; accent-color:var(--spring-700); flex:0 0 auto; }
  .pub .pub-form { padding:24px; border:1px solid var(--joint); background:var(--tile-glaze); border-radius:var(--r-panel); display:grid; gap:20px; }
  .pub .band .pub-form :is(h2,p,label) { color:var(--text-body); }
  .pub .band .pub-form a:not(.pbtn) { color:var(--spring-700); }
  .pub .band .pub-form :focus-visible { outline-color:var(--spring-700); }
  .pub .pub-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; }
  .pub .pub-card { min-width:0; border-top:1px solid var(--joint); display:grid; gap:16px; padding-top:20px; }
  .pub .pub-card .photo { min-height:192px; }
  .pub .pub-card h3 { overflow-wrap:anywhere; }
  .pub .pub-price { font:600 27px/1.3 var(--font-sans); color:var(--text-strong); font-variant-numeric:tabular-nums; }
  .pub .pub-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 24px; margin:0; }
  .pub .pub-facts > div { padding:16px 0; border-bottom:1px solid var(--joint); }
  .pub .pub-facts dt { font-size:13px; color:var(--text-muted); }
  .pub .pub-facts dd { margin:4px 0 0; font-weight:600; overflow-wrap:anywhere; }
  .pub .pub-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px 32px; }
  .pub .pub-state { display:grid; gap:12px; border-top:1px solid var(--joint); padding-top:20px; align-content:start; }
  .pub .pub-state .pbtn { justify-self:start; }
  .pub .pub-foot { padding:48px 0; background:var(--tile-deep); border-top:1px solid var(--joint); }
  .pub .pub-foot .pub-grid { grid-template-columns:2fr 1fr 1fr; }
  .pub .pub-foot a { display:inline-block; min-height:44px; }
  .pub .pub-note { border-inline-start:4px solid var(--spring-700); padding-inline-start:20px; }
  .pub .pub-form-error { color:var(--danger-600); }
`;

export function pubHeader(active = '') {
  return `<header class="pub-top"><div class="pub-wrap pub-bar"><a href="PublicHome.html" aria-label="MS Realty home"><img src="ms-realty-logo.png" alt="MS Realty"></a><nav class="pub-nav" aria-label="Main navigation">${[['Properties','search','PublicSearch'],['Locations','loc','PublicLocation'],['Sell a property','sell','PublicSeller'],['Contact','contact','PublicContact']].map(([label,id,target])=>`<a href="${target}.html"${active===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="pub-language"><label for="public-language">Language</label><select id="public-language">${publicLanguages.map(l=>`<option value="${l.code}"${l.code==='en'?' selected':''}>${html(l.label)}</option>`).join('')}</select></div></div></header>`;
}
export function pubFooter() {
  return `<footer class="pub-foot"><div class="pub-wrap pub-grid"><div class="pub-stack"><h2>MS Realty</h2><p>Property enquiries in Sandanski and the region.</p><p class="meta">Design preview · listing and contact examples come from saved repository fixtures. Current availability and approvals need live confirmation.</p></div><nav aria-label="Explore"><h3>Explore</h3><a href="PublicSearch.html">Find a property</a><br><a href="PublicLocation.html">Sandanski</a><br><a href="PublicSeller.html">Sell a property</a></nav><nav aria-label="Contact and privacy"><h3>Your enquiry</h3><a href="PublicContact.html">Contact the agency</a><br><a href="PublicContact.html#privacy">How we use your details</a><p class="meta">Bulgarian is the source language. Public translations need human approval.</p></nav></div></footer>`;
}
export function pubStates(rows) {
  return `<section class="pub-section"><div class="pub-wrap pub-stack"><h2>Other states</h2><p class="meta">Design examples · these controls do not send requests.</p><div class="pub-states">${rows.map(([title,body,action,disabled=false])=>`<section class="pub-state"><h3>${title}</h3><p>${body}</p>${action?`<button class="pbtn" type="button"${disabled?' disabled':''}>${action}</button>`:''}</section>`).join('')}</div></div></section>`;
}
export function pubListingCard() {
  return `<article class="pub-card"><div class="photo">[PHOTOGRAPH — listing exterior, to be supplied]</div><p class="pub-price">${sourcePrice}</p><span class="wit wit--none">Availability not verified</span><h3 lang="bg">${html(sourceListing.h1)}</h3><p><span lang="bg">${html(sourceListing.facts.location)}</span> · ${html(sourceListing.facts.id)}</p><p class="meta">Bulgarian source title · saved listing fixture</p><a class="pbtn" href="PublicListing.html">Read the listing</a></article>`;
}
export function pubPage({body, extraCss='',width=1440,height=0,dir='ltr',lang='en'}) {
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc><helmet>${FONT_LINKS}<style>${BASE}${PUB_CSS}${extraCss}</style></helmet><div class="pub" lang="${lang}" dir="${dir}" style="width:${width}px;min-height:${height}px">${body}</div></x-dc></body></html>`;
}
