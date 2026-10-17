# i18n: user-facing copy outside the message catalogs — audit and migration plan

Date 2026-10-04 · measured at `076c88cd` (`app/ src/ messages/` identical at `6f3cc06e`). The staff key `workspace.currentPage` added in the same branch is not counted.
Authority: `AGENTS.md` (Butler drafts only; public translations human-approved before indexing; property facts exact),
`docs/architecture.md` §3.2, `docs/ux-spec.md` §19, `CONTEXT.md` (language approval is not factual, legal or publishing approval).
Replaces the "about 90 %" guess in `design/audit.md` K-5 with the measurement in §2.

## 1. How i18n works today

| Aspect | Finding | Where |
|---|---|---|
| Locales | public/client `bg` (source) `en ru de nl el he`; staff `bg en ru`. RTL only `he`. Regional tags `bg-BG … he-IL`, zone `Europe/Sofia` | `src/domain/ids`, `src/i18n/config.ts` |
| Catalogs | next-intl 4.14.6. JSON per namespace: `messages/<locale>/{a11y,common,errors,footer,forms,nav,states}.json` = 107 keys x 7 locales; `messages/staff/<locale>/workspace.json` = 22 keys x 3. Types come from `bg` | `messages/`, `src/i18n/messages.ts`, `global.ts` |
| Loader | `getRequestConfig` -> `loadMessages` dynamic-imports every namespace on every request. No client provider and no hooks: strings reach client components as props | `src/i18n/request.ts` |
| `t()` use | 16 `getTranslations` calls in 11 files: the three shells, four not-found pages plus `not-found-content`, language suggestion, `access-frame`, one SEO nav label. 0 of 110 pages call it. Static grep finds callers for about 40 keys; all 44 `states.*` have none | `src/features/shell/*`, `app/**/not-found.tsx` |
| Copy pattern | 40 copy functions in 41 `*copy*.ts` files (`caseCopy(locale)`, `discoveryCopy(locale)`...) plus 15 screens with inline dictionaries. Each returns a flat object of strings. Four authoring techniques (§2.2). Resolver `locale==="bg"?bg:locale==="ru"?ru:en` sends de/nl/el/he to English | `src/features/*/copy.ts` |
| Review gate | `_status.json`: all 10 sets `draft_unreviewed`, no reviewer. `localePolicy` makes a non-source locale indexable only with a `locale_indexability` approval (`settings.manage`) **and** an approved catalog; `bg` short-circuits. TS copy is outside this gate | `src/i18n/config.ts`, `src/domain/approval.ts` |
| Checks | `messages.test.ts`: files = registered namespaces, same keys per locale, non-empty, ICU placeholders, plural categories, ICU errors, review entry, §11.4 states. `config.test.ts`: indexability. **Nothing checks TS copy**: TS parity is only `typeof en`, which `...en` spreads defeat in 10 modules; `Row` 7-tuples in 4 files. Biome `noJsxLiterals` is off | `src/i18n/*.test.ts`, `biome.json` |
| Formatters | `format.ts` money/number/area/date. `m²` hard-coded (`:85`, `:95`); 23 inline `Intl`/`toLocaleString` sites in 17 files bypass it; 6 `"en-GB"` fallbacks for non-public locales | `src/i18n/format.ts` |

## 2. Inventory of copy outside the catalogs

### 2.1 Measured share

| Unit | In catalogs | Outside catalogs (UI code) | Share outside |
|---|---|---|---|
| Logical messages (one key, row or call, all locales together) | 129 (107 public + 22 staff) | **1,812** in 59 files | **93.4 %** |
| String literals (every locale variant) | 815 (107x7 + 22x3) | about 6,000 | 88.0 % |
| Messages, ignoring the 44 caller-less `states.*` keys | 85 | 1,812 | 95.5 % |
| Pages (110: public 19, client 25, staff 66) | shells and 404 only; 0 pages call `t()` | 107 pages render TS-module copy | 97 % |

