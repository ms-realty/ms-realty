# Legacy lot-id identity decisions

Forensic reconciliation of `production/data/legacy-lot-id-map.json` against the
SuperHosting mysqldumps. Read-only investigation; nothing under
`/Users/ivan/Code/MS-Realty` was modified.

| Input | Value |
| --- | --- |
| New catalog | `production/data/cms-seed.json` (`cms-seed-20260730`, 165 listing records) |
| Recovered map | `production/data/legacy-lot-id-map.json` (160 resolved, 5 unresolved, 3 fuzzy, 2 reused lots) |
| Bulgarian dump | `scratchpad/wpdb/cpmove-maklerre/mysql/maklerre_newc.sql`, dump completed 2026-08-28 23:06:17 |
| Russian dump | `scratchpad/wpdb/cpmove-maklerre/mysql/maklerre_newru.sql`, dump completed 2026-08-28 23:06:19 |
| Baseline crawl | `migration/artifacts/20260704-211155` (457 URLs, 165 of type `listing`) |
| Delta crawl | `migration/artifacts/20260710-211919` (456 URLs, 164 of type `listing`) |
| Parser | `migration/extract_legacy_lot_ids.py` (`table_rows`, `slug_key`), imported, not rewritten |

---

## 0. What the dumps actually contain, and why 5 records could not match

### 0.1 Population arithmetic

| Set | Count |
| --- | --- |
| Listing posts in `maklerre_newc` (`post_type='listings'`) | 115 (105 `publish`, 10 `trash`) |
| Listing posts in `maklerre_newru` | 51 (all `publish`) |
| Total legacy listing posts in the dumps | 166 |
| Legacy posts consumed by the 160 map records | 160 (109 on `.com`, 51 on `.ru`) |
| Legacy posts **not** referenced by any map record | 6 |
| Crawled listing URLs in the 2026-07-04 baseline | 165 |

All 6 unreferenced posts were created **after** the crawl, so they were never crawled:

| Domain | Post | `wtf_pid` | Status | `post_date` | Slug |
| --- | --- | --- | --- | --- | --- |
| .com | 12242 | 989 | publish | 2026-07-29 10:38:47 | `тристаен-апартамент-в-гр-сандански-2` |
| .com | 12248 | 912 | publish | 2026-07-29 10:54:51 | `голям-панорамен-двустаен-апартамент` |
| .com | 12256 | 200 | publish | 2026-08-05 12:45:35 | `tristaen-apartament-sandanski-center` |
| .com | 12257 | 201 | publish | 2026-08-05 12:58:15 | `authentic-house-with-yard-for-sale-...-palat...` |
| .com | 12264 | 202 | publish | 2026-08-06 08:15:03 | `dvustaen-apartament-sandanski` |
| .com | 12290 | 203 | trash | 2026-08-06 08:55:03 | `обзаведен-двустаен-апартамент-в-сан` |

So the books balance exactly: **165 crawled = 160 surviving + 5 hard-deleted**, and
**166 in the dump = 160 surviving + 6 created after the crawl**. Every one of the 5
unresolved records was a distinct WordPress post that was permanently deleted between
2026-07-04 and 2026-08-28. None of them is an alias, a slug variant, or a language
variant of a surviving post. The task brief's hypothesis that MS-CRAWL-0085 and
MS-CRAWL-0165 are "language variants whose canonical slug is in another language" is
**disproved**: the crawler's `hreflang` block for each shows every language pointing at
the same slug (qTranslate keeps one `post_name` per post and varies only the path
prefix), and the German slug `apartment-mit-einem-schlafzimmer-in-sandanski-zu-vermieten`
was the canonical slug in all seven languages.

`ms_postmeta` contains no orphaned rows for the deleted posts (7 orphan meta rows on
`.com`, 5 on `.ru`, none carrying `wtf_*` keys), so the deleted `wtf_pid` values cannot
be read directly. They have to be reconstructed from surviving evidence.

### 0.2 Evidence instruments, and how well each one is calibrated

Four independent instruments were built and each was validated against the 160 records
the map already resolved, so the confidence grades below are grounded rather than
asserted.

