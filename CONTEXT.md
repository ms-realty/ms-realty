# Domain Context

## Catalog lifecycle

- **Active-at-freeze**: the legacy source displayed the offer when the approved launch freeze was captured. This is evidence of historical catalog state, not permission to publish.
- **Archived listing**: a legacy listing classified as review, hold, or source-unavailable. It is excluded from active search and may keep only a truthful preservation surface.
- **Published listing**: a listing whose facts, media, and publication have passed the independent public-inventory approval boundary.
- **Listing preservation surface**: a non-indexable terminal `200` page that preserves a listing URL and lifecycle state without publishing property claims, media, schema, or locale alternates.
- **Terminal legacy decision**: the approved outcome for one exact legacy URL: retained `200`, one-hop `301`, or `410`. It does not authorize a broad fallback for other URLs.