**How measured.** TypeScript-compiler AST pass over 357 production files (`app/{public,client,staff}/**`, `src/features/**`,
`src/ui/**`, `src/i18n/**`; tests, seeds, `src/db`, `src/server`, `src/domain`, SEO, dev specimen and API routes excluded).
Counted: strings under locale-named objects/arrays, multi-script `s(bg,ru,en)` calls and string tuples, `locale === "xx"`
branches, JSX text, prose JSX attributes, label-like properties and labelled returns. One message = one key, row or call.
Cross-checks: (1) dynamic import of the 40 copy functions for all 7 locales: message counts equal for 34, and the other 6 differ
only by auxiliary label maps the AST also counts; (2) Biome `style/noJsxLiterals`: 303 non-test hits = 289 punctuation + 14 with
letters; 13 are in the AST list (mostly invariants), 1 is in the excluded specimen; (3) recall greps: no prose `aria-label/title/placeholder/alt` literals missed.
Limits: strings built from fragments, CMS/DB content and view-model labels in unusual properties are not seen; surfaces come from
the import graph (depth 3, shells and `src/ui` ignored). The scripts lived in the session scratchpad and are not committed;
Phase 0 productises them as the guard.

### 2.2 By kind (what the task asked for)

| Kind | Files | Messages | Literals | Notes |
|---|---|---|---|---|
| (a) TS module, all 7 locales | 9 | 222 | 1,554 | `discovery/*` 7 modules (212), consent `tracking/copy.ts` (8), `private-page-guard.tsx` (2). A few cognates equal English (3 de, 2 nl, 1 el in `discovery/copy.ts`) |
| (b1) TS module, bg+en+ru only | 44 | 1,369 | 4,017 | de, nl, el, he render **English**. Inside: 41 bg / 42 ru keys are also English (§2.5) |
| (b2) TS module, bg+en only | 3 | 208 | 416 | missing ru de nl el he: `files/copy.ts` 98, `privacy/copy.ts` 85, `discovery/search-alert-copy.ts` 25 |
| (c) hard-coded single-language | 6 | 13 | 13 | English 11 ("Inbox", "Revision", "Brief", "Interest", "Reference", "Preview", "· Revision", "Confirm your identity" x2, "Queue worker:", "Remove"), Bulgarian 1 ("България"), Greek 1 ("Ελλάδα"). Another 24 literals are invariants (brand, `Europe/Sofia`, `SHA-256`, `MiB`, `m²`, file types) and are allow-listed, not counted |

Structure: 41 copy modules hold 1,662 messages (91.7 %), 15 inline-dictionary screens 137 (7.6 %), hard-coded 13 (0.7 %).
Techniques (messages, approximate, overlapping inside files): locale-named dictionaries `const en/bg/ru` 1,242 in 32 files;
positional tuples (7-column `Row`, `[bg,ru,en]`) 267 in 9; `s(bg,ru,en)` closures 237 in 8; `locale` ternary or `if` branches 94 in 13.

### 2.3 By directory / feature