| Instrument | How it works | Calibration on the 160 known-good records |
| --- | --- | --- |
| **Media fingerprint** (strongest) | `_thumbnail_id` and `_easy_image_gallery` resolve through `ms_posts` attachment rows plus `_wp_attached_file` to real upload filenames; the crawler's `media-inventory.csv` records every image on each crawled page. Sets are compared directly. | Thumbnail basename agrees on **149/151** comparable records; the 2 exceptions are a re-upload (`911-real-1.jpg`) and a different rendition size (`635-1-800x600.jpg`). |
| **Sitemap month partition** | Yoast serves month-partitioned sitemaps (`sitemap-pt-listings-YYYY-MM.html`); `url-inventory.csv` stores which partition each URL came from, which reveals the deleted post's `post_date` month. | Partition month equals `post_date` month on **108/109** `.com` records; the single exception was discovered through the generic `sitemap-2/` index. |
| **`_wp_desired_post_slug`** | WordPress stores the pre-trash slug here when it appends `__trashed` and truncates `post_name` to 200 bytes. | Present on all 10 trashed `.com` posts and byte-identical to the crawled slug in every case. |
| **Image filename lot prefix** (weakest, corroborating only) | The agency names photos `<lot>-<n>.jpg`. | Dominant prefix equals `wtf_pid` on **130/142** records (91.5%). Known failure modes: digit transpositions (`856`/`865`, `954`/`945`, `903`/`902`, `670`/`697`) and photo sets reused from an older lot. Never used alone. |

A fifth, one-off artefact proved decisive for the Strumyani pair: a 2014-vintage Yoast
sitemap XML cached inside a `_transient` row of `ms_options` on **both** dumps, which
maps legacy slugs to their lead image.

---

## 1. The five unresolved records

### 1.1 MS-CRAWL-0008 (makler-realty.com, bg)

`Двустаен апартамент в центъра на Сандански – наем`, rent, EUR 350, 1 bedroom,
slug `двустаен-апартамент-в-центъра-на-санд`, implied `post_date` month **2024-02**.

| Rank | Candidate | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | **Lot 662** | All 13 crawled images are `662.jpg`, `662-2..13` (incl. the edited `662-12-e1530972862705.jpg`, `662-13-e1530972844960.jpg`); crawled thumbnail is `/2023/06/662-4-680x510.jpg`. On `.com` every `662-*` attachment (14 in `2018/07`, 7 in `2023/06`) has `post_parent=0`, i.e. orphaned by a post deletion. On `.ru`, post **7229** carries `wtf_pid=662`, `wtf_price=350` (identical to the seed price), and the same 13 filenames with `post_parent=7229`. That post is MS-CRAWL-0147, the Russian twin (`Посуточная аренда в центре города Сандански`). Image-set Jaccard between MS-CRAWL-0008 and MS-CRAWL-0147 is 0.44, the only cross-record link either has. | **HIGH.** Assign 662. |
| 2 | Lot 731 (`.com` post 8282, `Двустаен апартамент под наем в Сандански`) | Bulgarian title similarity 0.76, token overlap 0.8, `wtf_price=350` matches. But the post is live, owned by MS-CRAWL-0101, and its images are `731-*`, with zero overlap. | Reject. |
| 3 | Lot 876 (`.com` post 11246, `Наем - Двустаен апартамент в гр.Сандански`) | Title token overlap 1.0. But `wtf_price=230`, images `876-*`, live and owned by MS-CRAWL-0014. | Reject. |

Note: the `.com` photos sit in `2018/07` and `2023/06` while the deleted post dates from
2024-02. That is consistent, the Bulgarian re-listing of an existing lot reused
previously uploaded media.

### 1.2 MS-CRAWL-0027 (makler-realty.com, bg)

`Продава двустаен апартамент в гр.Сандански`, sale, EUR 53,307, 1 bedroom,
slug `продава-двустаен-апартамент-в-гр-санд`, implied `post_date` month **2025-09**.

This is the one case where the obvious answer is wrong, and it is worth spelling out.

MS-CRAWL-0027 and MS-CRAWL-0007 share an identical `title`, an identical `h1`, the exact
same five photos (`911-1..5.jpg`, Jaccard 1.0) and a 0.977-similar description. The naive
read is "same listing, two URLs". A character-level diff of the two Bulgarian
descriptions says otherwise:

| Field | MS-CRAWL-0007 (post 11740, lot 911) | MS-CRAWL-0027 (deleted) |
| --- | --- | --- |
| Unit | `Двустаен апартамент на първи жилищен етаж` (first residential floor) | `Двустаен апартамент на трети жилищен етаж D-A 14` (third floor, unit D-A 14) |
| Built area | `50, 65 кв.м.` | `50, 67 кв.м.` |
| Total area | `59,21 кв.м.` (equals `wtf_area` = `59,21` on post 11740) | `59,23 кв.м.` |
| Rooms | hall with kitchen, bathroom, terrace | hall with kitchen, **bedroom**, bathroom, terrace |
| Seed price | 53,289 = 59.21 x 900 EUR/m2 | 53,307 = 59.23 x 900 EUR/m2 |
| Thumbnail | `911-2-680x514.jpg` | `911-1-680x514.jpg` |
| Word count | 551 | 554 |

Both prices are exactly `total area x 900 EUR/m2`, which independently confirms the two
areas and therefore two distinct apartments in the same building. The agency simply
reused unit 911's photo set for its sibling unit, which is why the media fingerprint
points at a post that is already spoken for.

| Rank | Candidate | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | **Assign a new number** | The record is a real, separate apartment (3rd floor, unit D-A 14, 59.23 m2). Its post was created 2025-09, the same month as post 11740, and hard-deleted before the dump, taking its `wtf_pid` with it. No surviving artefact carries it. | **HIGH** that a new number is required. The number itself is unknown. |
| 2 | Lot 911 (post 11740, MS-CRAWL-0007) | Identical photos, title and building blurb. Rejected as an identity because floor, unit code, built area, total area and price all differ. Choose this only if the agency decides the two units should be merged into one catalog entry. | Reject as identity; viable only as a deliberate merge. |
| 3 | Lot 989 (post 12242, unreferenced) | Same building (content similarity 0.62) and it borrows the same `911-real-1.jpg` thumbnail. But it is a three-room unit at 97 m2 / EUR 121,000, and it was created 2026-07-29, three weeks after the crawl. | Reject. |

Numbering hint for whoever picks the new value: in September 2025 the agency was issuing
908 (post 11688, 2025-09-12) and 911 (post 11740, 2025-09-26). The sibling almost
certainly held one of **909, 910 or 912**. 912 was later reissued to post 12248 on
2026-07-29, exactly the behaviour you would expect after the original holder was deleted,
but that is inference, not evidence, and 912 is now occupied.

### 1.3 MS-3000 (makler-realty.com, bg)

`Продажба на парцел в Струмяни – 3000 кв.м`, land, sale, EUR 38,000,
slug `продажба-на-парцел-в-струмяни-3000-кв-м`, implied `post_date` month **2025-03**.
The `MS-3000` reference itself is a crawl-id artefact derived from the "3000 кв.м" in the
slug and carries no legacy meaning.

| Rank | Candidate | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | **Lot 356** | The 4 crawled photos are `PHOTO-2025-06-03-13-42-17{,_1,_2,_3}.jpg`, all orphaned on `.com` in `/2025/03/`, matching the implied 2025-03 post month exactly. The Russian record MS-CRAWL-0165 shows the identical 4 photos plus `356-plan.jpg` and `356-4..8.jpg`, same village, same EUR 38,000, same offer type. The cached 2014 Yoast sitemap in `ms_options` maps `makler-realty.com/listing/uchastok-strumiani/` to `356-6.jpg` and `makler-realty.ru/listing/uchastok-strumiani/` to the same image, so `.com` did once host a lot-356 plot at that slug before it was renamed to the "3000 кв.м" slug. | **MEDIUM.** Assign 356 once a human confirms MS-3000 and MS-CRAWL-0165 are the same plot. See the caveat below. |
| 2 | Lot 286 (post 973 on both domains) | Same village, adjacent slug `участок-в-поселке-струмяни`. But different photos (`286-dron.jpg`, `286-1..4`), different prices (EUR 45,000 on `.com`, EUR 25,000 on `.ru`), and both posts are alive and already mapped to MS-CRAWL-0081 / MS-CRAWL-0153. | Reject. |
| 3 | Lot 470 (post 7194 `.com` / 4264 `.ru`) | Same village, `Продава парцел за строителство в с.Струмяни`. Photos `470-dron-new.jpg`, `wtf_total_area=677`, and both posts are alive and mapped. | Reject. |

