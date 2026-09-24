# Legacy extraction

The frozen legacy facts the new system imports once, extracted on 2026-09-23 from the
old application before it was deleted. Every source path below is given as it exists at
git tag `legacy-app-final`; each JSON file repeats its sources with their `sha256`, so a
value can always be traced back to the artefact it came from.

Rules that apply to every file here:

- **Nothing is inferred.** A value the legacy system never held is `null` and carries an
  explicit `recorded` / `state` flag or a note saying so. No default, no guess, no fill-in.
- **Recorded status is not permission.** Publication, approval and indexability appear as
  facts about what the legacy system recorded. Importing them grants nothing; the new
  system re-derives every authority from its own human approvals.
- **Extraction is not a decision.** Area values, taxonomy mappings and place identities
  that were proposals in the legacy system stay proposals here.

Verify the set with:

```sh
node data/legacy/verify.mjs
```

## Data-protection rules

- The only phone number permitted anywhere in this directory is the public brand line
  `+359879696870`.
- The only email address permitted anywhere in this directory is the business address
  `ms.realty.bg@gmail.com`. No other address, business or personal, may be added.
- No customer, partner or staff personal data is carried forward. `verify.mjs` enforces
  all three rules across every file here and over `public/brand/*.svg`.

`production/data/legacy-archive.json` (108 captured legacy pages) and
`production/data/broker-contacts.jsonl` hold partner and staff names, phone numbers and
email addresses. Neither is extracted, in whole or in part. See `content.json.exclusions`.

## `listings.json` — 8.5 MiB, 165 listings

Sources at `legacy-app-final`:

| Path | Role |
| --- | --- |
| `production/data/cms-seed.json` | listing records, properties, translations, media |
| `production/data/launch-freeze.json` | lifecycle at freeze, terminal URL decisions |
| `production/data/deployable-redirects.json` | the 165 listing 301 targets |
| `production/data/legacy-area-map.json` | area extraction proposals with provenance |
| `production/data/legacy-area-overrides.json` | human decisions on those proposals |
| `production/data/legacy-lot-id-map.json` | legacy lot id and WordPress post id resolution |
| `production/data/listing-publication-approval.json` | owner approval `MSR-LISTING-PUBLICATION-1` |
| `production/data/migration-records.json` | crawl record per legacy URL |
| `production/data/location-reviews.json` | reviewed place identity per listing location |

Counts: 165 listings — 139 sale / 26 rent; 30 active and 135 archived at the freeze
(`pass` 30, `review` 75, `hold` 52, `source_unavailable` 8); source locale `bg` 113,
`ru` 52; 134 with a price amount and 31 `price_on_request`; 82 with a recorded bedroom
count; 203 legacy URL entries over 165 distinct URLs; 6 224 media entries (3 333 photo,
3 floorplan, 2 888 site chrome) referencing 1 712 R2 objects; 1 155 translation records,
990 of them outside the source locale.

Caveats and gaps:

- **No listing record carries an area.** Every value under `areas.extraction` is a
  proposal (37 `ready`, 128 `review`; 152 have a proposed value) or a human decision on
  one (111 `assign`, 17 `skip`). None was ever written back to a listing, and
  `areas.recorded_on_listing` is empty for all 165. Bases are the legacy field meanings:
  `living`, `built`, `usable`, `gross_floor`, `land`.
- **31 listings are `price_on_request`**, not 28. The 28 in the rebuild brief predates the
  full-catalogue publication approval; `production/data/cms-seed.json` records 31 listings
  with no `price_eur`, and that is the number carried here.
- **Rent listings record no rent period.** `price.period` is `null` with
  `period_recorded: false` on all 26.
- **No total room count, no coordinates, no amenity list.** `rooms.count` is `null` on all
  165; `features.amenity_list` is explicitly absent. `features.known` holds only the typed
  property fields that had a value.
- **38 listings are archived duplicates** merged into a `.com` listing. They keep their
  own `.ru` URL, whose 301 resolves to the archived duplicate rather than to the surviving
  listing, and they are still keyed by their crawl placeholder id (`MS-CRAWL-nnnn`) because
  the lot number they carry belongs to the listing they were merged into. Lot number alone
  is therefore not a unique legacy key.
