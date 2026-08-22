import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderHomePage } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";
import { LOGO_URL, LOGO_URL_REVERSED } from "../lib/ui/design-assets.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();

test("home hero has responsive local imagery and a lean, accessible search contract", () => {
  const html = renderReactPublicBody(renderHomePage({ registry, listings, localeCode: "en" }));

  assert.match(html, /data-hero-gallery="true"[^>]*data-hero-gallery-interval="7000"[^>]*aria-roledescription="carousel"/);
  assert.equal((html.match(/data-hero-gallery-slide=/g) || []).length, 4);
  assert.match(html, /media="\(max-width: 679px\)" type="image\/avif" srcSet="\/hero\/sandanski-640\.avif 640w, \/hero\/sandanski-1280\.avif 1280w" sizes="100vw"/);
  assert.match(html, /type="image\/webp" srcSet="\/hero\/sozopol-town-1280\.webp 1280w, \/hero\/sozopol-town-1920\.webp 1920w" sizes="100vw"/);
  assert.match(html, /data-hero-gallery-slide="2"[^>]*hidden/);
  assert.match(html, /data-hero-gallery-status="true">Gallery 1 \/ 4<\/span>/);
  assert.doesNotMatch(html, /data-hero-gallery-(?:previous|next)/);
  assert.match(html, /data-hero-gallery-slide="1"[^>]*style="--hero-object-position:50% 54%;--hero-mobile-object-position:54% 50%"/);
  assert.equal((html.match(/data-hero-mobile-only="true"/g) || []).length, 1);
  assert.match(LOGO_URL, /^\/vendor\/ms-realty-logo-[a-f0-9]{12}\.png$/);
  assert.match(LOGO_URL_REVERSED, /^\/vendor\/ms-realty-logo-reversed-[a-f0-9]{12}\.png$/);
  assert.equal(existsSync(new URL(`../../public${LOGO_URL}`, import.meta.url)), true);
  assert.equal(existsSync(new URL(`../../public${LOGO_URL_REVERSED}`, import.meta.url)), true);
  assert.doesNotMatch(html, /data:image\/png;base64/);
  assert.match(html, /class="site-ft__logo"[^>]*><img[^>]*loading="lazy" decoding="async"/);

  assert.match(html, /id="home-hero-search-form" class="hp-search" action="\/en\/search" method="get" role="search" aria-label="Search" data-hero-search="true"/);
  const form = html.slice(html.indexOf('id="home-hero-search-form"'), html.indexOf("</form>", html.indexOf('id="home-hero-search-form"')));
  // Buy / Rent is the first decision, so it sits above the card as a radio group.
  assert.match(form, /<fieldset class="hp-search__intent" data-search-intent="true"><legend class="mk-sr-only">Offer<\/legend>/);
  assert.match(form, /<label class="hp-search__tab"><input type="radio" name="offer_type" value="sale" checked><span>Buy<\/span><\/label>/);
  assert.match(form, /<label class="hp-search__tab"><input type="radio" name="offer_type" value="rent"><span>Rent<\/span><\/label>/);
  // One row: Location, Type, Max price, Search.
  assert.match(form, /data-geography-combobox="true"[^>]*data-geography-endpoint="\/api\/geography"[^>]*data-geography-locale="en"/);
  assert.match(form, /<label class="hp-search__label" for="home-search-q">Location<\/label>/);
  assert.match(form, /id="home-search-q" name="location" type="search" class="hp-search__input mk-searchbar__input" autocomplete="off" placeholder="City, town or region" role="combobox"/);
  assert.match(form, /aria-autocomplete="list" aria-haspopup="listbox" aria-controls="home-search-location-options" aria-expanded="false"/);
  assert.match(form, /type="hidden" name="geography_id" value="" data-geography-id="true"/);
  assert.match(form, /id="home-search-location-options" class="hp-hero__location-options" role="listbox" aria-label="Location suggestions"[^>]*hidden/);
  assert.match(form, /<label class="hp-search__label" for="home-search-type">Type<\/label>/);
  assert.match(form, /<select id="home-search-type" name="property_family" class="hp-search__input" data-hero-family="true"><option value="">Any<\/option><option value="apartment">Apartment<\/option>/);
  for (const family of ["apartment", "house", "plot", "agricultural_land", "commercial", "hotel"]) {
    assert.match(form, new RegExp(`<option value="${family}">`));
  }
  assert.match(form, /<option value="agricultural_land">Agricultural land<\/option>/);
  assert.match(form, /<label class="hp-search__label" for="home-search-price-max">Max price<\/label>/);
  assert.match(form, /<select id="home-search-price-max" name="price_max" class="hp-search__input" data-price-presets="true" data-price-any="Any" data-price-sale="50000\|€50,000;75000\|€75,000;[^"]*1000000\|€1,000,000" data-price-rent="300\|€300 per month;[^"]*2000\|€2,000 per month">/);
  assert.match(form, /<option value="">Any<\/option><option value="50000">€50,000<\/option>/);
  assert.equal((form.match(/type="submit"/g) || []).length, 1);
  assert.match(form, /class="hp-search__go mk-search__go" type="submit">[\s\S]*?<span>Search<\/span><\/button>/);
  // Secondary filters are disclosed natively, without JavaScript.
  assert.match(form, /<details class="hp-search__more" data-hero-more-filters="true"><summary class="hp-search__more-summary">/);
  assert.match(form, /<span data-more-label="More filters" data-fewer-label="Fewer filters">More filters<\/span>/);
  assert.match(form, /<select id="home-search-bedrooms-min" name="bedrooms_min" data-hero-bedrooms="true"><option value="">Any<\/option><option value="1">1\+<\/option>/);
  assert.match(form, /<select id="home-search-price-min" name="price_min" data-price-presets="true"/);
  assert.match(form, /id="home-search-area-min" name="area_min" type="number" min="0" step="any" inputmode="decimal"/);
  assert.match(form, /id="home-search-area-max" name="area_max" type="number"/);
  assert.match(form, /<button class="mk-btn mk-btn--ghost mk-btn--sm" type="reset">/);
  // Administrative geography, keyword, sort and view controls belong to the results page.
  for (const name of ["q", "country_code", "region_id", "municipality", "district", "sort", "view", "property_type"]) {
    assert.doesNotMatch(form, new RegExp(`name="${name}"`));
  }
  assert.doesNotMatch(form, /hp-hero__family|hp-hero__advanced|mk-search__seg/);
  assert.doesNotMatch(html, /hp-hero__eyebrow/);
  assert.doesNotMatch(form, /—/);

  for (const asset of [
    "sandanski-640.avif",
    "sandanski-town-1920.webp",
    "belogradchik-1920.avif",
    "sozopol-town-1920.webp",
    "sandanski-hotel-686.avif",
    "ATTRIBUTION.md",
  ]) {
    assert.equal(existsSync(new URL(`../../public/hero/${asset}`, import.meta.url)), true, asset);
  }
  const attribution = readFileSync(new URL("../../public/hero/ATTRIBUTION.md", import.meta.url), "utf8");
  assert.match(attribution, /Interact-Bulgaria/);
  assert.match(attribution, /Bovlad62/);
  assert.match(attribution, /R\.Koch/);
  assert.match(attribution, /CC BY-SA 4\.0/);
  assert.match(attribution, /CC BY-SA 3\.0/);
});