Caveat driving the MEDIUM grade: the `.com` post's own `wtf_pid` is gone and no `356-*`
attachment survives on `.com`, so the number is inherited from the Russian twin.
Cross-domain lot numbers usually agree (30 of 36 image-linked cross-domain pairs share a
number) but not always. The 6 exceptions are all cases where different units in one
complex share a photo set (the Park Hotel Pirin cluster 191/707/778) or a rent-versus-sale
pair of the same building (872 versus 870 in Vinogradi). Neither pattern applies here, and
the cached `.com` sitemap independently ties `uchastok-strumiani` on `.com` to `356-6.jpg`,
which is why the recommendation is still 356.

### 1.4 MS-CRAWL-0085 (makler-realty.com, bg)

`Двустаен апартамент в Сандански. Наем`, rent, EUR 260, 1 bedroom,
slug `apartment-mit-einem-schlafzimmer-in-sandanski-zu-vermieten`,
implied `post_date` month **2023-02**.

This is the record whose disappearance is directly documented: `crawl-delta.md` for
`20260710-211919` lists it under **Removed URLs**, with the probe result
`status=404 ... error=HTTP 404`. It was deleted between 2026-07-04 and 2026-07-10.

| Rank | Candidate | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | **Lot 851** | 6 of the 7 crawled photos are `851-1..6`, the 7th is `850-7.jpg`; crawled thumbnail `/2021/11/851-1-680x510.jpg`. Every `851-*` attachment on `.com` is orphaned, in two upload batches, `2021/11` (851-1..6) and `2023/02` (851-1..4 plus `850-7.jpg`). The `2023/02` batch matches the implied 2023-02 post month exactly. No surviving post on either domain carries `wtf_pid=851`, so the number is free and uncontested. MS-CRAWL-0085 is the only record in the whole catalog whose page references `851-*` or `850-7`. | **HIGH.** Assign 851. |
| 2 | Lot 731 (post 8282, `Двустаен апартамент под наем в Сандански`) | Title token overlap 1.0 against the Bulgarian block. But live, mapped to MS-CRAWL-0101, `wtf_price=350` against a seed price of 260, images `731-*`. | Reject. |
| 3 | Lot 760 (post 8980, trashed, `wohnung-zu-vermieten-beim-aquasun-in-sandanski`) | Same German-slug habit and the same Bulgarian title `Двустаен апартамент под наем в Сандански`. But its `_wp_desired_post_slug` is `wohnung-zu-vermieten-beim-aquasun-in-sandanski`, already claimed by MS-CRAWL-0109, and its images are `760-*`. | Reject. |

### 1.5 MS-CRAWL-0165 (makler-realty.ru, ru)

`Продажа участка в Струмяни. Недвижимость в Сандански`, land, sale, EUR 38,000,
slug `uchastok-strumiani`.

| Rank | Candidate | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | **Lot 356** | The crawled page carries `356-plan.jpg` and `356-4..8.jpg`, all orphaned `.ru` attachments in `/2014/06/`, alongside the newer `PHOTO-2025-06-03-*` set. The cached Yoast sitemap in `ms_options` on the `.ru` dump maps `makler-realty.ru/listing/uchastok-strumiani/` (lastmod 2014-06-16) to `356-6.jpg`, and shows it is a different property from `участок-в-поселке-струмяни` (lot 286, image `286-2.jpg`) and from `участок-в-струмяни` (`221-2-струмяни.jpg`). A property-specific `356-plan.jpg` site plan clinches it. `wtf_pid=356` is used by no surviving post. | **HIGH.** Assign 356. |
| 2 | Lot 286 (`.ru` post 973, MS-CRAWL-0153) | Same village, Russian title similarity 0.77. But images `286-*`, `wtf_price=25000`, `wtf_total_area=734`, alive and separately mapped. | Reject. |
| 3 | Lot 470 (`.ru` post 4264, MS-CRAWL-0154) | Same village and offer, Russian title similarity 0.88. But images `470-dron-new.jpg`, `wtf_total_area=677`, alive and mapped. | Reject. |

MS-3000 and MS-CRAWL-0165 form a cross-domain pair for one plot, like the 36 pairs the
map already contains, and must receive the same number.

---

