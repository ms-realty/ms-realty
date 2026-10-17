# Owner steps: MS Realty staging credentials

The GitHub Environment `staging` already exists (ID `23296073670`), restricted to
`codex/msr-staging`. These steps install its separate credentials through GitHub
account `ms-realty`. They keep staging deployment disabled. They do not deploy,
modify DNS, publish routes or enable production. Every PR stays draft until the
launch gate passes.

Claude session **MS Realty UI/UX redesign** owns all UI/UX, Figma/FigJam, frontend
layout/copy and visual acceptance, including #284. Codex owns staging, migration,
URL maps, SEO plumbing, inquiry backend and parity inputs. Shared-file changes go
through lane `msr`; Claude writes `msr.visual`, and the controller relays requests.

## 1. Prepare private files and generate five local secrets

Run this from the delivery checkout. Credentials stay outside Git. Existing files
are preserved; rerunning this step does not rotate installed credentials. It
refreshes the example's artifact hashes from this checkout only when first copied.
The JSON remains a template, with missing provider fields and no qualification.

```bash
set -euo pipefail
set +x
cd /Users/ivan/.codex/worktrees/msr-product-delivery/MS-Realty
MSR_CREDENTIAL_DIR=/Users/ivan/.config/ms-realty/staging
umask 077
mkdir -p "$MSR_CREDENTIAL_DIR"
chmod 700 "$MSR_CREDENTIAL_DIR"
MSR_CREDENTIAL_DIR="$MSR_CREDENTIAL_DIR" python3 - <<'PY'
import hashlib, json, os, secrets
from pathlib import Path

directory = Path(os.environ['MSR_CREDENTIAL_DIR'])
for name in (
    'STAGING_AUTH_SECRET', 'STAGING_ORIGIN_VERIFY_SECRET',
    'STAGING_EMAIL_RELAY_SECRET', 'STAGING_CONTROL_SECRET',
    'STAGING_ENVIRONMENT_TOKEN_SENTINEL',
):
    path = directory / name
    try:
        with path.open('x') as f:
            f.write(secrets.token_hex(32))
        path.chmod(0o600)
    except FileExistsError:
        pass

target = directory / 'STAGING_INPUTS_JSON.json'
if not target.exists():
    data = json.loads(Path('deploy/cloudflare-staging.inputs.example.json').read_text())
    for field, digest in (
        ('routes', 'routesSha256'), ('routeManifest', 'routeManifestSha256'),
        ('media', 'mediaSha256'),
    ):
        data['artifacts'][digest] = hashlib.sha256(Path(data['artifacts'][field]).read_bytes()).hexdigest()
    manifest = json.loads(Path(data['artifacts']['routeManifest']).read_text())
    exclusions = json.dumps(manifest['exclusions'], ensure_ascii=False, separators=(',', ':')).encode()
    data['artifacts']['exclusionsSha256'] = hashlib.sha256(exclusions).hexdigest()
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    target.chmod(0o600)
print('Five local secret files prepared; provider credentials and reviewed JSON still required.')
PY
```

## 2. Codex prepares the origin; the owner supplies Cloudflare credentials

Origin provisioning is operator work. On 2 October Codex provisioned a separate
PostgreSQL 16.14 container, private network, volume, TLS and three roles on the
existing MS Realty origin, with no published database port. All roles passed
actual verify-full TLS sessions; cleartext, wrong hostname and other-database
connections were rejected. Production review container IDs/start times/config
hashes were unchanged; another Docker network could not reach the staging DB.

Codex has already written `STAGING_WEB_DATABASE_URL`, `STAGING_WORKER_DATABASE_URL`,
`STAGING_MIGRATOR_DATABASE_URL`, `STAGING_DATABASE_TLS_CA_PEM` and the measured
`STAGING_DATABASE_ISOLATION_JSON.json` to the private directory with mode 600. The
CA private key stays on origin outside container mounts. The five local app
secrets also exist. The owner does not provision PostgreSQL or generate these
values. Existing credentials must not be rotated by rerunning preparation.