| Directory | Files | (a) | (b) | (c) | Messages | Literals | Surface |
|---|---|---|---|---|---|---|---|
| `src/features/cases` | 8 | - | 268 | 9 | **277** | 754 | client+staff |
| `src/features/discovery` | 8 | 212 | 25 | - | **237** | 1,534 | public, client |
| `src/features/inventory` | 5 | - | 182 | - | **182** | 545 | staff |
| `src/features/work` | 7 | - | 158 | - | **158** | 471 | client+staff |
| `src/features/identity` | 4 | 2 | 147 | - | **149** | 453 | client+staff |
| `src/features/ai` | 7 | - | 125 | 1 | **126** | 375 | staff |
| `src/features/files` | 1 | - | 98 | - | **98** | 196 | client+staff |
| `src/features/privacy` | 1 | - | 85 | - | **85** | 170 | client+staff |
| `src/features/compliance` | 1 | - | 70 | 2 | **72** | 212 | staff |
| `src/features/inbound` | 2 | - | 65 | - | **65** | 195 | staff |
| `src/features/proposals` | 1 | - | 56 | - | **56** | 144 | client+staff |
| `src/features/case-access` | 1 | - | 46 | - | **46** | 138 | client+staff |
| `src/features/content` | 1 | - | 44 | - | **44** | 132 | staff |
| 8 smaller (`key-custody` 36, `document-requests` 34, `complaints` 32, `subscriptions` 27, `offboarding` 26, `absence` 22, `appointments` 20, `tracking` 8) | 8 | 8 | 197 | - | **205** | 647 | mixed |
| `app/staff` inline (3 pages) | 3 | - | 11 | - | **11** | 33 | staff |
| `src/ui/chip.tsx` (shared) | 1 | - | - | 1 | **1** | 1 | all hosts |

By surface: public host 9 files / 245 messages (7 locales, except alerts: 2); client host 24 files / 914 (3 locales, files and
privacy 2); staff-only 25 files / 652 (3 locales, which is the required set). Required locale gap on the client host: at most
**3,795** message-translations (de nl el he for 905 messages, ru too for the bg+en modules), before the client/staff key split.

### 2.4 Top 25 files by uncatalogued messages (78.9 % of the 1,812)

| # | File | Msgs | Lits | Locales | # | File | Msgs | Lits | Locales |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `features/cases/copy.ts` | 121 | 344 | bg en ru | 14 | `features/cases/owner-preview-copy.ts` | 43 | 129 | bg en ru |
| 2 | `features/discovery/copy.ts` | 111 | 777 | all 7 | 15 | `features/inventory/evidence-copy.ts` | 42 | 126 | bg en ru |
| 3 | `features/work/copy.ts` | 103 | 309 | bg en ru | 16 | `features/cases/email-copy.ts` | 41 | 123 | bg en ru |
| 4 | `features/identity/copy.ts` | 102 | 304 | bg en ru | 17 | `features/key-custody/copy.ts` | 36 | 108 | bg en ru |
| 5 | `features/files/copy.ts` | 98 | 196 | bg en | 18 | `features/document-requests/copy.ts` | 34 | 102 | bg en ru |
| 6 | `features/inventory/copy.ts` | 94 | 282 | bg en ru | 19 | `features/inbound/copy.ts` | 33 | 99 | bg en ru |
| 7 | `features/privacy/copy.ts` | 85 | 170 | bg en | 20 | `features/complaints/copy.ts` | 32 | 96 | bg en ru |
| 8 | `features/compliance/screens.tsx` | 72 | 212 | bg en ru | 21 | `features/inbound/attachment-copy.ts` | 32 | 96 | bg en ru |
| 9 | `features/proposals/copy.ts` | 56 | 144 | bg en ru | 22 | `features/ai/entry-copy.ts` | 27 | 81 | bg en ru |
| 10 | `features/ai/copy.ts` | 55 | 165 | bg en ru | 23 | `features/discovery/inquiry-review-copy.ts` | 27 | 189 | all 7 |
| 11 | `features/case-access/copy.ts` | 46 | 138 | bg en ru | 24 | `features/subscriptions/copy.ts` | 27 | 81 | bg en ru |
| 12 | `features/content/copy.ts` | 44 | 132 | bg en ru | 25 | `features/identity/management-copy.ts` | 26 | 78 | bg en ru |
| 13 | `features/cases/lifecycle-copy.ts` | 43 | 89 | bg en ru | | | | | |

### 2.5 Defects found while measuring (they shape the plan)