## 2. The reused lot numbers, 890 and 987

### 2.1 Lot 890

| Domain | Post | Status | `post_date` | `post_modified` | Title (bg / ru) | `wtf_price` | `wtf_area` | `wtf_total_area` | New record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .com | **11373** | publish | 2025-02-07 09:52:17 | 2025-02-07 09:52:17 | `Офис под наем в центъра на гр.Сандански` | 83 | 18 | - | **MS-CRAWL-0020** |
| .com | 11585 | publish | 2025-06-24 06:40:49 | 2025-06-24 06:41:11 | `Продава голяма къща в близост до гр.Сандански` | 225000 | 313 | 760 | MS-CRAWL-0026 |
| .ru | 9571 | publish | 2025-06-25 06:22:02 | 2025-06-25 06:22:25 | `Продажа большого дома недалеко от города Сандански` | 225000 | 313 | 760 | MS-CRAWL-0125 |

Two distinct properties: a 18 m2 office let at EUR 83/month, and a 313 m2 house on a
760 m2 plot at EUR 225,000. Posts 11585 and 9571 are the Bulgarian and Russian faces of
the same house (identical `wtf_price`, `wtf_area`, `wtf_total_area` and photo set), which
is a legitimate cross-domain pair, so the genuine collision is 11373 versus 11585 on
`.com`.

**Recommendation: lot 890 stays with MS-CRAWL-0020 (the office).** Three converging
reasons:

1. It is the oldest published, non-trashed post (2025-02-07 versus 2025-06-24), which is
   the stated tie-break rule.
2. Its photos were named first: `890-1.jpeg` and `890-2.jpeg` were uploaded 2025-02-07
   09:51, four months before `890-1.jpg` through `890-15.jpg` on 2025-06-24 06:37. The
   `.jpeg` versus `.jpg` extension split is precisely what let the second property occupy
   the same numeric name without a filename clash.
3. 890 fits the agency's own issuing sequence for February 2025, sitting between 876
   (post 11246, 2025-01-10) and 891 (post 11466, 2025-04-03). A post created 2025-06-24
   should have drawn something near 894 to 897 (894 on 2025-05-22, 895 on 2025-06-04,
   896 and 897 on 2025-06-13). The house is the mis-numbered one.

**MS-CRAWL-0026 and MS-CRAWL-0125 must be renumbered together**, to a single shared new
value, since they are one property on two domains.

### 2.2 Lot 987

| Domain | Post | Status | `post_date` | `post_modified` | Title (bg) | `wtf_price` | `wtf_area` | `wtf_total_area` | New record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .com | **10982** | publish | 2024-04-12 09:53:57 | 2024-04-12 09:53:57 | `Продава къща в Гърция, Еретрия - Котрони` | 950000 | 300 | 5000 | **MS-CRAWL-0043** |
| .com | 12221 | publish | 2026-06-29 07:46:44 | 2026-06-29 07:50:32 | `Двустаен апартамент в идеалния център на гр. Сандански` | 130000 | 55 | - | MS-CRAWL-0010 |

Two entirely unrelated properties: a three-storey villa in Eretria-Kotroni, Greece, and a
55 m2 apartment in central Sandanski. Neither has a cross-domain twin.

**Recommendation: lot 987 stays with MS-CRAWL-0043 (the Greek villa).** Reasons:

1. Oldest published, non-trashed post by more than two years.
2. Its photo family `987-1.jpg` through `987-14.jpg` was uploaded 2024-04-12 09:52 to
   09:53, attached to post 10982. The apartment's family `987-1.jpeg` through
   `987-21.jpeg` was uploaded 2024-05-08, less than a month later, and every one of those
   21 attachments is orphaned (`post_parent=0`), meaning the apartment's original 2024
   post was deleted and post 12221 is a 2026 re-listing that picked the old files back up
   (plus a new `987-main-1.jpg` on 2026-06-29). The collision therefore dates from
   2024-05-08 and has always been the apartment's error.
3. 987 is wildly out of sequence for June 2026: the agency was issuing 959 (2026-06-16)
   and 960 (2026-06-25) at the time. 987 in April 2024 sits comfortably beside 999
   (post 10922, 2024-04-06) and 963 (post 11205, 2024-09-09).

**MS-CRAWL-0010 gets a new number.**