- **52 listings have a Russian source description**, not a Bulgarian one. BG is the new
  source locale, so those need human authoring.
- **All 990 non-source-locale translations are unapproved and non-indexable**
  (`translation_state: human_edited`, `human_approved: false`, `public_indexable: false`).
  Nothing here may be published or indexed without a new human approval.
- `publication_approval` records that `MSR-LISTING-PUBLICATION-1` covered source-locale
  public listing copy for all 165. It covers no translation, no indexability, no fact
  verification and no media review.

## `url-decisions.json` — 704 KiB, 457 decisions

Sources at `legacy-app-final`: `production/data/launch-freeze.json` (the decisions),
`production/data/deployable-redirects.json` (the 165 listing 301s and their reviewer),
`production/data/migration-records.json` (crawl record per URL).

Counts, verified against the freeze: **179 × 301, 268 × 410, 10 × 200**. By domain:
`makler-realty.com` 278, `makler-realty.ru` 179. By type: listing 165, taxonomy 146,
page 104, post 42. Of the 179 301s, 165 are listing redirects (52 of them from
`makler-realty.ru`) and 14 are home-alias, contact, seller-intake and search redirects.

Caveats and gaps:

- **No legacy URL carries a query string.** The domain plus the exact path is the whole
  key; `source_query` is `null` on all 457.
- **`makler-realty.ru` registration has expired.** 179 of these decisions and 52 of the
  listing 301s cannot be served until the owner renews the domain.
- `production/data/redirect-approval-workbook.csv` is the review *input* workbook, not a
  decision artefact. It is deliberately not a source here.
- Both encoded and decoded paths are kept (`source_path_encoded`, `source_path`): the
  legacy URLs are percent-encoded Cyrillic, and the encoded form is what a request carries.

## `media-manifest.json` — 958 KiB, 1 725 objects

Sources at `legacy-app-final`: `migration/artifacts/20260704-211155/media-inventory.csv`
(the canonical crawl inventory, 11 859 rows, captured 2026-07-04), `production/data/cms-seed.json`
(which listing references which object), `production/data/launch-readiness.json`
(the R2 coverage evidence).

The R2 key shape is `<legacy host>/wp-content/uploads/<original WordPress upload path>` in
bucket `ms-realty-media`. 1 725 objects: 1 246 on `makler-realty.com`, 479 on
`makler-realty.ru`; 1 712 are referenced by a listing and 13 only by non-listing pages.
1 714 are `image/jpeg`, 11 `image/png`.

Caveats and gaps:

- **No per-object size or hash exists.** The coverage evidence records only a bucket-wide
  listed size (473 110 547 bytes). `bytes` and `sha256` are `null` on every object.
- **Content types are inferred from the file extension**, exactly as the legacy edge Worker
  did when serving. Nothing ever recorded the stored `Content-Type`; this is flagged per
  object as `content_type_source: "inferred_from_file_extension"`.
- **Sized WordPress derivatives are not in R2.** The legacy CMS seed referenced 1 586
  additional sized keys as display fallbacks; none exists as an object, so only the
  full-size object can be imported.
- **Site chrome was never mirrored.** The theme logo and the plugin language flags appear
  on every legacy page but sit outside `/wp-content/uploads/`. They are listed under
  `unmirrored_references` (15 entries), not as importable objects.
- The R2 listing held two objects outside the expected set (`wv.png` on each host). They
  are recorded in `r2_evidence.unexpected_keys` and excluded from the manifest.
- `production/data/r2-media-coverage-report.json` is gitignored by design, so the evidence
  embedded in `r2_evidence` (release `40695ab0`, generated 2026-08-27) is the record.

## `geography.json` — 99 KiB, 31 places

Sources at `legacy-app-final`: `production/data/location-reviews.json` (reviewed place
identity, reviewed 2026-07-29), `production/data/geography-registry.json` and
`production/data/geography-catalog.json` (the official register and its authorities),
`geography/official-settlement-coordinate-sources.json` (the coordinate decision),
`production/data/cms-seed.json` (the location strings the listings carried).

31 places — 24 Bulgarian, 7 Greek; 29 at settlement level and 2 at municipality level.
All 31 resolve to a register entry, and all 165 listings resolve to one of them.

Caveats and gaps:

- **No settlement coordinates exist.** No checked official source supplies a point per
  EKATTE settlement, so map, radius and viewport search cannot be built on legacy data.
  The decision and the prohibited inferences are carried in `coordinates`.
- **Neighborhood is not a register level.** Exactly one place carries a raw locality label
  (Дербере, in Sandanski municipality), and it is not a register entry. Two places resolve
  only to a municipality, so a place key and a settlement are not the same thing.
- **Aliases are only what the legacy data spelled**, plus the official native name and the
  official transliteration from the register. No transliteration was generated here.
- **Sandanski is inland** — Struma valley, below Pirin. It must never be presented as a
  sea, beach or coastal destination. Sveti Vlas (Burgas district) is the one coastal place
  in this set, with a single listing.
- **The full register is not copied.** The BG + GR register is 26 775 areas and 9.4 MB, it
  is reference data rather than a legacy fact, and it is reproducible from the NSI, ELSTAT
  and Eurostat sources recorded in `official_registers`. It stays at
  `production/data/geography-registry.json` under tag `legacy-app-final`.

## `content.json` — 21 KiB

Sources at `legacy-app-final`: `production/data/approved-area-guides.json`,
`production/data/approved-cms-content.json`, `production/data/approved-team-profiles.json`,
`production/data/approved-financing-partners.json`, `production/data/approved-purchase-fees.json`,
`production/data/draft-guide-translations.json`, `production/data/app-route-manifest.json`,
`production/data/migration-records.json`.

Only content a named human approved: **2** area guides (Hotovo and Petrich, Bulgarian
only) and **6** buyer guide documents (3 English, 3 Bulgarian). **0** team profiles,
**0** financing partners, **0** purchase fee lines and **0** service-page content records
were ever approved.

Caveats and gaps:

- The cost estimator and the financing step have nothing to publish: no fee line and no
  lender relationship was ever approved.
- 15 finished guide translations exist for `de`, `nl`, `ru`, `el` and `he` that no human
  translator approved. They are excluded, not extracted.
- The legacy app rendered its contact, seller-intake, location and search surfaces from
  code, so no service-page copy exists as an approved record.
- **The legacy coverage claim is unconfirmed.** The legacy homepage advertised Sandanski
  together with Black Sea coast settlements as separate coverage areas. The claim is
  recorded verbatim under `legacy_coverage_claim` with `status: "unconfirmed"`; the owner
  must confirm the actual coverage before anything like it is published again, and
  Sandanski is never part of a sea or coast claim.
- `brand_contact` holds the public brand line and the business email only, with the
  provenance of each.

## `verify.mjs` — the check

Dependency-free Node. It asserts the counts above, the referential integrity between the
files (every listing media reference resolves in the manifest; every listing legacy URL
has a matching decision with the same status; every listing location resolves in
`geography.json`; every cross-file listing reference exists), and the data-protection
rules in this README. 38 checks; all pass.

## `public/brand/` — brand assets

| File | Source at `legacy-app-final` | Note |
| --- | --- | --- |
| `logo-ms-realty.png` | `makler-realty-design-system/project/assets/logo-ms-realty.png` | 172 × 88 PNG, RGBA. Byte-identical to the 22 hashed copies the legacy app served from `public/vendor/ms-realty-logo-*.png`. |
| `logo-ms-realty-reversed.png` | `makler-realty-design-system/project/assets/logo-ms-realty-reversed.png` | 172 × 88 PNG, RGBA, for dark surfaces. Byte-identical to the 22 `public/vendor/ms-realty-logo-reversed-*.png` copies. |
| `favicon.svg` | `production/lib/favicon.mjs#FAVICON_SVG` | The legacy favicon was generated in code, never stored as a file; it is materialised here unchanged. |

Caveats:

- The legacy WordPress site's own theme logo (`wp-content/themes/Avenue/images/logo.png`)
  was never mirrored into R2, so its bytes are not available. The assets above are the
  brand marks the legacy application itself served.
- The self-hosted web fonts under `public/vendor/` are third-party font binaries, not
  brand assets, and are not copied. They are re-provisioned from their own sources.
- `public/vendor/` held 44 hashed logo copies for exactly 2 distinct images — an artefact
  of the design-system bundle hashing. Only the two originals are kept.
