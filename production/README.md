# MS Realty Production Foundation

This folder contains the first executable production contracts for the future
Next.js/Payload application. It is deliberately dependency-free for this slice:
the app framework can be added once these rules are stable.

What it proves now:

- Dynamic approved locale registry.
- Locale-prefixed public listing routes.
- Hreflang generation only for approved/indexable translations.
- Hermes Agent draft-only translation guardrails.
- Translation stale-state rules.
- CRM lead language routing into BG/RU/EN admin queues.
- Search fixtures carry locale/indexability metadata.
- Normalized migration records from the crawl CSVs with launch-gate checks.

Run:

```bash
npm run check
```

The next production slice can consume these contracts from a Next.js App Router
public app and Payload CMS collections without re-deciding URL, locale, AI, or
lead-language policy.
