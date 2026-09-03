# Legacy RU content triage — makler-realty.ru (+ .com FAQ)

Scope: every `page` and `post` URL of `makler-realty.ru` in `metadata_inventory` (78 rows) plus
the Russian FAQ hub on `makler-realty.com` (1 row) = **79 URLs**. Every row was classified after
reading the actual `post_content` recovered from the WordPress dumps
(`maklerre_newru.sql` / `maklerre_newc.sql`), not from the title.

Companion file: `legacy-ru-content-triage.csv`.

## Two corrections to the brief, before anything else

1. **The FAQ cluster is not 17 `.com` URLs.** `url_inventory` / `metadata_inventory` contain
   17 URLs under `/вопрос-ответ-недвижимость-болгария/`, but **16 of them live on
   `makler-realty.ru`** and only the hub itself is on `makler-realty.com`. The `.com` hub is the
   one that carries the full 2 568-word text; the 16 `.ru` children are each a single answer cut
   out of it, and the `.ru` hub is a bare table of contents.
2. **"All 300+ words, posts average ~1700" is a crawler artefact.** The `word_count` column counts
   rendered nav, sidebar and footer (~350 words of chrome on every page). Real body text: **32 of
   the 79 URLs have under 150 words** of their own and **13 have zero**; the 1 747-word post
   average is 1 410 words of real text, and **591** once the 30 878-word Vanga page is excluded.
   Word budgets in
   this report are given both ways (`crawl` = inventory `word_count`, `body` = recovered
   `post_content` after stripping HTML/shortcodes and taking the `[:ru]` qTranslate block).

## 1. Summary

### By recommendation

| recommendation | URLs | crawl words | body words |
|---|---:|---:|---:|
| `migrate_guide` | 10 | 15 714 | 12 418 |
| `merge_into_existing_guide` | 33 | 23 554 | 12 041 |
| `410` | 36 | 51 404 | 36 703 |
| **total** | **79** | **90 672** | **61 162** |

36 703 of the 410'd body words are a single page: the pirated Vanga book (row 007, 30 878 words).
Excluding it, the discarded pile is only 5 825 words of real text.

### By topic

| topic | URLs | crawl words | body words |
|---|---:|---:|---:|
| `sandanski_pirin` | 27 | 58 368 | 49 330 |
| `listing_like` | 16 | 8 603 | 543 |
| `buying_process` | 10 | 5 988 | 2 481 |
| `promo_thin` | 9 | 5 046 | 1 879 |
| `other_region` | 6 | 4 210 | 2 196 |
| `legal_tax` | 5 | 2 479 | 720 |
| `faq` | 3 | 3 846 | 2 929 |
| `residence_visa` | 3 | 2 132 | 1 084 |
| `black_sea` | 0 | 0 | 0 |

`black_sea` is empty on purpose: **no `.ru` page is primarily about a Black Sea resort.** The
Black Sea shows up as cross-sell (footer link blocks, `meta description` keyword stuffing) on
otherwise on-topic or already-dropped pages — see §4.

`other_region` = country-wide or non-Pirin material (Macedonia visa news, Bansko transfer,
national holidays, general Bulgaria geography). `promo_thin` = agency self-promotion or
navigational stubs with no subject of their own.

### By topic × recommendation

| topic | migrate | merge | 410 |
|---|---:|---:|---:|
| `sandanski_pirin` | 6 | 14 | 7 |
| `buying_process` | 3 | 7 | 0 |
| `faq` | 1 | 2 | 0 |
| `legal_tax` | 0 | 5 | 0 |
| `residence_visa` | 0 | 3 | 0 |
| `listing_like` | 0 | 1 | 15 |
| `promo_thin` | 0 | 1 | 8 |
| `other_region` | 0 | 0 | 6 |

### Redirect targets

10 new guides absorb 40 legacy URLs; 3 more redirect to pages that already exist. Merge destinations:

| target | incoming 301s | exists today? |
|---|---:|---|
| `/ru/guides/faq-nedvizhimost-bolgariya` | 18 (1 migrate + 17 merge) | new — created by row `makler-realty.com/вопрос-ответ-недвижимость-болгария/` |
| `/ru/locations/sandanski` | 4 | **yes** (live) |
| `/ru/guides/sandanski-klimat-i-lechenie` | 4 (1 + 3) | new — created by `/sandanski-сандански/` |
| `/ru/guides/dostoprimechatelnosti-sandanski-melnik` | 3 (1 + 2) | new — created by `/достопримечателности/` |
| `/ru/guides/bolgariya-glazami-pereselentsev` | 3 (1 + 2) | new — created by `/болгария-глазами-переселенцев/` |
| `/ru/guides/kak-dobratsya-do-sandanski` | 3 (1 + 2) | new — created by `/как-доехать-из-софии-до-сандански/` |
| `/ru/guides/doroga-sofiya-sandanski` | 2 (1 + 1) | new — created by `/сандански/` |
| `/ru/guides/poryadok-oformleniya-sdelki` | 1 | new |
| `/ru/guides/obshchaya-ploshchad-kvartiry` | 1 | new |
| `/ru/guides/chernye-rieltory-sandanski` | 1 | new |
| `/ru/guides/zlatolist-prepodobnaya-stoyna` | 1 | new |
| `/ru/contact` | 1 | **yes** (live) |
| `/ru/sell` | 1 | **yes** (live) |

**Sequencing rule.** `/ru/guides/*` does not exist yet — the new site currently ships
`/bg/guides/{proverka-na-imot-sandanski, petrich-obstinski-kontekst, hotovo-obstinski-kontekst}`
and `/en/guides/{buying-process, foreign-buyers}` only. Where `suggested_new_path` is a new guide,
the 301 must not go live until that guide is published; until then the URL keeps returning 410.
Rows whose target is created by a different row in the same CSV say so in `red_flags`
("цель создаётся из &lt;URL&gt;").

Two `merge_into_existing_guide` rows point at non-guides (`/ru/contact`, `/ru/sell`). They are
plain 1:1 redirects to the existing equivalent page, flagged as such in the CSV.

### Out of scope, deliberately

`https://makler-realty.ru`, `https://makler-realty.ru/`, `/главная/` and `/search/` are marked
`410` **only in the sense that they are not guides**. AGENTS.md forbids inventing homepage and
search-page redirect assumptions, and the brief states the new search page is `noindex` and can
never be a redirect target. The homepage/search redirect decision belongs to the crawl-parity
work, not to this triage; the `red_flags` column repeats that on each of the four rows.

## 2. Top 15 to migrate first

Ordered by publish-now value. Body-word counts are real text, not crawl counts.

