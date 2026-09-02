# Finish the MS Realty workspace and public-site rebuild

You are picking up a redesign that is half-landed. A design canvas exists and is
agreed; two increments are in production; the rest is not built. Your job is to
finish it. Read this whole brief before touching anything — several of the
constraints below have already cost a day each when someone learned them the
hard way.

---

## Where things are

| What | Where |
|---|---|
| Repository (work here, do not `cd` to the main checkout) | `/Users/ivan/Code/MS-Realty/.claude/worktrees/admin-panel-redesign-56f213` |
| Branch | `claude/admin-panel-redesign-56f213` |
| The agreed design, 50 artboards | `.claude/handoff-admin-redesign/canvas/*.dc.html` |
| Canvas sources (regenerate artboards from these, never edit the `.dc.html` by hand) | `.claude/handoff-admin-redesign/canvas/build/*.mjs`, `shell.mjs`, `public-shell.mjs`, `tokens.mjs`, `icons.mjs` |
| Class-collision linter for the canvas | `.claude/handoff-admin-redesign/canvas/lint.mjs` |
| Capability inventory — 349 gaps, per object, each with the file/route that proves the operation exists | `.claude/handoff-admin-redesign/capability-inventory-349-gaps.json` |
| Artboard audit — confirmed defects with evidence | `.claude/handoff-admin-redesign/artboard-audit-findings.json` |
| Product intent, brand, anti-references, a11y target | `PRODUCT.md` |
| Domain vocabulary (what "published", "archived", "terminal decision" mean) | `CONTEXT.md` |
| Agent rules and the launch boundary | `AGENTS.md` |
| The single canonical doc | `SOURCE_OF_TRUTH.md` |

The design canvas is the specification. Where the canvas and this brief disagree,
the canvas wins on layout and copy; this brief wins on constraints.

---

## What is already done — do not redo it

Two commits are on the branch:

- `ba7b839a` — three measured WCAG failures fixed in `production/lib/ui/adapter-admin.css`.
  `--text-subtle` carried real text at 2.04–2.40:1 and now aliases to the muted
  value; a text field's border was 1.66:1 against 1.4.11's 3:1 floor and now
  takes `ink-400`. Pinned by `production/test/admin-contrast.test.mjs`, which
  resolves each role from the built stylesheet rather than a hardcoded guess.
- `309ccce1` — the operator rail is flat: 19 destinations at one depth in five
  groups, no `<details>`. Pinned by `production/test/admin-navigation-reach.test.mjs`,
  which renders every admin surface and asserts the rail is identical on each.

Both tests were verified in both directions — reverting the change fails them.
Keep that standard: **a test you add must be shown to fail when the thing it
guards is broken.** Say so in the commit message.

---

## Hard constraints

These are not style preferences. Violating any of them breaks the product or the
build.

**Testing and the build**

- `npm run check` = `audit && test && validate && next:build && next:smoke`. The
  full `test` step takes ~20 minutes and two suites — `hermes-mcp-server` and
  `payload-migration-boot` — fail under parallel contention but pass in
  isolation. Verify a suspected failure in isolation before calling it a
  regression.
- 38 test files pin rendered HTML with exact regexes. A redesign means
  **rewriting those contracts on purpose**, replacing each with the stronger
  assertion it was standing in for. Never loosen a regex to make it pass.
- `/admin` and `/admin/team` need Payload on Postgres. Without a database they
  do not merely 500 — they can reject at process level and fail the whole test
  file. Name them explicitly when you skip them; do not catch broadly.
- After editing anything under `production/lib/ui/`, run `npm run design:build`.
  Every run writes a **new hashed logo pair** into `public/vendor/`. Keep only
  the hash `production/lib/ui/design-assets.mjs` references and delete the rest
  before committing. Do not delete the older committed hashes:
  `production/test/operator-plugin.test.mjs` hardcodes
  `ms-realty-logo-b50d7b4420ed.png`.
- `production/lib/ui/client.mjs` holds browser scripts as template literals, so
  `node --check` validates the module but not the script inside. After touching
  it run:
  ```
  node --input-type=module -e 'const {PUBLIC_APP_JS,ADMIN_APP_JS}=await import("./production/lib/ui/client.mjs"); for (const [n,s] of [["PUBLIC",PUBLIC_APP_JS],["ADMIN",ADMIN_APP_JS]]) { try { new Function(s); console.log(n,"ok") } catch(e){ console.log(n,"BROKEN",e.message) } }'
  ```
- A dev server writes ledger state into committed files under `production/data/`
  unless every `MS_REALTY_*_PATH` env var points elsewhere. A test fails if
  `workspace-settings.json` is not pristine.

**Product rules that the interface must not offer a way around**

- Hermes may draft and check. Five actions are refused in code
  (`MUTATING_ACTIONS` in `production/lib/hermes.mjs`): publish, send a message,
  mark a translation indexable, change a price, change a redirect. Never draw a
  control that would ask it to do one.
- Sandanski is never described as a sea, beach, coast or seaside destination.
- A listing goes public only after facts, media and freeze-active approval. A
  seeded workspace showing zero public listings is the boundary working, not a
  bug. Do not weaken it to see data — render from crawl fixtures instead
  (`loadListings()` in `production/lib/content.mjs`, 165 listings).
- Every legacy URL needs one terminal outcome (200, 301 or 410). 419 of 457 are
  decided. Nothing may broaden a decision into a fallback for other URLs.
- A new audit action must be registered before it can be written, or the deploy
  dies after a green unit test.
- Completing a document checklist item requires a note or an internal reference
  **and** a named human confirmation.