1. **English leaks into bg and ru.** `bg: Copy = { ...en, ... }` spreads (10 modules) hide untranslated keys from the compiler:
   `cases/copy.ts` 9 bg / 10 ru, `cases/lifecycle-copy.ts` 20 / 20, `proposals/copy.ts` 12 / 12 (41 bg, 42 ru in total, e.g.
   proposal `expiredNotice`, `reverifyNotice`, `responseNote` on a client page).
2. **Client host is not seven-language.** de/nl/el/he clients see English on 23 of the 24 client-host files; `files` and `privacy` also leave ru in English.
3. **Search alerts force an LTR island.** Because only bg/en copy exists, `searchAlertCopyLocale` (5 consumer files, 17 uses) sets
   `lang="bg|en"` and `dir="ltr"` on the page for the other five locales, Hebrew included.
4. **A catalog approval would cover about 7 % of the interface** (129 of 1,941 messages): `_status.json` cannot gate TS copy.
5. `src/server/errors.ts` holds 26 English-only "safe user messages"; four staff action sites pass `error.message` to the UI.
6. 23 inline `Intl` sites and 32 `m²` literals ignore the locale (Hebrew should not show `m²`).

### 2.6 Listed separately (not in the counts)

| Group | Items | Constraint or note |
|---|---|---|
| **SEO / metadata (frozen)** | 28 route files export `generateMetadata` (16 public-host files) or `metadata` (11: 4 public, 4 client, 3 staff, mostly noindex) plus `global-not-found`; `src/server/seo/{public-metadata,public-pages}.ts`, `src/i18n/{seo,structured-data}.ts`, `app/{sitemap,robots}.ts`, `app/llms.txt/route.ts` (1,131 lines; 24 hard-coded strings) | `public-metadata.ts` imports `discoveryCopy`, `compareCopy`, `intentCopy`, `searchAlertCopy`: keep those exports, signatures and returned strings byte-identical |
| Server-originated user text | `server/jobs/resend.ts` auth emails (5 messages, bg/ru/en: de/nl/el/he get English sign-in and invitation mail); `server/subscriptions/template.ts` digest (4 x 7 locales); `server/privacy/preferences.ts` (2, bg/en); `server/inquiries/notifications.ts` (English staff notice); `server/errors.ts` (26, English) | Phase 4 |
| Dev-only specimen | `src/ui/specimen/**`, `src/ui/form/specimen-*` (11 files, 272 messages en/bg/he, `ENABLE_DESIGN_SPECIMEN=1`) | leave, or delete |
| Not copy | `server/ai/intent.ts` multilingual query vocabulary; locale endonyms in `i18n/config.ts`; tests, seeds, `db/` | allow-list |

## 3. Plan

### 3.1 Target architecture (one choice)

**Move all translatable UI text into the existing JSON catalogs, one namespace per feature, and read it through thin typed
accessors that keep today's function names, signatures and plain-object results.** `discoveryCopy(locale)`, `caseCopy(locale)` and
the rest become wrappers over static JSON imports (`import bg from ".../bg/cases.json"` x 7, or x 3 for staff); the result type is
`Record<Locale, typeof bg>`, so key parity is also a compile error. next-intl stays for the shells.

Why this fits the codebase:
1. Governance already lives on catalogs (`_status.json`, `catalogReviews`, `localePolicy`, `messages.test.ts`). TS modules sit
   outside all of it, so keeping them would need a second review mechanism or leave 93 % of the interface ungated.
2. TS parity is weak and varies: spread fallbacks, arity-only `s()`, positional tuples, untyped ternaries. Four techniques would
   need four checkers; JSON needs one and already has placeholder, plural, ICU and non-empty checks.
3. Reviewers and Butler need one file per locale with stable keys and diffs; 7-column rows and `s()` calls interleave languages.
4. No call-site churn and the same strings: strings already reach client components as props, `discoveryCopy` already returns a
   flat object, and the four frozen SEO consumers keep working. Bundle size is neutral (about 380 KB of copy source is already in
   the server bundle). Optional later step per feature: call sites move to `t()`; not required.