Exact dashboard clicks, current permissions, secure file-entry helper and JSON
ID fields are in [OWNER-CLOUDFLARE-CHECKLIST.md](/Users/ivan/Code/Mindburn-Labs/output/msr-launch/OWNER-CLOUDFLARE-CHECKLIST.md).
Access applications/policies, staging DNS and the origin Tunnel are created by
the controller in the MS Realty dashboard. Neither workflow API token receives
Access or DNS write permissions. The origin Tunnel token stays outside GitHub app
secrets; Codex installs the connector after the controller supplies it.
Six Cloudflare workflow secret values are owner inputs, as below.

Save each value in `/Users/ivan/.config/ms-realty/staging/` using exactly the
filename below, as plain UTF-8 without shell quotes. Use the MS Realty Cloudflare
account **Ms.realty.bg@gmail.com's Account**, ID
`921d0224dcd595c87b7928d2b3c479d1`. No Mindburn credential or production env file
is an input. Do not paste values into chat, lane JSON, commits or evidence reports.

| Required filename | Exact source / required scope |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Fresh staging deploy token from the MS Realty account. It must authorize the prepared Workers/Containers image push and staging Worker/secret deployment, with zone Workers Routes write limited to `makler-realty.com`. Start from Cloudflare's Workers edit template and review resource scope. No DNS write, Access edit or production-bucket object write is needed by this deployment job. Provider authorization still needs actual qualification. |
| `STAGING_CLOUDFLARE_READ_TOKEN` | Separate read-only token: MS Realty account Workers/Containers observations, R2 bucket configuration, Access applications/policies/groups; `makler-realty.com` zone read, DNS read and Workers Routes read. No write permission. |
| `STAGING_DATABASE_ACCESS_CLIENT_SECRET` | Database-only Cloudflare Access Service Auth token secret. Its Access Client ID and resource IDs go in `database.access` in the JSON. Distinct from the web token below. |
| `STAGING_ACCESS_SERVICE_CLIENT_SECRET` | Web/controller Access service-token secret for the exact three staging hosts. Client ID and resource IDs go in `access` in the JSON. |
| `STAGING_R2_ACCESS_KEY_ID` | Access Key ID from a new R2 Object Read & Write token restricted to the separate staging media/cache buckets. |
| `STAGING_R2_SECRET_ACCESS_KEY` | The matching S3 Secret Access Key, never the production R2 key. |

The reviewed TCP hostname is `staging-db.makler-realty.com`. The three database URLs
must use `postgresql://role:encoded-password@staging-db.makler-realty.com:5432/staging_database?sslmode=verify-full`.
Role names, hostname and database must match the reviewed JSON. Credentials must
be URL-encoded. Do not use the existing `ms_realty_payload` database or add URL SSL
overrides. The existing origin's production PostgreSQL has SSL off; staging needs
its separate TLS service/volume, with no host-published5432. See
[the private database runbook](cloudflare-private-postgres.md).

The origin Tunnel connector token belongs only on the separate staging origin
connector. It is **not** one of the GitHub application secrets and must not be
substituted for either Access service-token secret. Codex supplies and measures
PostgreSQL, roles/certificates, the origin connector and private ClamAV. The
controller creates the database Access application, Service Auth policy and DNS.
The connector is prepared and stopped pending its fresh token.
ClamAV is configured but stopped pending approved RAM and private transport
qualification from Containers. Never fill `CLAMAV_HOST` with an origin-only
Docker name that deployed Containers cannot resolve.

Codex completes `STAGING_INPUTS_JSON.json` from actual resources, with the owner's
approved Access identities and test recipient. Account/zone, origins, database
name/hostname/roles/version, isolation pin, intended buckets and artifact hashes
are already filled. Planned buckets still need provider confirmation. Inputs:

- `.com` zone ID `f0ac7af0721419e8129e5d10ff547372` and the exact three HTTPS origins
  already in the template: `staging.`, `staging-my.`, `staging-app.makler-realty.com`;
- web Access application ID/audience/team domain, the MS Realty owner identity,
  controller email group/IDs, and web service-token Client ID/resource ID;
- distinct staging database name/host/three roles, separate database Access
  application/audience/token IDs, and the origin inspection's SHA-256;
- actual separate bucket names, normally `ms-realty-staging-media` and
  `ms-realty-staging-opennext-cache`, with public/custom R2 domains disabled;
- a reviewed sender at `notifications.makler-realty.com`, exactly one reviewed
  test inbox, and explicit staging inquiry-notice consent flags;
- the private ClamAV host/port and recorded legacy rollback origin/evidence.

Keep `sourceCommit` and `image` null before qualification/build. Do not invent
provider identifiers, tracking IDs, an immutable digest or a connection PASS.
Keep `purpose: protected_partial_preview` and its explicit exclusions while the
source map is partial; this can never qualify zero-loss production launch.

Save the independent, measured origin inspection as
`STAGING_DATABASE_ISOLATION_JSON.json`, using
`deploy/staging-origin-isolation.example.json` as its schema. Its template is
UNQUALIFIED; only real origin inspection can produce a PASS. Pin SHA-256 of the
exact report bytes as `database.originIsolationSha256`. The controller/operator
must preapprove/provision staging DNS, valid HTTPS and Access protection; Codex
does not change DNS or production routes. Resource creation and token policy are
separate from installing credentials.