test("hero enhancement pauses for motion preference, hover, and focus while the search card stays usable without JavaScript", () => {
  const css = readFileSync(new URL("../lib/ui/adapter-public.css", import.meta.url), "utf8");
  const adapterCss = readFileSync(new URL("../lib/ui/adapter.css", import.meta.url), "utf8");

  assert.match(PUBLIC_APP_JS, /function initHeroGallery\(\)/);
  assert.match(PUBLIC_APP_JS, /prefers-reduced-motion: reduce/);
  assert.match(PUBLIC_APP_JS, /window\.matchMedia\("\(max-width: 679px\)"\)/);
  assert.match(PUBLIC_APP_JS, /function availableSlides\(\)/);
  assert.match(PUBLIC_APP_JS, /gallery\.addEventListener\("pointerenter"/);
  assert.match(PUBLIC_APP_JS, /gallery\.addEventListener\("focusin"/);
  assert.match(PUBLIC_APP_JS, /document\.addEventListener\("visibilitychange", schedule\)/);
  assert.doesNotMatch(PUBLIC_APP_JS, /data-hero-gallery-(?:previous|next)/);
  assert.match(PUBLIC_APP_JS, /function initGeographyComboboxes\(\)/);
  assert.match(PUBLIC_APP_JS, /document\.querySelectorAll\("\[data-geography-combobox\]"\)/);
  assert.match(PUBLIC_APP_JS, /function initGeographyCombobox\(combobox\)/);
  assert.match(PUBLIC_APP_JS, /function initHeroSearch\(\)/);
  assert.match(PUBLIC_APP_JS, /var form = document\.querySelector\("\[data-hero-search\]"\)/);
  assert.match(PUBLIC_APP_JS, /function applyPricePresets\(\)/);
  assert.match(PUBLIC_APP_JS, /offerType\(\) === "rent" \? "data-price-rent" : "data-price-sale"/);
  assert.match(PUBLIC_APP_JS, /function syncBedrooms\(\)/);
  assert.match(PUBLIC_APP_JS, /bedrooms\.disabled = nonResidential/);
  assert.match(PUBLIC_APP_JS, /more\.addEventListener\("toggle"/);
  assert.match(PUBLIC_APP_JS, /function initSearchToolbar\(\)/);
  assert.match(PUBLIC_APP_JS, /form\.requestSubmit\(view && view\.value === "map" \? view : undefined\)/);
  assert.doesNotMatch(PUBLIC_APP_JS, /initHeroAdvancedSearch|data-hero-advanced/);
  assert.match(PUBLIC_APP_JS, /function fetchGeographyOptions\(\)/);
  assert.match(PUBLIC_APP_JS, /new AbortController\(\)/);
  assert.match(PUBLIC_APP_JS, /window\.setTimeout\(fetchGeographyOptions, 220\)/);
  assert.match(PUBLIC_APP_JS, /event\.key === "ArrowDown"/);
  assert.match(PUBLIC_APP_JS, /event\.key === "Enter" && activeIndex >= 0/);
  assert.match(PUBLIC_APP_JS, /geographyId\.value = ""/);
  assert.match(PUBLIC_APP_JS, /setFreeTextEnabled\(false\)/);
  assert.match(css, /\.hp-hero__slide\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.hp-hero \{[^}]*overflow-anchor: none;/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /object-position: var\(--hero-object-position, 50% 50%\)/);
  assert.match(css, /\.hp-hero__search \{ position: relative; z-index: 5; max-width: 920px; \}/);
  assert.match(css, /\.hp-search__intent \{[\s\S]*?border-radius: var\(--radius-full\);[\s\S]*?backdrop-filter: blur\(12px\);/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /\.hp-search__tab:has\(input:checked\) span \{ background: var\(--surface\); color: var\(--brand\);/);
  assert.match(css, /\.hp-search__card \{[\s\S]*?border-radius: var\(--radius-xl\);[\s\S]*?box-shadow: var\(--shadow-lg\);/);
  assert.match(css, /\.hp-search__bar \{[\s\S]*?grid-template-columns: minmax\(0, 1\.6fr\) minmax\(0, 1fr\) minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.hp-search__seg \{[\s\S]*?min-height: 52px;/);
  assert.match(css, /\.hp-search__seg \+ \.hp-search__seg::before \{[\s\S]*?inset-inline-start: 0;[\s\S]*?width: 1px;/);
  assert.match(css, /\.hp-search__label \{[\s\S]*?text-transform: uppercase;/);
  assert.match(css, /\.hp-search__go \{[\s\S]*?min-height: 52px;[\s\S]*?background: var\(--accent\);/);
  assert.match(css, /\.hp-hero__location-options \{[\s\S]*?inset-inline-start: 0;[\s\S]*?top: calc\(100% \+ 2px\);[\s\S]*?width: max\(100%, min\(520px, calc\(100vw - 64px\)\)\);[\s\S]*?max-height: min\(360px, 52svh\);/);
  assert.match(css, /\.hp-hero__location-option \{[\s\S]*?min-height: 52px;/);
  assert.match(css, /\.hp-search__more \{ border-top: 1px solid var\(--border\); \}/);
  assert.match(css, /\.hp-search__more-summary \{[\s\S]*?min-height: 40px;/);
  assert.match(css, /\.hp-search__more-grid \{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);/);
  assert.match(PUBLIC_APP_JS, /function emptyControls\(\)/);
  assert.match(PUBLIC_APP_JS, /window\.addEventListener\("pageshow"/);
  assert.match(css, /\.hp-search:has\(\[data-hero-family\] option\[value="plot"\]:checked\) \.hp-search__more-field--bedrooms/);
  assert.match(adapterCss, /main input:focus-visible:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\.mk-input__field\):not\(\.mk-searchbar__input\)/);
  assert.match(css, /@media \(max-width: 899px\) \{[\s\S]*?\.hp-search__bar \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto; \}[\s\S]*?\.hp-search__seg--location \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /@media \(max-width: 679px\) \{[\s\S]*?\.hp-search__intent \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); width: 100%; \}[\s\S]*?\.hp-search__go \{ grid-column: 1 \/ -1; width: 100%;/);
  assert.match(css, /@media \(max-width: 679px\) \{[\s\S]*?\.hp-hero \{ align-items: flex-start; \}[\s\S]*?\.hp-hero__in \{ padding-block: clamp\(6\.5rem, 20svh, 10rem\) var\(--space-8\); \}/);
  assert.match(css, /@media \(min-width: 680px\) \{[\s\S]*?\.hp-hero \{ align-items: flex-start; \}[\s\S]*?\.hp-hero__in \{ padding-block: clamp\(6rem, 8vw, 7rem\) var\(--space-8\); \}[\s\S]*?data-hero-mobile-only/);
  assert.doesNotMatch(css, /hp-hero__advanced|hp-hero__families|hp-hero__search-form/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