Rejected: "keep typed copy modules and add a parity check". Cheaper on day one, but it needs a new `defineCopy()` and a rewrite of
all four techniques anyway, has no place for review status or content hashes, and the approval gate stays blind to 93 %.

Design rules. Namespaces: `messages/<locale>/<feature>.json` (client+public) and `messages/staff/<locale>/<feature>.json`;
shared modules (`cases`, `work`, `identity`, `files`, `privacy`) are split by audience using a call-site key-usage script.
Each namespace declares its locales in `src/i18n/messages.ts`; `messages.test.ts` enforces parity over the declared set, and a
namespace used by the client host must declare all 7 before Phase 2 closes. Missing locale at runtime: `en` plus an explicit
`copyLocale(ns, locale)` so the page sets `lang` on the island (replaces `searchAlertCopyLocale`); dev and test throw.

### 3.2 Phases, order and effort

Order: public first (the only indexable surface, where the AGENTS.md rule bites; already 7 locales, so it proves the pipeline
with 125 new drafts), then client (largest gap), then staff (already at its required coverage; mechanical), then server text.

| Phase | Scope | Copy sources (files) | Messages | New JSON files | New drafts | Other fixes | Call-site files |
|---|---|---|---|---|---|---|---|
| 0 Foundation | accessor `src/i18n/copy.ts`, guard test + baseline, Biome rule, status hash, extract/export scripts, glossary file | 8 infra | 0 | 1 | 0 | `ui/chip.tsx` "Remove"; `format.ts` unit by locale; 32 `m²` sites | 2 |
| 1 Public buyer journey: home, catalogue, detail, inquiry + receipt, saved, compare, alerts, consent | `discovery/*` (8), `tracking/copy.ts` | 9 | 245 | about 70 (10 ns x 7) | **125** (`search-alert` to 5 locales) | brand "MS Realty" in `(site)/page.tsx`, `m²` in `comparison.tsx` and `intent/page.tsx`, remove 5 `searchAlertCopyLocale` islands | 8 |
| 2 Client workspace (C01-C13, C17-C18) | 2a access+identity `identity/copy`, `private-page-guard`; 2b overview/messages `cases/*`, `work/*`, `case-access`; 2c `files`, `document-requests`; 2d `proposals`, `privacy`, `key-custody`, `appointments/host` | 24 | 914 | about 70-110 (audience split) | **up to 3,795**, incl. the 41/42 English keys in bg/ru | 9 hard-coded strings in `cases/screens`, `owner-preview-screen`, `cases/actions`; internal-term glossary (K-9) | 3 |
| 3 Staff (O01-O33) | `inventory/*`, `ai/*`, `compliance/screens`, `inbound/*`, `content`, `complaints`, `subscriptions`, `offboarding`, `absence`, `identity` staff parts, 3 app pages | 25 | 652 | about 35 (11 ns x 3) | 0 | 3 hard-coded ("Queue worker:", "България", "Ελλάδα") | 2 |
| 4 Server-originated + formatters | auth emails, alert digest, privacy prefs, `errors.ts` (26 -> catalog by `code`), staff notice; 23 Intl sites -> `format.ts` (+ list and relative-time) | 8 server + 17 UI | 33 | about 14 | about 190 | `en-GB` fallbacks removed | 2 + 17 |

After Phase 3 the baseline is empty: delete it and make the guard absolute. Effort counts are exact for messages and files
(§2); JSON file counts and the Phase 2 draft count are bounds until the audience-split script reports.

### 3.3 CI guard

