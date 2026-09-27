# Candidate runtime and deployment contract

These artifacts prepare a candidate; they do not authorize deployment or establish launch
readiness. R00 remains blocked by the unresolved transition from legacy launch authority.
No provider, domain, human legal review, backup or delivery proof is supplied by local tests.

## One application image

Build `Dockerfile` from the reviewed commit, passing `--build-arg BUILD_SHA=<full commit>`.
It uses the pinned official Node 24 Debian multi-architecture index. Next produces a standalone
web server. esbuild bundles the worker, migration and bootstrap entry points against the same
locked production dependency tree. The image contains no compiler, tsx or development tools.
It runs as the unprivileged `node` user. Build needs no database or provider credentials.

Commands for the same immutable image:

- web: `node server.js`
- worker: `node --conditions=react-server dist-runtime/worker.mjs`
- migration: `node --conditions=react-server dist-runtime/migrate.mjs`
- explicit first-manager bootstrap: `node --conditions=react-server dist-runtime/bootstrap.mjs`

The migration command takes a database advisory lock before applying committed migrations.
Run it once as PRE_DEPLOY with its own migration role. Never give runtime processes migration
credentials. Queue bootstrap requires explicitly reviewed pg-boss schema privileges for the
worker role. Existing in-flight web/worker revisions must remain compatible during rollout.

`/api/health` proves only that the web process responds and exposes its build identifier.
The real dequeued worker heartbeat is separate. A generated readiness view missing from
`release/readiness.json` leaves the readiness endpoint unavailable; no image/build success
manufactures that evidence.

## Agency-owned infrastructure inputs

`app-spec.template.json` is intentionally unfilled and cannot be deployed as-is. Supply the
candidate digest and approved Frankfurt VPC, measured instance sizes, private TLS Postgres
18 connections, verified sender, EU-jurisdiction private R2 bucket, private ClamAV service
with fresh signatures, independent heartbeat monitor and secrets through provider stores.
Use the same candidate digest for web, worker and migrator; disable image autodeploy. Two web
instances and one worker are the starting topology, not a claim of measured capacity.

App Platform's VPC egress IP must be an approved managed-database trusted source. A build
does not need database access. Select a managed HA database configuration explicitly; the
template does not create or alter a database. The independent backup destination, signing
custody, restore drill and delivery/alert drills remain release inputs.

DigitalOcean references verified 27 September 2026:
[app specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/),
[VPC configuration](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/),
[container deployments](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-container-images/).

## Gateway and direct-origin protection

`gateway/worker.ts` forwards to one fixed HTTPS provider origin. Before forwarding it removes
incoming internal control headers, supplies the rotating origin secret and checked public
host, and forwards only the edge's client IP. Web proxy and private authentication check this
transport independently from user sessions. Real production hosts reject direct origin and
forged context; only the minimal health route is exempt. Explicit loopback production builds
remain available for isolated browser tests.

Set the current secret in the gateway and origin. For rotation, first configure the origin's
`ORIGIN_VERIFY_PREVIOUS_SECRET`, move the gateway to the new current secret, verify traffic,
then remove the previous secret. Never log or include either secret in an evidence artifact.

Supply `LEGACY_ROUTES_JSON` as an exact reviewed compact array of
`{host,path,query,status,targetPath?,targetHost?}` and pin its SHA-256 with
`LEGACY_ROUTES_SHA256`. Statuses are 200 (internal retained-path forwarding), 301 (exact
approved redirect), 404 and 410. Mapping targets must be the configured public host. Unknown
legacy hosts/paths have no synthesized redirect. Historical mapped routes do not accept
mutations. Current application routes preserve their method, body and query.

The historical `data/legacy/url-decisions.json` is provenance, not a fresh equivalence
approval for this candidate. Resolve its documented gaps and qualify every retained and
redirected URL before constructing the candidate map. In particular do not replace retained
home/search semantics with blanket redirects or silently repair the old duplicate targets.
Both legacy domains require live crawl parity evidence and domain ownership/renewal proof.
No DNS, Cloudflare route, domain or App Platform deployment was changed by preparing these files.
