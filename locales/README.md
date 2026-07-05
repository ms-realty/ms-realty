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
- `required_admin_locales` locks the admin CRM/CMS shell to BG, RU, and EN.
- `required_public_locales` locks the first public website set to BG, EN, DE,
  NL, RU, Greek (`el`), and Hebrew for Israel (`he`).
- `website_language_coverage` explicitly maps Greece to Greek `/el/` and
  Israel to Hebrew `/he/`. Hebrew is RTL and must pass layout QA before launch.
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