| # | legacy URL | body | target | why first |
|---|---|---:|---|---|
| 1 | `.com/вопрос-ответ-недвижимость-болгария/` | 2 568 | `/ru/guides/faq-nedvizhimost-bolgariya` | One page recovers 18 URLs (16 `.ru` FAQ children plus `/ввоз-валюты-в-болгарию/`). It is the only complete Russian FAQ the agency ever wrote — 15 answers covering procedure, BULSTAT, taxes, residence, agency checks. Needs the heaviest legal refresh (§4) but the highest structural payoff. |
| 2 | `/оформление-сделки-недвижимость-болг/` | 525 | `/ru/guides/poryadok-oformleniya-sdelki` | The step-by-step deal procedure — deposit, preliminary contract, notary act, BULSTAT, municipal declaration. This is the Russian counterpart of the existing `/en/guides/buying-process` and the anchor the FAQ already links to ("раздел Порядок оформления"). |
| 3 | `/общая-площадь-квартиры-что-это/` | 244 | `/ru/guides/obshchaya-ploshchad-kvartiry` | Evergreen and genuinely unique: explains застроена площ vs обща площ and идеални части, the single most common misunderstanding for Russian buyers. Nothing else on either domain covers it. |
| 4 | `/сандански/` | 1 459 | `/ru/guides/doroga-sofiya-sandanski` | Best-written regional narrative on the site (Struma valley, Rila, Pirin, Blagoevgrad, arrival in Sandanski). Last edited 2025, so the agency already treats it as current. Absorbs its own 97 %-identical twin. |
| 5 | `/sandanski-сандански/` | 698 | `/ru/guides/sandanski-klimat-i-lechenie` | The cleanest description of Sandanski's geography, transitional Mediterranean climate and balneology. Becomes the anchor that swallows three thinner spa/health pages (`/русские-в-сандански/`, `/сандански-лечение/`, `/сандански-лечение-астмы/`). |
| 6 | `/достопримечателности/` | 1 206 | `/ru/guides/dostoprimechatelnosti-sandanski-melnik` | Melnik (UNESCO, Kordopulova kashta), Rozhen monastery, Rila monastery — exactly the Sandanski–Melnik radius the new site sells, and the natural home for the two excursion pages. |
| 7 | `/чудодейственные-места-в-болгарии-зла/` | 1 411 | `/ru/guides/zlatolist-prepodobnaya-stoyna` | Unique local-history piece on Zlatolist and Prepodobna Stoyna, a village between Sandanski and Melnik. No competitor content exists in Russian; strong long-tail. |
| 8 | `/внимание-черные-риэлторы-в-сандански/` | 631 | `/ru/guides/chernye-rieltory-sandanski` | Buyer-protection content aimed precisely at the Russian expat resale scam in Sandanski. Pairs with the existing `/bg/guides/proverka-na-imot-sandanski`. Needs a legal read for tone. |
| 9 | `/болгария-глазами-переселенцев/` | 3 474 | `/ru/guides/bolgariya-glazami-pereselentsev` | The longest legitimate text on the site — a settler's account of life in Pirin Macedonia. Merges parts 2 and 3 into one authoritative long-read instead of three thin ones. Confirm authorship/rights first. |
| 10 | `/как-доехать-из-софии-до-сандански/` | 202 | `/ru/guides/kak-dobratsya-do-sandanski` | Thin alone, but consolidating the two transfer pages into it produces a ~520-word practical arrival guide. High commercial intent, cheap to refresh. |
| 11 | `/вопрос-ответ.../kak-poluchit-grazhdanstvo-bolgarii/` | 645 | merge → FAQ guide | The largest single FAQ answer. Decide early whether it is refreshed or deleted: the described route no longer matches Bulgarian law (§4). |
| 12 | `/русские-в-сандански/` | 612 | merge → `sandanski-klimat-i-lechenie` | The most factual balneology text (water chemistry, 42–81 °C springs, +14.7 °C annual mean, Thracian/Roman history). Best raw material for the climate guide's body. |
| 13 | `/купить-дом-в-сандански/` | 304 | merge → `/ru/locations/sandanski` | Price-band framing for houses (cheap / mid / 100 k €) is a good structure for the live location page — the numbers must be replaced with current ones. |
| 14 | `/купить-квартиру-в-сандански/` | 431 | merge → `/ru/locations/sandanski` | Same for apartments, plus the €/m² segmentation. Strip the "120 km from the Mediterranean" framing (§4). |
| 15 | `/вопрос-ответ.../kak-polichit-vnzh-v-bolgarii/` | 281 | merge → FAQ guide | Residence permit grounds — the highest-traffic legal question for this audience. Must be re-sourced from the current ЗЧРБ before it goes anywhere. |

## 3. Duplicates and near-duplicates

Measured on lowercase word sets of the recovered body text (Jaccard and containment).

### Exact / near-exact

| pair | Jaccard | containment | verdict |
|---|---:|---:|---|
| `/сандански-болгария/` ↔ `/сандански/` | **0.97** | 1.00 | Same article, two URLs. The 2016 version (`/сандански/`, 1 459 words, edited 2025) is canonical; the 2013 version (1 421 words) 301s into it. |
| `.com/вопрос-ответ-недвижимость-болгария/` ↔ each of the 16 `.ru` FAQ URLs | 0.05–0.33 | **0.96–1.00** | Every `.ru` FAQ child is a verbatim cut-out of the `.com` hub. Containment ≈ 1.0 for all 15 answer pages and 0.98 for the `.ru` hub TOC. Classic page/post cannibalisation — 17 URLs, one document. |
| `/ввоз-валюты-в-болгарию/` (post) ↔ `.com` FAQ hub (page) | 0.05 | **1.00** | The 81-word post is FAQ question 15 verbatim. **This is the one exact post↔page duplicate across the two content types.** |

### Boilerplate near-duplicates (same template, swapped city and price)

