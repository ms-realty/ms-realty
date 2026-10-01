# Protected staging PostgreSQL transport

This is prepared source, not a provisioned service or live connection PASS. The existing review
host `157.230.109.185` runs PostgreSQL 16.14 inside Docker with SSL off and no published database
port. It remains untouched. Use a separate staging PostgreSQL 16.14 service, volume, database
and three reviewed roles on that host; enabling SSL on the existing production cluster is not
part of this contract. No provider resource or spending is created by these files.

## Connection path

The selected Containers image includes a pinned `cloudflared access tcp` companion. A separate
origin-side Cloudflare Tunnel connector on the staging database's private Docker network routes
the reviewed staging database hostname to `tcp://<staging-postgres-service>:5432`. PostgreSQL has
no host-published port. The origin connector uses outbound Cloudflare Tunnel connections; the
client companion uses an authenticated HTTPS/WebSocket connection. See the official
[Tunnel protocol routes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/),
[Access service-token authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/cloudflared-authentication/),
and [connector firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).

The database Access application allows only its own named Service Auth token. Human allow,
bypass, broad wildcard applications, foreign tokens and Worker routes on the database hostname
fail the read-only preflight. Its token is distinct from the web/controller Access token. The
companion receives the Access **Client ID**, not the service token's resource UUID or the origin
connector token. The hostname is separate from the three staging web hosts and contains an
explicit `stage`/`staging` DNS label. An administrator supplies the actual reviewed identifiers;
these scripts do not create Access, Tunnel or DNS resources.

Each role's canonical secret URL keeps the reviewed remote hostname, isolated database and
role, with only `sslmode=verify-full`. The drivers dial `127.0.0.1:15432` internally, while Node TLS
checks the remote hostname against the supplied staging CA. The explicit `pg` SSL options are
preserved after removing URL SSL overrides from its internal dial URL. The actual URL secret
is never rewritten or logged. PostgreSQL 16 uses its standard SSLRequest handshake.
Both drivers require TLS 1.2 or later. See [node-postgres SSL behavior](https://node-postgres.com/features/ssl).

The wrapper validates transport inputs before spawning its companion, rejects an occupied
listener, and waits for real loopback readiness. Readiness alone does not prove a database
connection. Access credentials exist only in the companion's environment and are removed
before role imports. Companion loss terminates the role; signals are forwarded with a bounded
shutdown. An uncertain migration is never automatically replayed.

## First deploy: measure before starting application work

The workflow avoids requiring a connection receipt from a container which has not yet been
deployed. Its first adapter configuration sets `STAGING_CONNECTIVITY_ONLY=true`. The application,
queue, migration, scheduled queue renewal and email controls are held. Only authenticated
`/__staging/runtime` and `POST /__staging/connectivity` diagnostics are available. Access and
the staging control secret protect both; all responses remain noindex/no-store.

The web process also stays prepared until migration passes. The private SQL probe imports
neither application startup nor the queue/migrator. For each of the three roles it opens
read-only transactions with both `postgres-js` and `pg`, reads its own `pg_stat_ssl` session,
and verifies the exact database, role, PostgreSQL 16.14 and encrypted session. The controller
script rejects failed, missing, stale or mismatched identities and measures actual Cloudflare
image/rollout/actor state before and after the query. All three roles must still be prepared.

Public-port isolation cannot be inferred from a SQL query. Before either deployment phase,
the operator supplies an independent origin inspection in environment variable
`STAGING_DATABASE_ISOLATION_JSON`, pinned by `database.originIsolationSha256`. Its exact report
path is `deploy/staging-isolation.generated.json`. Inspect the separate staging container's
actual port bindings, network and engine; confirm the production stack was unchanged. The
[report skeleton](staging-origin-isolation.example.json) is deliberately UNQUALIFIED.
Do not replace its status with PASS without those measurements.

The measured connection receipt pins the source, immutable image, prepared actors, both
drivers and that origin inspection. Only after it validates does the workflow re-deploy the
same digest with `STAGING_CONNECTIVITY_ONLY=false` and run the explicit migration. A failure
leaves the adapter held and retains available Actions evidence. A previous running role or
uncertain migration needs operator reconciliation; this bootstrap does not force-stop or
replay it. Provider-reported image state is separate from the immutable source/build nonce.

## Operator inputs and remaining qualification

The staging GitHub Environment needs these additional environment-owned secrets:

- `STAGING_DATABASE_TLS_CA_PEM`: one current CA certificate for the separate staging database;
- `STAGING_DATABASE_ACCESS_CLIENT_SECRET`: the database Access service-token secret.

The nonsecret database Access Client ID and token/application resource IDs go in the reviewed
staging input JSON. Role URLs remain separate `STAGING_WEB_DATABASE_URL`,
`STAGING_WORKER_DATABASE_URL`, and `STAGING_MIGRATOR_DATABASE_URL`. Do not install the origin
connector token in application role environments or reuse the production env file.

Local tests prove driver certificate/hostname rejection and receipt behavior against a
disposable PostgreSQL 16.14 fixture. They do not prove Cloudflare connectivity, operator role
privileges, application recovery after import, backup/restore or delivery. After provisioning,
the operator must also test a real queued job after more than 20 minutes of inactivity, loss
and restoration of the origin connector, companion death, container restart and migration
advisory-lock interruption. No unknown effect may be re-sent or unknown migration re-run.
Cloudflare documents an [arbitrary TCP long-lived connection caveat](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/cloudflared-authentication/arbitrary-tcp/)
and recommends Client-to-Tunnel for long-lived connections. The prepared WebSocket path
therefore remains unqualified until these actual lifecycle checks pass.

The launch parity checker and production promotion remain separate, held gates. This path
does not change production routes, DNS, buckets, customer records or PR state.