- Approving a media asset requires a reviewer name and explicit confirmation
  (`createMediaReview` throws without both). The canvas currently draws a
  one-click Approve that cannot satisfy this — fix the design, not the server.
- Admin locales are BG, RU, EN. The public site carries seven, and Hebrew is a
  full right-to-left build, not a stylesheet flip.
- WCAG 2.2 AA is the floor, and contrast is arithmetic. Compute it; do not
  eyeball it.

---

## The work, in order

Do these in sequence. Each one lands as its own commit with its tests passing.

### 1. Numeric filters — asked for twice, still missing

The public search offers preset dropdowns only. A buyer must be able to type a
price range. Build, on `PublicSearch` and its production renderer: min/max price
with free numeric entry, min/max area, room count, plot size, and the contents of
the "More filters" panel. Include the states — invalid range, min above max, no
results for the entered range, and the filter set reflected in the URL so it can
be shared and saved.

Then do the same for every admin list that has a filter bar. The saved-view
endpoints already exist: `GET/POST/DELETE /api/admin/views`.

### 2. Locale management — asked for twice, still missing

There is no screen for adding or removing a language across all listings.
`GET/POST /api/admin/locales` and `production/lib/locale-rollout.mjs` exist.
Build it: the seven public locales with their rollout state, coverage across
listings and pages, what adding one commits the agency to (a human translation
of every published listing before any page in that language can be indexed), and
what removing one does to already-indexed URLs. Put it under Website, and reach
it from Settings too.

### 3. Hermes assist on every editable field

`shell.mjs` defines the pattern (`.assist`, `.assist-menu`, `.drafted`) but it is
placed on almost nothing. Every editable value — listing description, SEO title
and meta, page block copy, alt text, caption, reply, document field, area guide —
gets the same one-click draft with the same approval boundary. The affordance is
identical everywhere; what differs is the source it draws from, which the panel
names.

### 4. The three Foundations self-contradictions

Confirmed with evidence in `artboard-audit-findings.json`:

- The spacing panel says "a value outside the seven is a defect" and then names
  9, 13 and 26 as canonical paddings. Either widen the declared scale or change
  `shell.mjs` to match it.
- "Nine sizes, no tenth" — the two figures on that panel name different nines,
  and fifteen distinct sizes are in use.
- Icons are documented as "drawn at 16–20px"; 82% of the icons in `Components`
  are outside that range, and the shared topbar breaches it too.

### 5. The 349 capability gaps

`capability-inventory-349-gaps.json` lists them per object, each with the file or
route that proves the operation exists and whether the design offers it. Work in
this order, largest first: documents (88), listings (80), workspace and settings
(78), website pages (53), media (50).

Three of the eight objects were never scanned — leads, translations, contacts.
Scan them the same way before building, or you will miss the same proportion
again.

Four capabilities need backend that does not exist. Design them, then build them:

| Gap | What is missing |
|---|---|
| Website pages are not in the CMS | Home, search, seller, contact and location copy is rendered from code. Needs `pages`, `page_blocks`, `navigation`, `forms` collections. Large. |
| There is no document object | `document-checklists.mjs` records outcomes only. Nothing creates, versions, renders, sends or signs. Large. |
| No integration aggregator | `operator-provider-catalog.mjs` hardcodes ten providers. Needs a broker layer and a connection record. Medium. |
| Tasks have no entity | Work is implied by leads, viewings and cases. A broker cannot see one list of what they owe. Medium. |

### 6. Production parity, screen by screen

The canvas is 50 artboards. Production is 23,342 lines of admin rendering
(`react-admin-site.mjs`, `app-admin-adapter.mjs`, `ui/client.mjs`), 6,921 lines
of public site (`public-site.mjs`) and 256 KB of adapter CSS.

Do not attempt this in one pass. One screen per commit, each with its markup
contract rewritten deliberately and its tests green. Start with the screens whose
defects are worst in the current build: Today, Lead inbox, Settings, Listings.

The specific defects the redesign exists to fix, so you can tell when a screen is
done:

- Panels inside panels, and a page header whose subtitle repeats the panel below it.
- KPI tile strips whose numbers cannot be clicked. Counts belong in the filter.
- Full-width primary buttons in a 1150px column.
- Runtime state leaking into data fields — "Workspace scope was not provided by
  this runtime" rendered as the value of an Access field, and bare env-var names
  shown to a broker.
- Settings rendering a section picker and every section inline beneath it.
- Rows around 100px tall where 56px carries the same information.
- Cards titled by record type with a raw UUID beneath, instead of a person and a
  property.
- Real overlap and mid-word wrapping in the two tables at the foot of
  `/admin/leads`.

---

## How to verify a screen is right

1. Render it and look at it. `npm start` needs
   `MS_REALTY_ADMIN_TOKEN` and admin pages need an `Authorization: Bearer` header
   in the browser — a 20-line local proxy that injects it works. Do not rewrite
   the Host header in that proxy: every browser POST then fails
   `sameOriginWriteRejection` with an error that looks like an application bug.
2. Check it at 1440, 1280, 768 and 390 wide, and at 200% zoom.
3. Check it with the longest real string, an empty list, and a failed request.
4. Compute the contrast of anything you coloured.
5. Run the suites for the screens you touched, then `npm run check` before the
   final commit of a series.

## How to report

After each commit, say what changed, what you verified and how, and what you
chose not to do. If a gate is blocked, finish everything else and say plainly
what you left and why. Do not describe a screen as done because it renders —
describe it as done when its states, its keyboard path and its numbers hold up.
