import assert from 'node:assert/strict';
import test from 'node:test';
import { loadListings } from '../lib/content.mjs';
import { loadLocaleRegistry } from '../lib/locales.mjs';
import { renderLocationPage } from '../lib/public-site.mjs';
import { renderReactPublicBody } from '../lib/react-public-site.mjs';

const registry = loadLocaleRegistry();
const listings = loadListings();
for (const localeCode of ['bg', 'en', 'de', 'nl', 'ru', 'el', 'he']) {
  test(`Location preserves catalogue scope, real cards and native discovery actions in ${localeCode}`, () => {
    const page = renderLocationPage({ registry, listings, localeCode, location: 'Sandanski' });
    const html = renderReactPublicBody(page);
    const url = new URL(page.body.search_href, 'https://example.test');
    const form = html.match(/<form class="loc-search"[\s\S]*?<\/form>/)?.[0];
    assert.ok(form);
    for (const [key, value] of url.searchParams) {
      assert.ok(form.includes(`name="${key}" value="${value}"`));
    }
    assert.match(form, /name="offer_type"/);
    assert.match(form, /name="price_max" type="number" min="0" step="any"/);
    assert.match(form, /<label><span>[^<]+<\/span><input name="price_max"/);
    for (const family of ['apartment', 'house', 'land', 'commercial']) {
      const href = new URL(url); href.searchParams.set('property_family', family);
      assert.ok(html.includes(`href="${href.pathname}${href.search.replaceAll('&', '&amp;')}" data-location-family="${family}"`));
    }
    for (const offer of ['sale', 'rent']) {
      const href = new URL(url); href.searchParams.set('offer_type', offer);
      assert.ok(html.includes(`href="${href.pathname}${href.search.replaceAll('&', '&amp;')}"`));
    }
    const order = ['class="loc-hero"', 'class="loc-panorama"', 'class="loc-story loc-story--photo"', 'class="loc-types"', 'id="location-listings"'].map((value) => html.indexOf(value));
    assert.ok(order.every((value, index) => value >= 0 && (!index || value > order[index - 1])));
    for (const card of page.cards) assert.ok(html.includes(`data-listing-id="${card.id}"`), card.id);
    assert.ok(html.includes(`data-location-count="${page.body.listing_count}"`));
    assert.match(html, /File:Sandan1.JPG/);
    assert.match(html, /creativecommons.org\/licenses\/by-sa\/3.0/);
    assert.doesNotMatch(html, /EXPLORE SANDANSKI|undefined/);
    if (localeCode === 'he') assert.equal(page.dir, 'rtl');
  });
}
test('other locations keep their own identity and an honest empty state', () => {
  const page = renderLocationPage({ registry, listings: [], localeCode: 'en', location: 'Petrich' });
  const html = renderReactPublicBody(page);
  assert.match(html, /data-location-empty="true"/);
  assert.doesNotMatch(html, /class="loc-panorama"|class="loc-story__photo"|An inland spa town|data-location-listings="true"/);
  assert.ok(html.includes(page.body.h1));
});