### 2.3 Where the new numbers should come from

Two options, and this is a business decision, not a data one:

* **The agency's own precedent.** The dumps already contain `wtf_pid = '567-1'` (post
  12192, `Къща за продажба в с.Хотово`), sitting next to `wtf_pid = '567'` (post 11257,
  `Продава стара къща в с.Хотово`). If the team likes that convention, the renumbered
  records become `890-1` (house pair) and `987-1` (apartment). Note this makes `wtf_pid`
  a string, which the map already tolerates.
* **Next free integers.** The highest number in use is 999. Free values above 960 are
  961, 962, 964 to 986, 988, and 990 to 998. 990 and 991 would be the tidy choice.

---

## 3. The three fuzzy (slug-prefix) matches

All three are **CONFIRMED**, and not merely by similarity. Each matched post is trashed,
and WordPress recorded the pre-trash slug in `_wp_desired_post_slug`, which is
byte-for-byte identical to the crawled slug. The prefix match was only needed because
`post_name` is capped at 200 bytes and appending `__trashed` to a percent-encoded
Cyrillic slug truncates it mid-sequence.

| Record | Crawled slug (decoded) | Stored `post_name` (decoded) | `_wp_desired_post_slug` (decoded) | Verdict |
| --- | --- | --- | --- | --- |
| MS-CRAWL-0054 | `продава-панорамен-двустаен-апартаме` | `продава-панорамен-двустаен-апартам__trashed` (198 B) | `продава-панорамен-двустаен-апартаме` (**exact**) | **CONFIRM** |
| MS-CRAWL-0066 | `продава-тристаен-апартамент-в-офрини` | `продава-тристаен-апартамент-в-офрин__trashed` (199 B) | `продава-тристаен-апартамент-в-офрини` (**exact**) | **CONFIRM** |
| MS-CRAWL-0077 | `светъл-южен-апартамент-до-парка-на-гр-с` | `светъл-южен-апартамент-до-парка-на-г__trashed` (195 B) | `светъл-южен-апартамент-до-парка-на-гр-с` (**exact**) | **CONFIRM** |

Titles and media corroborate every one:

| Record | Lot / post | Seed `h1` | Legacy `[:bg]` title block | Thumbnail (seed = legacy) | Gallery |
| --- | --- | --- | --- | --- | --- |
| MS-CRAWL-0054 | 432 / `.com` 10916 | `Продава панорамен двустаен апартамент в Сандански` | `Продава панорамен двустаен апартамент в Сандански` | `333-2.jpeg` = `333-2.jpeg` | 15 of 15 `333-*` filenames identical |
| MS-CRAWL-0066 | 893 / `.com` 11521 | `Продава тристаен апартамент в Паралия Офринио, Гърция` | `Продава тристаен апартамент в Паралия Офринио, Гърция` | `893-1-2.jpg` = `893-1-2.jpg` | 23 of 23 identical, incl. `plan-ofrinio.jpg` |
| MS-CRAWL-0077 | 959 / `.com` 12199 | `Светъл южен апартамент до парка на гр. Сандански` | `Светъл южен апартамент до парка на гр. Сандански` | `959-2.jpg` = `959-2.jpg` | 8 of 8 `959-*` filenames identical |

One footnote on MS-CRAWL-0066: the seed price is EUR 139,000 while `wtf_price` is
135,000. Post 11521 was modified 2026-08-06, a month after the crawl, so this is a
later edit, not a mismatch. It does not affect identity.

Structural safety checks run alongside: there are **no** `slug_key` collisions within
either domain, and **no** duplicated crawl slugs across the 165 seed records, so the
prefix matcher had no opportunity to grab the wrong post.

---

## 4. Sanity check on confidently matched records

Sample: 15 records drawn with `random.Random(20260903).sample(...)` from the 157 records
matched on an exact slug (the 3 fuzzy ones excluded).

### 4.1 Price