Cloudflare's current references: [Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/),
[API permission groups](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
[Containers image management](https://developers.cloudflare.com/containers/guides/image-management/),
[R2 token scope](https://developers.cloudflare.com/r2/api/tokens/).
R2 object tokens can be bucket-restricted; account-wide API metadata permissions
do not themselves prove a staging-only object credential. The exact gateway,
resource names and preflight constrain the deployment further.

## 3. Install files into the existing staging Environment

Run only after step 2. The script checks every input file before any GitHub write,
verifies the login, sets the staging hold first, uploads values through stdin,
and computes the token fingerprint from the same normalized bytes it uploads.
It stops at the first failure. Earlier accepted writes may remain; deployment
stays disabled and the receipt identifies the last successful named operation.
Do not run concurrently with another credential installer or change the private
files during the run. Review existing values before intentionally replacing them.

```bash
set -euo pipefail
set +x
cd /Users/ivan/.codex/worktrees/msr-product-delivery/MS-Realty
MSR_CREDENTIAL_DIR=/Users/ivan/.config/ms-realty/staging
MSR_CREDENTIAL_DIR="$MSR_CREDENTIAL_DIR" python3 - <<'PY'
import hashlib, json, os, stat, subprocess, sys
from pathlib import Path

directory = Path(os.environ['MSR_CREDENTIAL_DIR'])
names = (
    'CLOUDFLARE_API_TOKEN', 'STAGING_CLOUDFLARE_READ_TOKEN',
    'STAGING_WEB_DATABASE_URL', 'STAGING_WORKER_DATABASE_URL',
    'STAGING_MIGRATOR_DATABASE_URL', 'STAGING_DATABASE_TLS_CA_PEM',
    'STAGING_DATABASE_ACCESS_CLIENT_SECRET', 'STAGING_ACCESS_SERVICE_CLIENT_SECRET',
    'STAGING_R2_ACCESS_KEY_ID', 'STAGING_R2_SECRET_ACCESS_KEY',
    'STAGING_AUTH_SECRET', 'STAGING_ORIGIN_VERIFY_SECRET',
    'STAGING_EMAIL_RELAY_SECRET', 'STAGING_CONTROL_SECRET',
    'STAGING_ENVIRONMENT_TOKEN_SENTINEL',
)
values = {}
for name in (*names, 'STAGING_INPUTS_JSON.json', 'STAGING_DATABASE_ISOLATION_JSON.json'):
    path = directory / name
    if not path.exists() or path.is_symlink() or not path.is_file():
        sys.exit('Missing private file: ' + name)
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        sys.exit('Run chmod 600 on private file: ' + name)
    values[name] = path.read_text().strip() if name in names else path.read_text()
    if not values[name]:
        sys.exit('Empty private file: ' + name)

config = json.loads(values['STAGING_INPUTS_JSON.json'])
if config.get('accountId') != '921d0224dcd595c87b7928d2b3c479d1' or config.get('environment') != 'staging':
    sys.exit('MS Realty staging account/config required')
json.loads(values['STAGING_DATABASE_ISOLATION_JSON.json'])
base = os.environ.copy()
base.pop('GH_TOKEN', None)
base.pop('GITHUB_TOKEN', None)
token = subprocess.run(
    ['gh', 'auth', 'token', '--hostname', 'github.com', '--user', 'ms-realty'],
    env=base, capture_output=True, text=True,
)
if token.returncode or not token.stdout.strip():
    sys.exit('MS Realty keyring credential unavailable; no fallback')
env = {**base, 'GH_TOKEN': token.stdout.strip(), 'GH_HOST': 'github.com'}
actor = subprocess.run(['gh', 'api', 'user', '--jq', '.login'], env=env, capture_output=True, text=True)
if actor.returncode or actor.stdout.strip() != 'ms-realty':
    sys.exit('Unexpected GitHub identity; no writes made')

def write(args, value, label):
    result = subprocess.run(['gh', *args, '--repo', 'ms-realty/ms-realty'],
                            input=value, env=env, capture_output=True, text=True)
    if result.returncode:
        sys.exit('Write failed: ' + label + '; installation incomplete; no deploy launched or values logged')
    print('Accepted: ' + label)

write(['variable', 'set', 'STAGING_DEPLOY_ENABLED'], 'false', 'repository staging deploy hold')
write(['variable', 'set', 'STAGING_ENVIRONMENT_CONFIGURED'], 'false', 'repository configuration hold')
write(['variable', 'set', 'STAGING_REVIEWED_RUNTIME'], 'containers', 'repository reviewed runtime')
for name in names:
    write(['secret', 'set', name, '--env', 'staging'], values[name], 'staging secret ' + name)
fingerprint = hashlib.sha256(values['CLOUDFLARE_API_TOKEN'].encode()).hexdigest()
write(['variable', 'set', 'CLOUDFLARE_ACCOUNT_ID', '--env', 'staging'], config['accountId'], 'staging account')
write(['variable', 'set', 'STAGING_CLOUDFLARE_TOKEN_SHA256', '--env', 'staging'], fingerprint, 'staging token fingerprint')
for name in ('STAGING_INPUTS_JSON', 'STAGING_DATABASE_ISOLATION_JSON'):
    write(['variable', 'set', name, '--env', 'staging'], values[name + '.json'], 'staging reviewed input ' + name)
print('Credential installation accepted. Deploy disabled; schema/provider/CI qualification still required.')
PY
```

## 4. Return the installation receipt through the controller

Return only the accepted operation names, nonsecret resource identifiers and the
reviewed JSON/report paths. Keep the five generated secrets in private custody;
the controller installs/reviews the token fingerprint and sentinel outside builder
artifacts. The files and commands never manufacture provider or launch evidence.

Codex then validates the complete config, actual token authorization, isolated
provider preflight and exact-source CI. Only after controller qualification may
the repository staging flags become true with `STAGING_SOURCE_QUALIFIED_SHA` set
to that exact final source. Neither this installer nor a local test sets that SHA,
dispatches a workflow, pushes the staging branch or removes PR draft status.
The independent checker and owner/controller sign-off still govern production.