| pair | Jaccard | containment |
|---|---:|---:|
| `/такси-из-софии-в-сандански/` ↔ `/трансфер-салоники-сандански/` | 0.65 | 0.80 |
| `/такси-из-софии-в-сандански/` ↔ `/трансфер-софия-банско/` | 0.54 | 0.76 |
| `/трансфер-салоники-сандански/` ↔ `/трансфер-софия-банско/` | 0.36 | 0.59 |

Three transfer pages built from one paragraph. Two merge into the arrival guide; the Bansko one is
dropped (off-region, and it carries the Black Sea transfer link block).

### Overlapping FAQ answers (same legal claim restated)

`kak-kupit-i-zaregistrirovat-avto-v-bolgarii` ↔ `neobhodimie-dokumenti…` (cont. 0.77),
`neobhodimie-dokumenti…` ↔ `pochemu-nuzhna-firma…` (cont. 0.83),
`kak-kupit-i-zaregistrirovat-avto…` ↔ `pochemu-nuzhna-firma…` (cont. 0.61). All three restate the
same "foreigners cannot own land, register a company" claim. In the consolidated guide this must
become **one** correctly-stated section, not three.

### Thematic (not textual) duplication

Six pages describe the Sandanski spa/climate proposition with different words each time —
`/русские-в-сандански/`, `/сандански-лечение/`, `/сандански-лечение-астмы/`,
`/продажа-квартир-сандански/`, `/сандански-лучший-спа-курорт-2009-года/`, `/sandanski-сандански/`.
Pairwise Jaccard stays under 0.20, so no automatic dedupe catches them, but publishing them
separately would produce six competing pages on one query. One anchor guide plus merges.

## 4. Outdated facts that must be refreshed before publishing

### Legal — blocking

- **"Иностранное физическое лицо не может быть собственником земли"** — stated on the `.com` FAQ
  hub, `/…/pochemu-nuzhna-firma-dlq-pokupki-doma-v-bolgarii/`,
  `/…/neobhodimie-dokumenti-dlq-pokupki-kvartiri-v-bolgarii/`,
  `/…/kak-kupit-i-zaregistrirovat-avto-v-bolgarii/` and `/оформление-сделки-недвижимость-болг/`.
  This has not been true for EU/EEA citizens since 2012 (regulated land since 2014); the
  restriction survives only for third-country nationals. Five pages repeat it. **Do not republish
  as written.**
- **Citizenship** (`/…/kak-poluchit-grazhdanstvo-bolgarii/`, 645 words, written 2016): the
  investor route was abolished in 2022 and the described stages and 8–10-month timeline no longer
  hold. Either fully rewritten from the current Закон за българското гражданство, or cut.
- **ВНЖ / ПМЖ** (`/…/kak-polichit-vnzh-v-bolgarii/`, `/…/kak-poluchit-pmzh-v-bolgarii/`):
  grounds are transcribed from a ~2016 reading of ЗЧРБ. Re-source before publication.
- **Car registration** (`/…/kak-kupit-i-zaregistrirovat-avto-v-bolgarii/`): claims a Russian
  citizen must own a Bulgarian company to register a car. Needs legal verification.
- **`/купить-дом-в-сандански/`**: claims an old house can be demolished and rebuilt to the same
  footprint "без разрешительных" — a planning-law claim that must be checked or deleted.
- **Copyright, not a fact refresh:** `/ванга-тайна-дара-болгарской-ясновиде/` reproduces
  **Надежда Димова, "Ванга. Тайна дара болгарской Кассандры" in full** (30 878 words, annotation
  and introduction included). It must stay 410 and must not be reused anywhere.
  `/македония-пустит-по-паспорту/` and the settler series also look like third-party text
  republished without attribution.

### Currency and prices — everything in the CSV `red_flags`

Bulgaria's euro changeover makes every lev price on the old site wrong, and every euro price is
2011–2016 vintage:

| page | stale figures |
|---|---|
| `/купить-квартиру-в-сандански/` | 380–500 €/m² (2012) |
| `/купить-дом-в-сандански/` | 30 000 / 40 000 / 100 000 € bands (2013) |
| `/наши-лучшие-предложения-квартир-в-сан/` | 26 000–71 000 € per named flat (2012) |
| `/недвижимость-в-сандански-двушки/` | 33 000–50 000 € per named flat (2013) |
| `/оформление-сделки-недвижимость-болг/` | notary fee 3.5–5 %, 100 € / 500 € / 50 € service prices |
| `/услуги-недвижимость-болгария/` | full price list, 100–500 €, 3 % commission |
| `/…/kakie-v-bolgarii-kommunalnie-platezhi/` | maintenance fee 5–10 €/m²/year |
| `/экскурсии-в-сандански/` | 10 / 100 / 150 BGN |
| `/такси-в-сандански/` | 0.80–0.87 лв./km |
| `/уборка-квартир-сандански/` | 1–7 лв./m² |
| `/такси-из-софии-в-сандански/`, `/трансфер-салоники-сандански/`, `/трансфер-софия-банско/` | 95 € / 120 € / 100 € / 140 € |
| `/как-доехать-из-софии-до-сандански/` | 70–130 € taxi, Sofia bus numbers 284/305/306/213/313, "последний автобус в 18:00" |
| `/недвижимость-в-болгарии/` | petrol ~0.9 €, cigarettes ~2.6 €, "лев жёстко привязан к евро" |
| `.com` FAQ hub, `/ввоз-валюты-в-болгарию/` | 10 000 € cash declaration threshold — verify post-changeover |

### Dated events and stale framing

- `/македония-облегчает-правила-въезда/` and `/македония-пустит-по-паспорту/` — 2011 visa news,
  dead. `/сандански-лучший-спа-курорт-2009-года/` — a 2009 award announced in 2010.
  `/новый-фильм-о-ванге/` — 2012 filming news, and it prints a **defunct office address**
  (ул. Первого мая 32) that contradicts the contact page (ул. Хан Аспарух 14).
- `/sandanski-сандански/` says Bulgaria's **Schengen accession "ожидается"** — Bulgaria has been a
  full member since 2025. Must be corrected in the very guide it becomes.
- `/чудодейственные-места-в-болгарии-зла/` routes readers along E-79 "совсем скоро будущая
  автострада" — the Struma motorway situation has changed.
- Directory pages carry unverified 2011–2014 contacts: `/аптеки-в-г-сандански/` (20+ pharmacies),
  `/нотариусы-в-городе-сандански/` (5 notaries with registration numbers),
  `/курьерские-фирмы-в-городе-сандански/`, `/такси-в-сандански/`,
  `/кинезитерапия-мануальная-терапия/`. All 410'd. If the agency wants a Sandanski services
  directory later, only the notary list is worth rebuilding, and only from the Нотариална камара
  register.

### Black Sea and sea-framing violations

No page is *about* the Black Sea, but these carry sea marketing that must not survive:

- **`meta description` cross-sell** on `/главная/` + the two root URLs (Солнечный берег, Поморие,
  "морские курорты"), `/контакти/` (Солнечный берег, Святой Влас, Поморие, Созополь),
  `/o-компании/` (Несебр, Созополь, Солнечный берег). All four are 410 / redirect-to-contact, so
  nothing carries over — but do not copy these descriptions into the new pages.
- **Footer link blocks:** `/недвижимость-в-болгарии/` ends with "Быстрые ссылки … морские
  курорты: Солнечный берег / Святой Влас / Созополь"; `/трансфер-софия-банско/` links
  "Трансфер Бургас — Солнечный берег" and "— Святой Влас". Both 410.
- **Sandanski framed as a sea destination** — the AGENTS.md rule — in three pages that are
  otherwise being kept: `/купить-квартиру-в-сандански/` ("в 120 км от Средиземного моря"),
  `/сандански-лечение-астмы/` ("Средиземное море всего в 100 км", plus a run-through of Варна,
  Бургас, Поморие, Солнечный Берег, Несебр), and `/сандански/` + `/сандански-болгария/` whose
  opening paragraph sets off "в сторону моря, только не Чёрного, а Белого". These sentences must
  be rewritten during migration, not carried across.

## 5. Counts

- **total: 79**
- **migrate: 10**
- **merge: 33**
- **410: 36**

Confidence: 56 high, 23 medium, 0 low.
