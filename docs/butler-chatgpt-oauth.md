# Butler with an app-owned ChatGPT subscription

This provider uses the selected ChatGPT account's plan permission. Subscription limits still
apply. It does not claim unlimited usage or a USD price per token. Existing OpenAI and
OpenRouter providers keep their explicit configuration; a failed subscription request never
switches to either provider. Butler's source, review and draft-only policies remain in force.

The implementation uses the public Responses endpoint with `store: false`, `stream: true`,
an input array and no unsupported `max_output_tokens` field. Local input, output bytes,
terminal token usage, step count, total tokens, elapsed time and actor concurrency remain
bounded. Only a parsed terminal `response.completed` can become a saved inference checkpoint.
An interrupted request remains unknown until the existing explicit recovery acknowledgement.
Subscription monetary fields are `NULL` because money is not applicable; that does not prove
the request's inference outcome. Metered history keeps its original numeric amounts.

## Local consent and entitlement

Run the operator helper from the repository with Node 24.16.0. These commands need no API
key or runtime activation setting:

```sh
mise exec node@24.16.0 -- node --conditions=react-server --import tsx scripts/butler-chatgpt-oauth.ts login --dir /Users/ivan/.config/ms-realty/chatgpt
mise exec node@24.16.0 -- node --conditions=react-server --import tsx scripts/butler-chatgpt-oauth.ts status --dir /Users/ivan/.config/ms-realty/chatgpt
mise exec node@24.16.0 -- node --conditions=react-server --import tsx scripts/butler-chatgpt-oauth.ts models --account REGISTRATION_ID --dir /Users/ivan/.config/ms-realty/chatgpt
```

`login` creates the loopback callback before printing an application-owned authorization link.
The person opens it and confirms the intended ChatGPT account, workspace and MS Realty Butler
plan-use permission. The callback-issued client ID, state, nonce, PKCE, verified ID token and
returned `chatgpt.tokens.use.direct` scope must all validate before a credential is connected.
The model command prints only the selected account's displayable model slugs and names, in
the provider's order. It does not send inference. Use that observed slug for `BUTLER_MODEL`.

Use `login --account REGISTRATION_ID` for a saved registration. The issued client and host ID
are retained; state, nonce and PKCE are fresh. Each verified subject/client pair is separate,
even if emails match. The helper keeps distinct stable labels. A denied scope, invalid grant,
account mismatch or failed signature cannot mark the provider qualified. Never import Codex
authentication files or use a ChatGPT backend endpoint.

The private bootstrap directory must be owned by the operator with mode 0700. Credential
files use mode 0600 and fsync plus atomic rename. Do not print, commit or attach their contents,
callback query strings or authorization codes. After a crash, inspect the lock's process
identity before removing a stale lock; the helper never guesses that a live refresh expired.

## Durable Container storage

Cloudflare Container filesystems do not provide this credential's durability. The runtime
uses the dedicated PostgreSQL adapter and never falls back to bootstrap files. Apply only the
new `0025_chatgpt_oauth` migration through the normal migration process. It preserves metered
history, classifies unresolved historical continuations conservatively and removes PUBLIC
access to the credential tables.

An operator provisions separate runtime and operator SQL identities. Neither may own the
credential tables or inherit a privileged migration/superuser role. The runtime needs only
SELECT on the two credential tables and UPDATE on the rotating encrypted payload and its
status/version fields. The operator additionally initializes hosts/imports registrations and
updates their labels. The following group roles illustrate the exact grants; attaching real
login roles and storing their credentials is an operator action:

```sql
CREATE ROLE msr_butler_oauth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE msr_butler_oauth_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO msr_butler_oauth_runtime, msr_butler_oauth_operator;
GRANT SELECT ON chatgpt_oauth_hosts, chatgpt_oauth_registrations
  TO msr_butler_oauth_runtime, msr_butler_oauth_operator;
GRANT UPDATE (encrypted_credential, connected, version, updated_at)
  ON chatgpt_oauth_registrations TO msr_butler_oauth_runtime;
GRANT INSERT ON chatgpt_oauth_hosts, chatgpt_oauth_registrations TO msr_butler_oauth_operator;
GRANT UPDATE (label, encrypted_credential, connected, version, updated_at)
  ON chatgpt_oauth_registrations TO msr_butler_oauth_operator;
```

