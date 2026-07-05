# MS Realty — Design System

A design system for **MS Realty** (full name *Makler Realty* — “makler real estate”), a **multilingual** real-estate agency based in **Sandanski, Bulgaria** (the “land of Spartacus”), serving local and international buyers in **Bulgarian, English, German, Dutch, Russian, Greek and Hebrew for Israel**. The admin CRM/CMS interface is limited to **Bulgarian, Russian and English**. It sells and rents the full property range — apartments, villas, houses, commercial and industrial space, hotels, agricultural land and luxury estates — across Sandanski and the wider region (**Bansko, Blagoevgrad and the Black Sea coast**). It powers the public website: property search, resort/category browsing, listing detail pages, and the contact / call-back flows that connect buyers to a local agent.

Everything a design agent needs to produce on-brand MS work: the CSS token foundation, reusable React components, foundation specimen cards for the Design System tab, and a full website UI kit.

---

## Sources & provenance

This system began from the brand brief and now also references the live company site, **[makler-realty.com](https://makler-realty.com)**:

> **MS Realty** (*Makler Realty*): a Sandanski-based, multilingual real-estate agency for property **sale and rent** — apartments through luxury estates — across Sandanski, Bansko, Blagoevgrad and the Black Sea coast. The public website starts with BG/EN/DE/NL/RU/EL/HE and can grow through the approved locale registry; the admin CRM/CMS starts with BG/RU/EN. The agency adds buying assistance, property transfers and relocation, with call-back, viewing and phone/Skype/form contact. The public experience: a real-estate website, property search, resort/category browsing, listing detail pages, and the contact/call flows for interested buyers. (Sample listings in the kits also include a few coastal / cross-border items for illustration.)

The brand is **MS Realty** (its live domain is `makler-realty.com`). The visual language, component inventory and website screens are an **original interpretation** — the live site is a light WordPress theme, so this is a from-scratch design, not a reconstruction of it. Substitutions flagged in **Caveats** below: **fonts** (Google Fonts stand-ins) and **photography** (CSS placeholder tones); **icons** use Lucide. The real **logo** is now **embedded locally** (red MS + charcoal REAL·TY, plus a reversed variant for dark surfaces), and the palette is anchored on the brand's **official colours** — Jasper `#DB3E3E`, Apple Valley `#ED8484`, Bauhaus `#3F3F3F`.

**Naming note.** Everything a user *sees* is **MS Realty**. The project/org title and the internal JS namespace (`MaklerRealtyDesignSystem_9b7f1e`) keep the original *Makler* name — the namespace is derived from the project title, which tooling won’t rename — so consumer code still imports `window.MaklerRealtyDesignSystem_9b7f1e`. Rename the project in the UI if you want that aligned too.

---

## The product

One product — the **public website** (`ui_kits/website/`). Core surfaces:

- **Home** — hero property search over the coast, browse-by-resort, featured listings, why-MS, sell CTA.
- **Search results** — filters (deal, price, beds, type, amenities), sortable listing rows, pagination.
- **Listing detail** — gallery, specs, description, features, what’s-nearby, a sticky agent panel, similar homes.
- **Contact / call flows** — a “Book a viewing” modal launched from a listing, and a full contact page with the three offices.

Focus locations: **St Vlas, Sunny Beach, Nesebar** (Burgas coast) · **Bansko** (Pirin) · **Sandanski** (Struma valley) · **Nafplio** (Peloponnese, Greece). The audience is largely **international buyers**, so every public website surface is **multilingual — Bulgarian, English, German, Dutch, Russian, Greek and Hebrew for Israel (BG / EN / DE / NL / RU / EL / HE)**, while internal CRM/CMS chrome is available in **BG / RU / EN**.

---

## Content fundamentals — voice & tone

**Vibe.** Warm, grounded, quietly confident. MS sounds like a knowledgeable local who happens to speak your language — not a hype-driven portal. Estate-agent-professional, never breathless.

**Person.** Speak to the reader as **“you”**; refer to the agency as **“we / our offices / our team.”** e.g. *“Find your place in Sandanski.”* · *“We speak your language.”* · *“Tell us what you’re after and we’ll take it from there.”*

**Casing.** **Sentence case** for headings, buttons and labels (*“Book a viewing”*, *“Browse by resort”*). Reserve ALL-CAPS for tiny eyebrows, status badges and field labels, always with wide letter-spacing. Never Title Case whole headlines.

**Spelling.** **British English** (*colour, organise, town-centre, metres*). Property size in **m²**. This matches the EU/Bulgarian context and the mostly-European buyer.

**Numbers & money.** Prices are **€ with thous-separators, no decimals** — `€245,000`, `€900/mo`. Specs are numerals with units — `68 m²`, `2 bed`, `1 bath`, `floor 4 / 8`. Reference codes are `MS-####`.

**Punctuation & length.** No exclamation marks. Headlines are short and often end with a full stop (*“Find your place in Sandanski.”*). Body copy is 1–2 plain sentences; describe the home and its real context — spa park, mountain, town centre, beach or border access only where true — not adjectives about “luxury lifestyle”.

**Emoji.** **Never.** Status and meaning come from icons and badges, not emoji.

**Multilingual.** Copy must survive translation between BG / EN / DE / NL / RU / EL / HE and future approved locales — keep sentences self-contained, avoid idioms and puns, never bake meaning into word order or into an icon alone, and preserve `dir="rtl"` behavior for Hebrew.

---

## Visual foundations

**Palette — the brand's official colours (red + charcoal), on a warm coast — pushed **monochrome**.** Five families plus semantic hues (`tokens/colors.css`), anchored on the three official brand colours — **Jasper** `#DB3E3E`, **Apple Valley** `#ED8484`, **Bauhaus** `#3F3F3F`:
- **Stone** — warm limestone & sand neutrals. Surfaces, text, borders. The canvas is `--stone-50` (`#FAF7F1`), a warm off-white, *not* pure white; cards are pure white to lift off it.
- **Ink** `--ink-*` — near-neutral **charcoal**, from the logo's “REAL·TY” wordmark; step **600 = official Bauhaus `#3F3F3F`**. The **brand** colour: header text, buttons, footer/bands, prices — and now also **links, rating stars and the buy/rent/new status chips**. `--brand` = `--ink-800`.
- **Brick** `--brick-*` — the logo **red** (pure-hue). Step **500 = official Jasper `#DB3E3E`**, **300 = Apple Valley `#ED8484`**. The lone **accent**, held back for just two jobs — the single highest-intent CTA (call / book) and the “price reduced” flag. `--accent` = `--brick-600` (a hair darker for AA on white).
- **Sea** `--sea-*` — deep marine green-blue. **Reserved / optional** — retired from default use in the monochrome push (the ramp stays for opt-in).
- **Sun** `--sun-*` — ochre gold. **Reserved / optional** — retired too; the ramp stays for opt-in.
- **Semantic**: success / warning / danger (error-red is shifted **cooler** than brand Brick so an alert never reads like the primary CTA), and listing-status pairs — `--for-sale-*`, `--for-rent-*` and `--new-*` are **charcoal tiers** (buy strong, rent quiet, new warm taupe); only `--reduced-*` carries the red.

Always reach for the **semantic aliases** (`--brand`, `--accent`, `--surface`, `--text-body`, `--price`, `--rating`, `--border`) in components — not the raw ramps.

**Typography** (`tokens/typography.css`).
- **Display — Source Serif 4.** Editorial serif for headlines, property names and **prices**. Warm and literary; multi-script (Latin/Cyrillic/Greek) with Noto Serif Hebrew fallback. Semibold, tight tracking, tight leading.
- **Sans — Commissioner.** Low-contrast humanist grotesque for all UI, body and labels. Full Latin/Cyrillic/Greek with Noto Sans Hebrew fallback — the same voice in Sofia, Bansko, Nafplio and Hebrew/Israel pages.
- **Mono — IBM Plex Mono.** Reference codes, m² specs, tabular data.
- Fixed UI ramp `--text-2xs`→`--text-5xl` (11→64px) plus fluid `--display-*` for hero type.

**Spacing & layout** (`tokens/spacing.css`). 4px base grid (`--space-*`). Centred containers to `--container-2xl` (1440px) with a fluid `--gutter`. Vertical rhythm via `--section-y`.

**Radius** (`tokens/radius.css`). Soft but architectural — **cards ~14px** (`--radius-card`), **controls ~8px** (`--radius-button`/`--radius-input`), chips/avatars fully round. Nothing is a pill unless it’s meant to be (badges, toggles).

**Elevation** (`tokens/shadows.css`). Soft, **warm-tinted** shadows built on `stone-950` (never cold black) — objects resting on sunlit paper. Low spread, generous blur. `--shadow-card` at rest → `--shadow-card-hover` on lift.

**Cards.** White surface, hairline `--border`, `--radius-card`, resting `--shadow-card`. Interactive cards **lift** (`translateY(-3px)` + stronger shadow) on hover. `PropertyCard` follows this exactly.

**Backgrounds & imagery.** Warm Stone canvas; occasional dark **Ink** bands (footer, sell CTA) for contrast. Imagery is **full-bleed coastal photography** — represented here by the `.mk-photo` placeholder tones (`tokens/media.css`): `sea, sky, sand, sunset, pine, night`, each a layered warm-light gradient with a soft sun glow and a bottom vignette so overlaid white text/controls always read. **No repeating patterns, no decorative blobs, no purple/AI gradients.** Imagery is warm and sunlit, never cold or high-contrast.

**Motion** (`tokens/motion.css`). Restrained and confident. Content **fades and lifts** gently; everything **eases out** (`--ease-out`) over `--dur-fast`/`--dur-base`. No bounces on UI chrome (spring is reserved for a favourited heart). Honours `prefers-reduced-motion`.

**Hover / press states.** Hover = a step-darker brand/accent, or a Stone `--surface-hover` wash on quiet controls; cards lift. Press = a step darker still, plus a tiny scale-down (buttons `scale(.99)`, icon buttons `scale(.94)`) — never a colour flip.

**Borders & focus.** Hairline `--border` (Stone-200) for dividers, `--border-strong` for inputs. Focus is a 3px **Brick** (red) ring (`--shadow-focus`); the red accent controls get a charcoal `--ring-accent`.

**Transparency & blur.** Used deliberately, not decoratively: the **translucent blurred header** over scrolling content, **glass** icon buttons and photo-count chips over photography, and the modal **scrim** (`--overlay`). Body backgrounds are always solid.

---

## Iconography

- **Set: [Lucide](https://lucide.dev) — a documented substitute** (no brand icon set was provided). Chosen for its clean, even **1.75px stroke** humanist line style, which matches the warm-but-precise brand, and for broad real-estate coverage.
- **Delivery.** In the HTML cards and UI kit, Lucide’s UMD build is loaded from CDN (`unpkg.com/lucide`) and the `Icon` component renders the named glyph as an inline SVG using `currentColor`. In production React, install `lucide-react` and swap the lookup — the `Icon` API stays the same.
- **Usage.** Icons inherit text colour via `currentColor`; default stroke 1.75, sizes 14–24px (16–20 in UI, up to 24 in feature/value tiles). Accent-coloured only for the location pin and search affordance. **No emoji. No Unicode-glyph icons.**
- **Common glyphs:** `house, building-2, map-pin, bed, bath, ruler, waves, mountain, trees, sun, key, heart, search, sliders-horizontal, phone, mail, calendar, camera, star, share-2, compass, languages, shield-check, file-check`.
- If you need a glyph Lucide lacks, pick the nearest Lucide match rather than mixing icon sets, and keep the 1.75px stroke.

---

## Components

Reusable React primitives (`components/<group>/`). Import from the compiled bundle: `const { Button } = window.MaklerRealtyDesignSystem_9b7f1e`. Each has a `.d.ts` (props + adherence) and a `.prompt.md` (what/when + usage).

**Actions** (`components/actions/`)
- **Button** — primary (Ink) · accent (Brick red) · secondary · ghost · subtle; sm/md/lg; icons, loading, `as`.
- **IconButton** — ghost / solid / outline / **glass** (over photography); square or round; active.

**Forms** (`components/forms/`)
- **Input** — labelled text field with lead/trail icon, hint, error, sizes.
- **Select** — styled native select with chevron, lead icon, options/placeholder.
- **Textarea** — multi-line enquiry/notes field; same label/hint/error anatomy as Input, optional counter.
- **RangeSlider** — dual-thumb price/area filter range; charcoal fill, formatted end values.
- **Checkbox** — with indeterminate.
- **Radio**.
- **Switch** — sm/md.
- **SearchBar** — the signature deal-toggle + location/type/price property-search bar (hero + results).

**Display** (`components/display/`)
- **Badge** — listing-status pill (for-sale / for-rent / new / reduced / featured / sold); tonal or solid.
- **Tag** — neutral feature / filter chip (amenities, specs, removable active filters).
- **Rating** — Sun-gold stars with fractional fill + review count.
- **Card** — generic surface (hairline / elevated / sunken / interactive).
- **PropertyCard** — the hero listing card (photo + badges + save + price + specs); vertical or horizontal.
- **Accordion** — expandable rows on hairline dividers: FAQs, buying-process steps, feature groups.

**Feedback** (`components/feedback/`)
- **Alert** — inline tonal notice (info charcoal / success / warning / danger-cool-red); dismiss + text actions.
- **Modal** — the “Book a viewing” dialog: scrim, serif title, footer action row; Escape/scrim close, scroll lock.
- **EmptyState** — centred zero-result state with icon circle and recovery actions.
- **Skeleton** — loading shimmer (text lines / rect / circle / photo), reduced-motion safe.

**Data** (`components/data/`) — *promoted from the CRM kit*
- **Stat** — KPI tile: serif value, tonal icon chip, trend pill.
- **DataTable** — sortable listing/lead table with uppercase stone header and cell helpers (primary/muted/mono/price).
- **Timeline** — vertical activity feed with icon circles on a hairline spine.

**People** (`components/people/`)
- **Avatar** / **AvatarGroup** — initials (Cyrillic-safe) or photo circles; soft tones, overlap stack.
- **AgentCard** — the agent contact panel (sticky beside a listing) and compact `row` tile; language chips + accent call CTA.

**Navigation** (`components/navigation/`)
- **Breadcrumb** — location trail for listing/resort pages.
- **Pagination** — search-results paging with ellipsis collapse.
- **Tabs** — charcoal-underline section tabs + segmented view toggle (Grid/List/Map).
- **LangSwitcher** — the approved public website language switcher (BG EN DE NL RU EL HE), globe + native-name popover with Hebrew RTL label support; `onDark` for the footer.

**General** (`components/general/`)
- **Icon** — Lucide glyph renderer (see Iconography).
- **Logo** — the MS Realty brand mark, **embedded** as a data URI (red MS + charcoal REALTY); `variant="reversed"` for dark surfaces.

*Intentional additions* beyond a generic component set, justified by the brief: **SearchBar**, **PropertyCard**, **Badge** (listing status), **Tag**, **Rating**, **RangeSlider**, **AgentCard**, **LangSwitcher** and **Breadcrumb/Pagination** are the vocabulary a property portal actually needs. Deliberately *not* built: a toast system (Alert placed in-flow covers the sites' needs — say the word if you want toasts).

---

## UI kits

- **`ui_kits/website/`** — the MS Realty **public website**. Interactive `index.html` (Home → Search → Listing → Book a viewing) composed from the components above. See `ui_kits/website/README.md` for the screen map and interaction flow.
- **`ui_kits/crm/`** — the MS Realty **Agent CRM** (back office). Interactive `index.html` (Dashboard → Leads pipeline → Lead detail → Contacts → Listings → Calendar → Reports). A dark **Ink** sidebar + light content split; adds CRM-specific building blocks (`DataTable`, `KanbanCard`, `StatTile`, `Timeline`, `TaskList`, `Sidebar`/`Topbar`) in `CrmKit.jsx`. See `ui_kits/crm/README.md`.

---

## Templates (consumer starting points)

Copy-ready screen starts under `templates/<slug>/`, each a Design Component (`.dc.html`) that loads the system via `ds-base.js` and mounts components with `<x-import>`. These are what a consuming project picks from the template picker — edit the copy/data in the logic class and go.

- **Property landing** (`templates/property-landing/`) — hero property search over a featured-listings grid.
- **Search results** (`templates/search-results/`) — sticky search bar, filter sidebar, listing rows, pagination.
- **Listing detail** (`templates/listing-detail/`) — gallery, spec strip, description, features, sticky agent panel, similar homes.
- **Contact** (`templates/contact/`) — the three offices + an enquiry form.
- **Team & offices** (`templates/agents/`) — agent grid with language chips, the “we speak your language” band, office strip.
- **Client deck** (`templates/client-deck/`) — branded 16:9 presentation (deck-stage shell): cover, agency intro, featured property, curated selection, buying process, next steps.

---

## Foundations (Design System tab)

`@dsCard`-tagged specimen cards render in the Design System tab, grouped **Colors · Type · Spacing · Effects · Brand · Components · Website · CRM**:
- **Colors** — Stone, Ink, Brick, Sea, Sun ramps; Surfaces; Text; Brand & functional aliases; Listing-status pairs.
- **Type** — Display (Source Serif), Body & UI (Commissioner), UI type scale, Mono (IBM Plex Mono).
- **Spacing** — spacing scale, corner radii, layout & containers.
- **Effects** — elevation, motion.
- **Brand** — photo tones, the embedded logo, voice & tone (do/don't copy).
- **Components / Website / CRM** — component group cards (actions, forms, display, feedback, data, people, navigation, accordion, modal, icons) and the app previews.

---

## File index

```
styles.css                 Consumer entry point — @imports only
tokens/
  colors.css  typography.css  spacing.css  radius.css
  shadows.css  motion.css  media.css (.mk-photo)  fonts.css  base.css
components/
  actions/    Button, IconButton
  forms/      Input, Select, Textarea, RangeSlider, Checkbox, Radio, Switch, SearchBar
  display/    Badge, Tag, Rating, Card, PropertyCard, Accordion
  feedback/   Alert, Modal, EmptyState, Skeleton
  data/       Stat, DataTable, Timeline
  people/     Avatar (+AvatarGroup), AgentCard
  navigation/ Breadcrumb, Pagination, Tabs, LangSwitcher
  general/    Icon, Logo
guidelines/   21 foundation specimen cards
ui_kits/
  website/  data.js + SiteChrome/HomePage/SearchResults/ListingDetail/ContactPanel + index.html
  crm/      crm-data.js + CrmKit + Dashboard/Pipeline/LeadDetail/Contacts/Listings/Calendar/Reports + index.html
templates/    property-landing · search-results · listing-detail · contact · agents · client-deck  (.dc.html starting points)
readme.md     this file      SKILL.md  Agent-Skills manifest
_ds_bundle.js / _ds_manifest.json / _adherence.oxlintrc.json  (generated — do not edit)
```

---

## Caveats — help me make this perfect

**Two open substitutions (fonts, photography) and a couple of choices:**

1. **Fonts are Google-Fonts stand-ins.** Source Serif 4 (display), Commissioner (sans), IBM Plex Mono, plus Noto Serif Hebrew / Noto Sans Hebrew fallbacks — chosen for **Latin + Cyrillic + Greek + Hebrew** coverage. **Do you have licensed brand fonts?** If so, drop the `.woff2` files into `assets/fonts/`, replace the `@import` in `tokens/fonts.css` with `@font-face` rules, and I’ll rewire it. If not, tell me the personality you want (more editorial? more modern-grotesque?) and I’ll re-pick.
2. **Logo — real MS Realty mark, now embedded.** ✅ The mark (172×88) was fetched from the live site and **embedded locally** as a data URI in the `Logo` component — originals saved at `assets/logo-ms-realty.png` plus a `-reversed` white-text variant for dark surfaces. It now renders **offline and in PPTX/PDF export**, everywhere including the dark footer. **If you have a vector (SVG) master**, drop it in and I’ll point `LOGO_SRC` at it for crisp scaling.
3. **No photography, so imagery is CSS placeholder “tones.”** `.mk-photo--sea/sky/sand/…` are warm coastal-light gradients standing in for real photos. `PropertyCard` and the gallery already accept a real `image` URL that overrides the tone. **Share a photo library** (or approve a stock direction) and I’ll swap them in.
4. **Colour direction — anchored on the official brand palette.** ✅ Confirmed against the brand's official colours and re-anchored exactly: **Jasper `#DB3E3E`** is the accent red (`--brick-500`), **Apple Valley `#ED8484`** its light tint (`--brick-300`), and **Bauhaus `#3F3F3F`** the brand charcoal (`--ink-600`). Ink (charcoal) is the brand workhorse, Brick (Jasper red) the sparing accent, over warm Stone — with Sea demoted to a supporting / “for sale” role, and error-red nudged cooler so it never reads like the CTA. If you'd rather push further (a louder red, or a more monochrome charcoal look) \u2014 done: the palette is now **pushed monochrome**. Charcoal carries the UI (links, rating stars, buy/rent/new chips) and red is reserved for just the call CTA and the reduced-price flag; gold and teal are retired to opt-in ramps. Easy to dial back toward coloured statuses if you want.
5. **Scope** — the system now covers the **public website** and the **Agent CRM** (back office). If there’s a **mobile app** or an **email/brochure** surface, tell me and I’ll add a UI kit for it. ✅ The reusable CRM primitives are now **promoted to formal DS components** — `Stat`, `DataTable`, `Timeline` (in `components/data/`) and `Avatar` (in `components/people/`) — generalised and token-clean. `KanbanCard` and `TaskList` stay kit-local on purpose (they're coupled to CRM lead data shapes); the CRM kit keeps its own local copies so nothing breaks.

**Tell me which of these to fix first and I’ll iterate.**