`src/i18n/copy-guard.test.ts` (unit project, so it runs inside `make check`; TypeScript is already a devDependency):
- **R1** locale-named object, array or property (`bg|en|ru|de|nl|el|he`) holding strings; **R2** call with 2+ string arguments in
  2+ scripts (`s(bg,ru,en)`); **R3** string tuple of 2, 3 or 7 elements in 2+ scripts; **R4** `locale === "xx"` choosing between
  strings or objects; **R5** JSX text with a letter, or prose in `aria-label`, `title`, `placeholder`, `alt`, `label`, `hint`,
  `description`; **R6** string values of `label|title|message|error|body|text` in `*.tsx` and `actions.ts`; **R7** (from Phase 4)
  `new Intl.*` or `toLocaleString` outside `format.ts`; R1-R4 and R6 extend to `src/server/**` in Phase 4.
- **Ratchet baseline** `src/i18n/copy-baseline.json` (file -> max hits), seeded with today's 59 files. Fail when a new file hits,
  a count rises, or a file reaches zero but stays listed. Allow-list `src/i18n/copy-invariants.json` for brand, units, zone.
- **Catalog quality**, added to `messages.test.ts`: value identical to `bg`/`en` outside a reviewed cognate list; script check
  (`ru`/`bg` Cyrillic, `el` Greek, `he` Hebrew); length at most 1.4x the `bg` source for label namespaces; placeholders `{price}`,
  `{area}`, `{reference}`, URLs and digits unchanged; no value pairing "Sandanski" with sea or beach words.
- **Status integrity**: `approved` requires `reviewer`, `reviewedAt`, `reviewedCommit` and a `contentHash` of that locale's files;
  any later edit fails the test until re-review. While the baseline lists a file reachable from `app/public`, the test asserts
  `indexableLocales()` equals `["bg"]`.
- **Biome** (editor feedback): `style/noJsxLiterals` with `ignoreProps: true` and `allowedStrings` `[":","·",",",".","—","(",")","/"]`;
  an `overrides` block switches it off for baseline files and shrinks with the baseline. Fix on the way: the typographic quotes
  `“…”` (`properties/intent/page.tsx:167`) and `→` (3 sites) are locale- and direction-specific.
- **Golden master** (temporary, per migrated module): old output equals new accessor output for every locale it covered. This
  keeps strings and property facts unchanged; delete the test after the phase merges.

### 3.4 Hebrew and RTL

Already good: zero physical Tailwind utilities (`ml-`, `pr-`, `left-`, `text-left`...) against 60 logical ones; `<html lang dir>` per
locale on public and client; 98 isolation sites (`Ltr`, `Isolate`, `bdi`); `PriceDisplay` isolates money; icons mirror with
`rtl:-scale-x-100`. To do:
- **Isolation by default.** Add `fillIsolated(template, values)` next to `fill()`: values for `reference|phone|email|url|price|area`
  keys are wrapped in `bdi dir="ltr"` (JSX) or `isolateText` (titles, `aria-label`). Wrap `formatExactArea` in `listing-card.tsx`,
  `search-alert-criteria.tsx`, `inquiry-selection-context.tsx`; phone `+359 ...` and references as LTR runs; names and addresses
  `dir="auto"`; email, phone and URL inputs already carry `dir="ltr"` at three sites (inquiry contact, client access, staff
  manage), so make it the `TextField` default for `type=email|tel|url` and add a test.
- **Units and numerals.** `formatArea`/`formatExactArea` take the unit from a per-locale table (he `מ״ר`, ru `м²`, others `m²`),
  pending reviewer sign-off. Pin Latin digits for `he-IL` (`-u-nu-latn`) so ICU defaults cannot change numerals; money is isolated
  whole and keeps the stored currency.
- **Direction and `lang` of parts.** Remove the forced `dir="ltr"` islands once alerts have all 7 locales; keep `lang` on BG excerpts
  shown in other locales; replace text arrows with start/end icons; `app/globals.css:25` map attribution `right: 0` becomes
  `inset-inline-end: 0`.
- **Content rules.** Hebrew copy uses plural imperatives; reviewers check gender and the plural categories already enforced.
  Mixed strings (Hebrew sentence + Cyrillic name + `+359` + Latin reference + currency) get one fixture, per ux-spec §19.2.

