# ADR 0004: Cloudflare staging and the existing PostgreSQL engine

Status: owner-directed hosting/engine decision; deployment and launch acceptance pending.

The owner's 1 October 2026 launch gate supersedes DigitalOcean App Platform and earlier
instructions to undraft or merge #280. Keep #280 draft. Do not change production routes,
DNS or production R2 buckets. An independent staging parity PASS and owner/controller
sign-off precede promotion of the same immutable release; local checks grant no launch
approval. Legacy WordPress remains the baseline and rollback origin.

Use the MS Realty Cloudflare account `921d0224dcd595c87b7928d2b3c479d1`, protected staging
hosts, separate staging media/cache buckets and a separate database with web/worker/migration
roles. The `staging` GitHub Environment must contain its own credentials. Never consume
the production env file or production origin/R2 credentials in staging.

Read-only origin SSH and SQL establish **PostgreSQL 16.14** on `157.230.109.185`; the database
is Docker-internal, has no published port and SSL is off. Pin provider qualification/CI
to `postgres:16.14-alpine`. This replaces ADR 0002's provisional PostgreSQL 18 target for
this provider contract. Schema, migrations and legacy import passed on 16.14 locally;
that does not prove a Cloudflare connection. Do not expose the existing database to make
the adapter work. New staging roles/database and a verified private TLS path remain inputs.

The preferred web path is Workers/OpenNext. The current adapter builds successfully after
pg-cloudflare tracing is corrected, but the candidate's Sharp 0.35.4 media/document intake
does not start in local workerd. Record that concrete blocker in
[the qualification report](../../deploy/opennext-qualification.md) and the shared
`output/msr-launch/CLOUDFLARE-INVENTORY.md`. Use the owner's permitted **Cloudflare Containers
fallback** for the complete candidate. Web, persistent pg-boss and file-based migrations
must use one immutable image digest and distinct least-privilege credentials.

All 457 legacy URL decisions require the zero-loss rework. The 268 historical 410 approvals
are revoked; none is re-approved by this ADR. Sold listings and all legacy content/locales
stay in scope. Missing content or equivalent targets must block parity, never manufacture
a homepage redirect or a launch PASS.

The inventory records the actual GitHub HTTP 403 on staging-branch push and on Environment
creation, with no fallback identity. No staging URL or provider delivery proof exists yet.
This ADR records the owner's implementation decisions, not R00 or any release-gate acceptance.
