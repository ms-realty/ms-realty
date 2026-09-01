# Production review handover

This deployment is the agency's durable decision workspace behind the private review host.
The sole indexable public authority is `https://makler-realty.com`. The noindex
`https://ms-realty.ms-realty-bg.workers.dev` origin remains the operator/admin,
OAuth, and deployment endpoint; pending listing facts, translations,
customer messages, broker contacts, legacy URLs, and launch evidence remain behind
their existing approval gates.

## Agency entry point

1. Open `https://<review-host>/admin/migration/review?locale=bg` and sign in with the
   handover credentials supplied separately.
2. Start with **Agency decision queue**. Each lane links to the existing specialist
   workbench and shows its remaining decision count.
3. Record decisions in the workbench. Do not edit JSONL, CSV, or database files directly.
4. `/api/ready` returning `503` is expected until the production-readiness gates are complete.

The review host is protected by HTTPS and Basic Authentication and sends
`X-Robots-Tag: noindex, nofollow, noarchive`. The loopback port remains available only on
the server for health checks and recovery operations.

## Deploy or update

The server keeps its secrets in mode-`0600` `.env.production-review`. The bcrypt password
hash must be generated with `caddy hash-password`; never put a plaintext review password
in the environment file.

```bash
cd /opt/ms-realty/current
export MS_REALTY_ENV_FILE=.env.production-review
export MS_REALTY_COMPOSE_OVERRIDE=production/docker-compose.production-review.yml
npm run docker:up
curl --fail http://127.0.0.1:3200/api/health
```

Named Docker volumes retain Payload/Postgres, search indexes, runtime ledgers, evidence,
and Caddy TLS state across image rebuilds and `docker:down`. Never run `docker:reset` on the
production-review host.

## Backup and recovery

```bash
cd /opt/ms-realty/current
export MS_REALTY_ENV_FILE=.env.production-review
export MS_REALTY_COMPOSE_OVERRIDE=production/docker-compose.production-review.yml
npm run docker:backup
```

Copy the resulting private `.local-backups/backup-*` directory to encrypted off-site
storage. A production recovery gate still requires an isolated restore drill, checksums,
a named operator, and a different named reviewer; import that signed evidence through the
production-recovery panel in the admin workspace.

## Public production authority

Use `https://makler-realty.com` for indexable public pages and the workers.dev
origin for direct `/admin`, OAuth callbacks, and deployment checks. All
workers.dev public responses and admin/private surfaces remain noindex. The
historical `.ru` URLs and both legacy media namespaces remain source/crawl
compatibility data.