Set `BUTLER_CHATGPT_HOST_KEY` to one stable installation key. Set
`BUTLER_CHATGPT_ENCRYPTION_KEY` to a separate, secret, canonical base64 encoding of exactly
32 random bytes; do not reuse an auth/session secret. Keep an encrypted backup and key custody
together under the operator's recovery policy. AES-256-GCM binds the ciphertext to issuer,
client ID, verified subject and installation key. Changing the key alone cannot decrypt old
credentials; a key change needs an explicit re-encryption or reauthorization operation.

`BUTLER_CHATGPT_OPERATOR_DATABASE_URL` is used only by operator commands. A fresh installation
can explicitly import the bootstrap's existing host identity. If the destination already has
a host, prepare a fresh private directory using `login --database --dir PRIVATE_DIRECTORY`;
the saved destination host will be used for consent. A mismatch is rejected rather than
silently changing the registered host.

Production and private staging transports also require the reviewed
`BUTLER_CHATGPT_DATABASE_ROLE`, or `BUTLER_CHATGPT_OPERATOR_DATABASE_ROLE` for operator commands.
The adapter passes the supplied environment and this explicit role to the existing transport;
it never infers a privileged role from a credential URL or reuses the application role.

```sh
mise exec node@24.16.0 -- node --conditions=react-server --import tsx scripts/butler-chatgpt-oauth.ts import --account REGISTRATION_ID --dir PRIVATE_DIRECTORY --database
```

Import validates the retained ID token and subject, commits encrypted credentials in the
destination, then clears bootstrap tokens while retaining its registration identity. Use
only the destination for refreshes afterwards. If local clearing fails after DB commit,
reconcile that explicit transfer before using either copy. Runtime refresh holds a PostgreSQL
transaction advisory lock across read, token rotation and encrypted save, so replicas read
the latest rotating token rather than refreshing the same old session concurrently.

## Runtime qualification and recovery

The runtime secret/configuration boundary is:

| Setting | Meaning |
| --- | --- |
| `BUTLER_PROVIDER=chatgpt_oauth` | Explicit provider; no automatic fallback |
| `BUTLER_MODEL` | Slug observed in this account's current catalog |
| `BUTLER_CHATGPT_CREDENTIAL_ID` | Validated registration's 64-hex ID |
| `BUTLER_CHATGPT_DATABASE_URL` | Constrained runtime SQL identity |
| `BUTLER_CHATGPT_DATABASE_ROLE` | Independently reviewed credential runtime SQL role |
| `BUTLER_CHATGPT_HOST_KEY` | Stable durable installation key |
| `BUTLER_CHATGPT_ENCRYPTION_KEY` | Separate encryption secret |
| `BUTLER_CHATGPT_QUALIFIED=1` | Operator records actual connection/entitlement qualification |
| `BUTLER_ENABLED=1`, `BUTLER_PROCESSING_APPROVED=1` | Existing operator activation and processing gates |
| `BUTLER_WORKSPACE_QUALIFIED=1` | Existing separate workspace qualification |

Existing nonmonetary workspace limits still apply. USD rates and a USD maximum do not apply
to the subscription provider and stay null in retained records. A known usage-limit error
points to ChatGPT usage/settings without inventing a reset. Usage temporarily unavailable
remains a later retry; ineligible accounts, unsupported routes/capabilities and missing scopes
require their specific configuration or authorization correction. A genuine unknown stream
does not become settled merely because its cost is null. Inference has no automatic retry.

`signout --account REGISTRATION_ID` operates on bootstrap storage; add `--database` for the
explicit destination. It serializes against refresh, attempts the discovered renewable-session
revocation with one bounded retry, clears tokens and retains the issued registration. If
remote revocation is unconfirmed, disconnect MS Realty Butler in ChatGPT Settings. An operator
must not report that remote revocation succeeded from local clearing alone.
Repeating sign-out after local credentials are cleared still leaves remote revocation unconfirmed.

Local tests use synthetic credentials and inference with disposable PostgreSQL. They establish
source behavior and transaction boundaries, not a live connected account, model entitlement,
production readiness, provider-quality acceptance or human content approval. Record those
gates separately with redacted evidence.

Official references: [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
[models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[preview constraints](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
[error recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
