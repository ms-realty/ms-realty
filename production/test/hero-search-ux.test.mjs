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

test("home hero has responsive local imagery and an accessible full filter contract", () => {
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

  assert.match(html, /id="home-hero-search-form" class="hp-hero__search-form mk-search__bar"[^>]*action="\/en\/search"[^>]*role="search"[^>]*data-hero-advanced-search="true"/);
  const form = html.slice(html.indexOf('id="home-hero-search-form"'), html.indexOf("</form>", html.indexOf('id="home-hero-search-form"')));
  assert.match(form, /data-geography-combobox="true"[^>]*data-geography-endpoint="\/api\/geography"[^>]*data-geography-locale="en"/);
  assert.match(form, /<label class="mk-sr-only" for="home-search-q">Location<\/label>/);
  assert.match(form, /id="home-search-q" name="location" type="search" class="mk-searchbar__input" autocomplete="off" placeholder="City, town, municipality or region" role="combobox"/);
  assert.match(form, /aria-autocomplete="list" aria-haspopup="listbox" aria-controls="home-search-location-options" aria-expanded="false"/);
  assert.match(form, /type="hidden" name="geography_id" value="" data-geography-id="true"/);
  assert.match(form, /id="home-search-location-options" class="hp-hero__location-options" role="listbox" aria-label="Location suggestions"[^>]*hidden/);
  assert.doesNotMatch(form, /\slist="home-search-location-options"/);
  assert.equal((form.match(/type="submit"/g) || []).length, 1);
  assert.match(form, /class="hp-hero__advanced-trigger"[^>]*data-hero-advanced-trigger="true"[^>]*aria-controls="home-advanced-search-en" aria-expanded="false"[^>]*aria-label="Filters" title="Filters"/);
  const filterTrigger = form.slice(form.indexOf('class="hp-hero__advanced-trigger"'), form.indexOf("</button>", form.indexOf('class="hp-hero__advanced-trigger"')));
  assert.match(filterTrigger, /<svg[^>]*>/);
  assert.match(filterTrigger, /<span class="mk-sr-only">Filters<\/span>/);
  assert.doesNotMatch(filterTrigger, /chevron-down/);
  assert.match(form, /class="hp-hero__families"[^>]*aria-label="Type"/);
  for (const family of ["apartment", "house", "plot", "agricultural_land", "commercial", "hotel"]) {
    assert.match(form, new RegExp(`name="property_family" value="${family}" form="home-hero-search-form"`));
  }
  assert.match(form, />Plot<\/span>/);
  assert.match(form, />Agricultural land<\/span>/);
  assert.doesNotMatch(form, />plot<\/span>/);
  assert.doesNotMatch(form, /name="property_type"/);
  for (const name of ["country_code", "region_id", "property_family", "offer_type", "price_min", "price_max", "bedrooms_min", "area_min", "area_max"]) {
    assert.match(form, new RegExp(`name="${name}"[^>]*form="home-hero-search-form"`));
  }
  assert.doesNotMatch(form, /name="q"/);
  assert.doesNotMatch(form, /name="municipality"/);
  assert.doesNotMatch(form, /name="district"/);
  assert.doesNotMatch(form, /name="sort"/);
  assert.doesNotMatch(form, /<details|<summary/);
  assert.match(html, /id="home-search-country" name="country_code" form="home-hero-search-form" data-geography-country="true"/);
  assert.match(html, /id="home-search-region" name="region_id" form="home-hero-search-form" data-geography-region="true"/);
  assert.match(html, /<option value="BG:district:BLG" data-country="BG">Blagoevgrad<\/option>/);
  assert.match(html, /<option value="GR:region:EL52" data-country="GR">Central Macedonia<\/option>/);
  assert.equal((form.match(/data-country="BG"/g) || []).length, 28);
  assert.equal((form.match(/data-country="GR"/g) || []).length, 13);

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

test("hero enhancement pauses for motion preference, hover, and focus while the inline filter panel remains usable", () => {
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
  assert.match(PUBLIC_APP_JS, /function initHeroAdvancedSearch\(\)/);
  assert.match(PUBLIC_APP_JS, /var form = document\.querySelector\("\[data-hero-advanced-search\]"\)/);
  assert.match(PUBLIC_APP_JS, /form\.querySelector\("\[data-hero-advanced-trigger\]"\)/);
  assert.match(PUBLIC_APP_JS, /trigger\.setAttribute\("aria-expanded", expanded \? "true" : "false"\)/);
  assert.match(PUBLIC_APP_JS, /panel\.hidden = !expanded/);
  assert.match(PUBLIC_APP_JS, /setExpanded\(false\);\s+trigger\.focus\(\)/);
  assert.match(PUBLIC_APP_JS, /function fetchGeographyOptions\(\)/);
  assert.match(PUBLIC_APP_JS, /new AbortController\(\)/);
  assert.match(PUBLIC_APP_JS, /url\.searchParams\.set\("ancestor_id", region\.value\)/);
  assert.match(PUBLIC_APP_JS, /window\.setTimeout\(fetchGeographyOptions, 220\)/);
  assert.match(PUBLIC_APP_JS, /event\.key === "ArrowDown"/);
  assert.match(PUBLIC_APP_JS, /event\.key === "Enter" && activeIndex >= 0/);
  assert.match(PUBLIC_APP_JS, /geographyId\.value = ""/);
  assert.match(PUBLIC_APP_JS, /setFreeTextEnabled\(false\)/);
  assert.match(css, /\.hp-hero__slide\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.hp-hero \{[^}]*overflow-anchor: none;/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /object-position: var\(--hero-object-position, 50% 50%\)/);
  assert.match(css, /@media \(max-width: 679px\)/);
  assert.match(css, /@media \(min-width: 680px\) \{[\s\S]*?\.hp-hero \{ align-items: flex-start; \}[\s\S]*?\.hp-hero__in \{ padding-block: clamp\(6rem, 8vw, 7rem\) var\(--space-8\); \}[\s\S]*?data-hero-mobile-only/);
  assert.match(css, /\.hp-hero__search-form \{[\s\S]*?--hero-search-action-width: 126px;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 52px var\(--hero-search-action-width\);[\s\S]*?grid-template-rows: 52px auto auto;[\s\S]*?min-height: 64px;[\s\S]*?overflow: visible;/);
  assert.match(css, /\.hp-hero__search \.mk-search__seg \{[\s\S]*?align-items: center;[\s\S]*?min-height: 52px;/);
  assert.match(css, /\.hp-hero__location-options \{[\s\S]*?inset-inline: 6px;[\s\S]*?top: 64px;[\s\S]*?max-height: min\(360px, 52svh\);/);
  assert.match(css, /\.hp-hero__location-option \{[\s\S]*?min-height: 52px;/);
  assert.match(css, /\.hp-hero__advanced-trigger \{[\s\S]*?grid-column: 2;[\s\S]*?width: 52px;[\s\S]*?min-height: 52px;/);
  assert.match(css, /\.hp-hero__families \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?grid-row: 2;/);
  assert.match(css, /\.hp-hero__search-form:has\(\.mk-search__field input:focus-visible\) \{[\s\S]*?box-shadow:/);
  assert.match(css, /\.hp-hero__search \.mk-search__field input::-webkit-search-cancel-button/);
  assert.match(adapterCss, /main input:focus-visible:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\.mk-input__field\):not\(\.mk-searchbar__input\)/);
  assert.match(css, /\.hp-hero__advanced-panel \{[\s\S]*?grid-column: 1 \/ 4;[\s\S]*?grid-row: 3;[\s\S]*?position: static;[\s\S]*?border-top:/);
  assert.match(css, /\.hp-hero__advanced-panel\[hidden\] \{ display: none; \}/);
  assert.doesNotMatch(css.match(/\.hp-hero__advanced-panel \{[^}]*\}/)?.[0] || "", /position:\s*absolute/);
  assert.match(css, /\.hp-hero__advanced-grid \{[\s\S]*?grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.hp-hero__advanced-field--country,[\s\S]*?\.hp-hero__advanced-field--region \{ grid-column: span 3; \}/);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.hp-hero__advanced-grid \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@media \(max-width: 679px\) \{[\s\S]*?\.hp-hero \{ align-items: flex-start; \}[\s\S]*?\.hp-hero__in \{ padding-block: clamp\(7rem, 22svh, 11\.375rem\) var\(--space-8\); \}[\s\S]*?\.hp-hero__search-form \{ --hero-search-action-width: 52px; \}[\s\S]*?\.hp-hero__search \.mk-search__go span \{ display: none; \}[\s\S]*?\.hp-hero__advanced-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