| Record | Lot | Domain / post | `wtf_price` | Seed `price_eur` | Verdict |
| --- | --- | --- | --- | --- | --- |
| MS-CRAWL-0034 | 963 | .com 11205 | 93000 | 93000 | match |
| MS-CRAWL-0037 | 719 | .com 8077 | null | null | both price-on-request |
| MS-CRAWL-0042 | 811 | .com 9427 | 60000 | 60000 | match |
| MS-CRAWL-0058 | 749 | .com 8643 | 25000 | 25000 | match |
| MS-CRAWL-0062 | 894 | .com 11541 | 563000 | 563000 | match |
| MS-CRAWL-0063 | 960 | .com 12209 | 28000 | null | both price-on-request in seed |
| MS-CRAWL-0067 | 902 | .com 11639 | 126000 | 126000 | match |
| MS-CRAWL-0074 | 939 | .com 11989 | 339000 | 339000 | match |
| MS-CRAWL-0093 | 190 | .com 11241 | 110000 | 110000 | match |
| MS-CRAWL-0096 | 758 | .com 8770 | null | null | both price-on-request |
| MS-CRAWL-0121 | 766 | .ru 8544 | 128000 | 128000 | match |
| MS-CRAWL-0127 | 499 | .ru 4574 | 50000 | 50000 | match |
| MS-CRAWL-0131 | 280 | .ru 1015 | 93000 | 93000 | match |
| MS-CRAWL-0137 | 555 | .ru 9359 | null | null | both price-on-request |
| MS-CRAWL-0139 | 750 | .ru 8426 | 345000 | 345000 | match |

**Sample agreement rate: 11/11 comparable pairs agree exactly (100%).** Four pairs are
not comparable because the price is absent on both sides.

Because a 15-record sample is thin, the same comparison was run over **all 160** mapped
records: **116 of 125 comparable pairs agree exactly (92.8%)**. All 9 disagreements:

| Record | Lot | `wtf_price` | Seed | `post_modified` | Reading |
| --- | --- | --- | --- | --- | --- |
| MS-CRAWL-0007 | 911 | 75000 | 53289 | 2026-07-29 | edited after the crawl |
| MS-CRAWL-0017 | 938 | 109000 | 117000 | 2026-08-27 | edited after the crawl |
| MS-CRAWL-0021 | 944 | 170000 | 165000 | 2026-08-06 | edited after the crawl |
| MS-CRAWL-0032 | 932 | 73000 | 86000 | 2026-08-05 | edited after the crawl |
| MS-CRAWL-0046 | 941 | 240000 | 270000 | 2026-08-17 | edited after the crawl |
| MS-CRAWL-0066 | 893 | 135000 | 139000 | 2026-08-06 | edited after the crawl |
| MS-CRAWL-0087 | 791 | 85000 | 75000 | 2025-05-20 | **genuine**, see below |
| MS-CRAWL-0116 | 791 | 85000 | 75000 | 2024-10-17 | **genuine**, same lot on `.ru` |
| MS-CRAWL-0154 | 470 | 25000 | 11000 | 2024-01-17 | **genuine** |

Six of the nine are simply later edits: the crawl froze on 2026-07-04, the dump was taken
2026-08-28, and those posts were modified in between. The three genuine ones are a
data-quality finding rather than an identity problem: for lot 791 the seed narrative
literally contains "75 000" while `wtf_price` says 85000, and for lot 470 the `.ru`
narrative contains "11 000" while `wtf_price` says 25000. In other words the body copy
and the price meta field disagree on the legacy site itself, and the crawler took the
body copy. Worth flagging to the agency, but it does not touch any lot number.

### 4.2 Area

**Area cannot be verified, because the new catalog does not carry it.** Across all 165
seed records, `facts.area_sqm` and `facts.land_area_sqm` are `null` without exception, and
in the parallel `properties` collection every one of `living_area_sqm`, `built_area_sqm`,
`usable_area_sqm`, `gross_floor_area_sqm`, `land_area_sqm` and `primary_area_sqm` is
`null` for all 165 rows (`bedrooms_count` is the only populated numeric, on 71 rows). The
legacy side is well populated by contrast: `wtf_area` on 153 of 166 posts and
`wtf_total_area` on 70.

As a proxy, each sampled record's `wtf_area` value was searched for inside the seed
narrative text (description plus all seven translations):

| Found in text | Not found | No `wtf_area` |
| --- | --- | --- |
| 6 | 8 | 1 |

