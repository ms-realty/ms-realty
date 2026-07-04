# MS Realty Locale Registry

`registry.json` is the production contract for universal language coverage.

Rules:

- Public website locales are dynamic and admin-managed.
- Only `public_enabled: true` and `indexable: true` locales generate public
  indexable pages, hreflang entries, and localized sitemap URLs.
- Hermes Agent may create translation drafts for any enabled locale, but cannot
  publish or mark content indexable.
- BG is the default source locale.
- Admin CMS/CRM UI is available in exactly BG, RU, and EN for the first
  production implementation.
- Greek (`el`) and Hebrew for Israel (`he`) are seeded as public website
  locales. Hebrew is RTL and must pass layout QA before launch.
- French (`fr`) is included as a disabled example for the fallback/request flow.

Locale-prefixed URLs are the standard:

```text
/bg/imoti/ms-987
/en/properties/ms-987
/el/akinita/ms-987
/he/properties/ms-987
/he/sell
```

Do not add an indexable localized page unless the translation is reviewed and
approved.
