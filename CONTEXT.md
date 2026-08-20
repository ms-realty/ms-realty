# Domain Context

## Catalog lifecycle

- **Active-at-freeze**: the legacy source displayed the offer when the approved launch freeze was captured. This is evidence of historical catalog state, not permission to publish.
- **Archived listing**: a legacy listing classified as review, hold, or source-unavailable. It is excluded from active search and may keep only a truthful preservation surface.
- **Published listing**: a listing whose facts, media, and publication have passed the independent public-inventory approval boundary.
- **Listing preservation surface**: a non-indexable terminal `200` page that preserves a listing URL and lifecycle state without publishing property claims, media, schema, or locale alternates.
- **Terminal legacy decision**: the approved outcome for one exact legacy URL: retained `200`, one-hop `301`, or `410`. It does not authorize a broad fallback for other URLs.

## Production lifecycle

- **Production-Ready**: the complete pre-cutover appliance has passed its source, catalog, public site, admin, search, lead, Payload/Postgres, media, deterministic-email, monitoring, rollback, recovery, custody, and owner-handoff acceptance portfolio on the temporary `workers.dev` host. It does not require canonical-domain Google, Yandex, or backlink evidence.
- **Production-Live**: the exact Production-Ready release serves both canonical domains after the agreed owner DNS action, and the agency-owned post-cutover runner has verified domain routing, certificates, mail-related DNS preservation, and Google/Yandex ownership and sitemap submission.
- **Production-Proven**: the Production-Live release has passed its defined burn-in window, operational monitoring, recovery and rollback exercises, and owner acceptance without an unresolved launch-severity incident.
