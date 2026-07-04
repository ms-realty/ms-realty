---
name: ms-realty-design
description: Use this skill to generate well-branded interfaces and assets for MS Realty, a multilingual (BG/EN/DE/NL/RU) real-estate agency for property in Bulgaria and nearby Greece — either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping property search, listings, resort browsing and contact flows.
user-invocable: true
---

Read the `readme.md` file within this skill first — it is the full design guide (voice & tone, color, type, spacing, imagery, iconography) and the manifest of everything available. Then explore the other files.

- **Tokens:** `styles.css` @imports the `tokens/*.css` foundation (colors, typography, spacing, radius, shadows, motion, `.mk-photo` imagery, fonts). Link `styles.css` and use the semantic aliases (`--brand`, `--accent`, `--surface`, `--text-body`, `--price`, `--border`).
- **Components:** `components/<group>/` (actions, forms, display, feedback, data, people, navigation, general). Each has a `.d.ts` (props) and `.prompt.md` (what/when + usage). They read tokens via CSS custom properties. Import from the compiled bundle: `const { Button, PropertyCard, Modal, AgentCard } = window.MaklerRealtyDesignSystem_9b7f1e`.
- **UI kits:** `ui_kits/website/` — an interactive recreation of the MS website (home → search → listing → book a viewing); `ui_kits/crm/` — the Agent CRM back office (dashboard, pipeline, contacts, listings, calendar, reports). Copy screens from either.
- **Templates:** `templates/<slug>/` — copy-ready `.dc.html` starting points: property-landing, search-results, listing-detail, contact, agents (team page), client-deck (16:9 presentation).
- **Foundations:** `guidelines/*.html` — specimen cards for color, type, spacing, effects and brand.

If creating **visual artifacts** (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on **production code**, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without other guidance, ask what they want to build or design, ask a few focused questions (surface, audience, languages, variations), and act as an expert designer who outputs HTML artifacts _or_ production code depending on the need.

**Know the substitutions** (see readme.md “Caveats”): the fonts are Google-Fonts stand-ins and photography is represented by `.mk-photo` placeholder tones — pass a real image URL to override. The real **logo is embedded** in the `Logo` component (use `variant="reversed"` on dark). Flag the font/photo substitutions and ask for licensed fonts / a photo library when the work would benefit.
