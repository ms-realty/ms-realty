import assert from 'node:assert/strict';
import test from 'node:test';
import {loadListings} from '../lib/content.mjs';
import {loadLocaleRegistry} from '../lib/locales.mjs';
import {labelsFor, renderHomePage, renderSearchPage} from '../lib/public-site.mjs';
import {renderReactPublicBody} from '../lib/react-public-site.mjs';

const registry=loadLocaleRegistry(), listings=loadListings();
const locales=['bg','en','de','nl','ru','el','he'];
const attr=(tag,name)=>tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

test('the sort control retains a localized name when its visible mobile label is hidden',()=>{
  for(const localeCode of locales){
    const html=renderReactPublicBody(renderSearchPage({registry,listings,localeCode}));
    const select=html.match(/<select\b[^>]*name="sort"[^>]*>/)?.[0];
    assert(select,localeCode);
    assert.equal(attr(select,'aria-label'),labelsFor(localeCode).sort,localeCode);
  }
});

test('the language summary name includes the visible locale abbreviation',()=>{
  for(const localeCode of locales){
    const html=renderReactPublicBody(renderHomePage({registry,listings,localeCode}));
    const summary=html.match(/data-language-switcher="desktop"><summary\b[^>]*>/)?.[0];
    assert(summary,localeCode);
    assert(attr(summary,'aria-label').includes(localeCode.toUpperCase()),localeCode);
  }
});

test('card action landmarks identify their listing and keep distinct names',()=>{
  for(const localeCode of locales){
    const html=renderReactPublicBody(renderSearchPage({registry,listings,localeCode}));
    const cards=[...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
    assert(cards.length>1,localeCode);
    const names=cards.map(([,attrs,body])=>{
      const id=attr(attrs,'data-listing-id');
      const nav=body.match(/<nav\b[^>]*class="mk-pcard__actions"[^>]*>/)?.[0];
      const name=attr(nav||'','aria-label');
      assert(name?.includes(id),`${localeCode} ${id}`);
      return name;
    });
    assert.equal(new Set(names).size,names.length,localeCode);
  }
});

test('fallback cards keep source title language while localized controls inherit the UI language',()=>{
  for(const localeCode of ['en','de','nl','el','he']){
    const html=renderReactPublicBody(renderSearchPage({registry,listings,localeCode}));
    const cards=[...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
    const fallback=cards.filter(([,attrs])=>attr(attrs,'data-content-language')==='bg');
    assert(fallback.length>0,localeCode);
    for(const [,attrs,body] of fallback){
      assert.equal(attr(attrs,'lang'),localeCode,`${localeCode}: card UI language`);
      const title=body.match(/<h2\b[^>]*class="mk-pcard__title"[^>]*>/)?.[0];
      assert.equal(attr(title||'','lang'),'bg',`${localeCode}: source title language`);
      assert.match(body,/data-card-source-language="bg" lang="bg"[^>]*>BG</);
      const actions=body.match(/<nav\b[^>]*class="mk-pcard__actions"[^>]*>/)?.[0];
      assert.equal(attr(actions||'','lang'),undefined,'localized action text inherits the card UI language');
    }
  }
});
