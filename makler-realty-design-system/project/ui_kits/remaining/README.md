# Remaining Screen Handoff

Open `index.html` to review the first local screen pack that completes the
crawl-first migration slice without starting a new platform build.

Included screens:

- Mobile search.
- Listing detail.
- Sell your property.
- Broker lead inbox.
- Property editor with 360 tour CMS field.
- Dynamic approved locale registry preview.
- Public website coverage for Greek and Hebrew for Israel.
- Admin CMS/CRM language coverage limited to BG, RU, and EN.

The page reuses the existing design-system CSS and data fixtures:

- `../../styles.css`
- `../website/data.js`
- `../crm/crm-data.js`

It keeps MS Realty as the visible public brand while leaving the internal
Makler namespace intact for compatibility with the current static bundle.

Language behavior in this prototype mirrors `locales/registry.json`: public
website locales can grow without code changes, but only approved/indexable
translations are shown as public routes. Hermes draft translations remain
review-only until a human approves them.