Examples that hit: MS-CRAWL-0058 (`288`), MS-CRAWL-0062 (`2600`), MS-CRAWL-0067 (`90`),
MS-CRAWL-0074 (`220`), MS-CRAWL-0121 (`315`), MS-CRAWL-0037 (`1000`). The misses are
mostly prose that rounds or omits the figure (for example MS-CRAWL-0127's 38016 m2 is
described as hectares). This is not evidence of disagreement, only that the check is
weak. **The real finding is that the area migration dropped every value, which is a
separate defect worth raising.**

### 4.3 Bedrooms, incidental observation

The legacy `bedrooms` taxonomy is a Bulgarian *room* count, one higher than the seed's
bedroom count, and the mapping holds in 5 of the 6 sampled records that have both
(MS-CRAWL-0034 4/3, MS-CRAWL-0063 1/0, MS-CRAWL-0067 3/2, MS-CRAWL-0074 3/2,
MS-CRAWL-0131 4/3). The exception is **MS-CRAWL-0093** (legacy taxonomy 5, seed 2), worth
a look.

---

## 5. Decision table

| Record | Lot number | Action | Confidence |
| --- | --- | --- | --- |
| MS-CRAWL-0008 | 662 | assign_legacy | high |
| MS-CRAWL-0027 | null | assign_new | high |
| MS-3000 | 356 | assign_legacy | medium |
| MS-CRAWL-0085 | 851 | assign_legacy | high |
| MS-CRAWL-0165 | 356 | assign_legacy | high |
| MS-CRAWL-0020 | 890 | keep | high |
| MS-CRAWL-0026 | null | reassign_new | high |
| MS-CRAWL-0125 | null | reassign_new | high |
| MS-CRAWL-0043 | 987 | keep | high |
| MS-CRAWL-0010 | null | reassign_new | high |
| MS-CRAWL-0054 | 432 | keep | high |
| MS-CRAWL-0066 | 893 | keep | high |
| MS-CRAWL-0077 | 959 | keep | high |

Machine-readable form: `legacy-identity-overrides.json` in this directory.

---

## 6. What still needs a human decision

1. **The new number for MS-CRAWL-0027.** The apartment is real (3rd floor, unit D-A 14,
   59.23 m2, EUR 53,307) but its `wtf_pid` was destroyed with the post. Only the agency
   can say what it was, or issue a replacement. Ask them whether 909, 910 or 912 rings a
   bell for the September 2025 batch in that building.
2. **Which new numbers to issue for the three renumbered records** (MS-CRAWL-0026 plus
   MS-CRAWL-0125 as one shared value, and MS-CRAWL-0010). Choose between the agency's own
   `890-1` / `987-1` suffix convention, already precedented by `567-1`, and the next free
   integers (990 and 991 are the tidiest of 961, 962, 964 to 986, 988, 990 to 998).
3. **Confirm MS-3000 and MS-CRAWL-0165 are the same Strumyani plot.** Everything points
   that way (identical 4-photo set, identical EUR 38,000, same village, same offer type)
   but MS-CRAWL-0165's Russian body copy is a one-line stub with no size given, so nobody
   has independently confirmed the 3000 m2 figure on the Russian side. If confirmed, both
   take 356; if not, MS-3000 needs its own decision.
4. **Whether the five deleted listings should exist in the new catalog at all.** They were
   deleted from WordPress between 2026-07-04 and 2026-08-28, which usually means sold,
   withdrawn or de-duplicated. MS-CRAWL-0085 is documented as a 404 by 2026-07-10. The
   catalog currently marks all five `cms_status: published`. Recovering their lot numbers
   and publishing them are separate decisions.
5. **The six listings created after the crawl** (lots 989, 912, 200, 201, 202, 203) are in
   WordPress but not in the new catalog at all. They need a fresh capture, not a lot-id
   fix. Note that lots 200 to 203 restart a low-number series, which may be a deliberate
   new scheme or a data-entry slip.
6. **Three genuine price disagreements** (lot 791 on both domains, lot 470 on `.ru`) where
   the legacy body copy and `wtf_price` contradict each other. The agency should say which
   is authoritative.
7. **Every area value was lost in the migration** (0 of 165 records carry any area), while
   the legacy database still holds `wtf_area` for 153 of 166 posts and `wtf_total_area`
   for 70. This is recoverable from the dumps and is probably the single highest-value
   follow-up in this dataset.
8. **MS-CRAWL-0093 bedroom count**, legacy room taxonomy says 5, the seed says 2.