### 3.5 Translation workflow

| Step | Actor | Output | Gate |
|---|---|---|---|
| 1 Source | developer or editor | change in `messages/bg/*.json` (+ `en` reference) | `messages.test.ts` lists locales still missing the key |
| 2 Export | `scripts/i18n-export.mjs --locale de --since <reviewedCommit>` | keys changed since the last approval, with `bg`, `en`, screen context, length limit, glossary hits | none |
| 3 Draft | **Butler** (draft only) | patch to `messages/<locale>/*.json` on a branch; never edits `_status.json`, never merges | machine checks in §3.3 |
| 4 Language review | named translation reviewer for that locale (`translation.review`, locale-scoped) | `_status.json` entry: `approved`, reviewer, date, `reviewedCommit`, `contentHash` | status-integrity test |
| 5 Claims review | `claim.approve` holder, only for copy tagged as legal, tax or process claims (proposals, compliance, privacy, consent, auth emails) | separate `legal_process_claim` approval | language approval never implies it |
| 6 Indexability | manager (`settings.manage`) | `locale_indexability` approval per locale | `localePolicy` needs 4 **and** 6; Butler lacks the capability |
| 7 Release | humans, ordinary PR and `ci / gate` | merge | launch gates in `production/data/launch-readiness.json` |

Before Phase 2 drafting starts, `messages/glossary.json` fixes the terms per locale (Butler, case/"Случай" vs "Дело", brief, interest,
reference, viewing) and humans review it; Butler drafts and CI check against it. Butler never marks anything reviewed or indexable.

### 3.6 Acceptance checks per phase

| Phase | Checks |
|---|---|
| 0 | `make check` green with the baseline equal to the measured 59 files / 1,812 messages; each of R1-R7 fires on a synthetic fixture; status-hash test; no change to rendered output (`e2e`, `test:visual` unchanged) |
| 1 | Golden master on 9 modules x 7 locales (1,554 literals) equal, alerts excepted; `git diff` empty for `src/server/seo/**`, `src/i18n/{seo,structured-data}.ts` and no diff inside any `generateMetadata` or `metadata` block; `seo.test.ts` and `structured-data.test.ts` untouched and green; no `app/public`-reachable file in the baseline; Playwright `/he` on home, `properties`, a detail page, `inquire`, `requests/...`, `saved`, `compare`, `search-alerts`: `html[lang=he][dir=rtl]`, no horizontal scroll at 320 and 390, money, area, reference, phone inside `bdi`, axe 0, `test:visual` baselines for `he` |
| 2 | Audience-split report (keys per module: client vs staff) attached; golden master for bg/en/ru; the 41/42 English-in-bg/ru keys closed and reviewed; parity and script checks for 7 locales on client namespaces; `/he` and `/de` happy path through `case-access`, `work`, document and proposal specs, axe 0; auth email renders subject and body for 7 locales; internal terms match the glossary |
| 3 | Golden master; staff parity bg/en/ru; `workspace-navigation.spec.ts` unchanged; baseline empty, then deleted and the guard made absolute |
| 4 | R7 and server rules clean; `errors.ts` maps `code` to a catalog message in 3 staff locales and 7 client locales; email and digest render tests x 7; no `en-GB` fallback; `grep` shows 0 inline `Intl` outside `format.ts` |

### 3.7 Decisions needed from the owner

1. Named translation reviewer per locale (ru, de, nl, el, he, and a source pass for bg/en); the repo records none today.
2. Whether the `bg` source needs its own editorial review, since `bg` is indexable with an unreviewed catalog.
3. Unit symbol for area per locale (Hebrew `מ״ר`) and cognate allow-list sign-off.
4. Which copy counts as a legal or process claim (needs `claim.approve`).
5. Whether the dev specimen is kept; if kept it stays outside the guard.
