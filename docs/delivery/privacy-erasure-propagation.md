# O26 / AT45 / UX23 — reviewed erasure and restriction

The application records a human safety decision, stops selected optional processing, revokes
the person's client credentials and private export delivery, and removes separately reviewed
eligible optional copies. The request stays partial while retained business evidence, physical
files, provider data or independent archive proof are unresolved. This supplies no accepted
legal policy, live provider deletion or R05/R08 release proof.

## Authority and source review

The staff path is `/{locale}/operations/privacy/{id}/erasure`. Native forms work without
JavaScript. An issued command key and request version survive refresh and manual recovery
after a lost response. Exact-key status uses the `runOperation` advisory fence: uncommitted
work is pending, and a wrong request/version binding remains unknown. Live session, fresh
verification, passkeys and capabilities are checked on commands, replays and status reads.
A client request or Butler draft cannot apply this effect.

Applying requires request-scoped `privacy.manage` and unscoped `access.grant` for the account-
wide credential effect. The request must be verified, in progress or held, and owned by a
currently available privacy operator. Reviewed category/source decisions bind the request
version, own source hashes, reviewer/session, current grants/keys, opaque dependency/retention
evidence and immutable operating-policy edition/content hash. Own source values are shown for
review; removed personal values are not copied into the safety ledger.

The command takes deterministic exclusive dependency, authority and retention table locks
with `NOWAIT` in a short application transaction, then rechecks authority and inventory.
Concurrent writers or source row locks refuse this attempt without a partial effect. An
absent key can be retried after conflict resolution. The coarse locks favor safe explicit
privacy work over concurrent removal. No provider call occurs inside this transaction.
A send already handed to a provider cannot be recalled; restriction committed before dispatch
invalidates queued optional work through the current-recipient checks.

A nonempty `retentionReference` is only a reviewed reference. Removal additionally needs a
source/category `optional_only` human disposition and evidence reference, appropriate reviewed
optional-purpose references, no current retention hold, no unknown business dependency and no
linked staff identity. Unknown classifications stay held. Restricted retention sources remain
a boolean and opaque digest, without source disclosure.

## Actual effects and held boundaries

The decision withdraws selected search-alert/marketing subscriptions and appends consent
history. Durable purpose restrictions fence new opt-ins, resumption and queued dispatch.
An ordinary own-purpose withdrawal also gets an ordered safety decision without suspending
unrelated account access or creating a permanent party-wide restriction.

Credential revocation resolves immutable account IDs again against the same party and client
kind. It suspends those clients, ends sessions, revokes unused links, pending client invitations,
passkeys and grants, and revokes the party's export copies. Durable restrictions still block
client access if mutable account status is accidentally restored. Linked staff and other
parties are excluded. The export recipient guard rereads restriction at preparation, review,
issue and download.

Queued client sign-in emails are bound to their exact token. Erasure/reapplication cancels
the person's still-queued token-bound emails and clears raw secrets. Dispatch rechecks the
token's current expiry, revocation and consumption, recipient/account identity and durable
restriction both before claim and immediately before a bounded provider handoff. Token and
account locks remain held through that handoff. Mutable status restoration cannot issue or
consume a new link, recreate contact routes or start a client session under a durable
restriction. Legacy untagged emails require their original token-bound effect key. Already
attempting or unknown provider outcomes remain for reconciliation and are never blindly resent.

Only separately reviewed eligible contact preferences, matching aliases, optional search
criteria, own optional contact routes and client profile copies are removed. Core party
identity, joint Case participation, legal/business facts, immutable audit/activity/consent
history and physical documents remain. Contact rows retain stable IDs with unusable opaque
values, without cascading history. Case work, bookings, service agreements, pricing, offers
and contracts are not cancelled or rewritten.

The append-only `privacy_safety_decisions` chain has contiguous transactionally allocated
sequences, previous/current digests, review binding and typed effect. Immutable purpose
restrictions and append-only propagation events record actual outcomes. Same-key replay yields
one receipt/decision; changed payload conflicts. There is no restriction-release or status-
override API.

Business/joint/history remains held for separate disposition. Private storage has no deletion
or recovery-point-retention adapter, so physical deletion is unsupported. The message provider
supports sending only, so provider deletion is unsupported. Independent custody and the current
archive watermark remain held. The dedicated completion command returns `completed:false`
with typed remaining boundaries. Free-text review cannot complete deletion/restriction.

## Offline synthetic reapplication

The [offline quarantine contract](contracts/recovery-quarantine.md) remains the recovery
authority. Isolate the destination from web/workers, traffic and provider credentials/egress
before preparation. No command here reopens runtime, restores grants or replays external actions.

`npm run privacy:reapply-synthetic-tail` accepts only an owned generated
`test_<uuid-without-hyphens>` database on loopback through per-command `TEST_DATABASE_URL`.
It requires `--restore-id`, `--snapshot-digest`, `--tail`, `--signature`, `--trusted-key`,
`--checkpoint` and `--checkpoint-signature`. The trusted key and signed synthetic watermark
are supplied separately from the tail. Quarantine commits before file parsing or verification.

Verification binds restore identity, snapshot digest, both Ed25519 signatures, the separate
watermark, snapshot ledger anchor and every contiguous entry/digest through the watermark.
Missing, tampered, incomplete, wrong-trust, wrong-restore, gapped, conflicting and older-than-
checkpoint tails leave global quarantine. Valid newer privacy decisions reapply transactionally
with the same identities; identical replay applies zero new decisions. Restored credentials
stay invalid and old external-action history remains for manual reconciliation. Absent party
mapping refuses reapplication rather than inferring identity.

The test signer/checkpoint establish only this controlled synthetic privacy-tail contract.
A restored database's ledger or a signed old tail cannot prove newer history is absent outside
it. Actual independent custody, current complete watermark, other access/publication safety
histories, object archive, provider outcomes and operator reopening proof remain unimplemented
or unverified. Success still reports `independentArchive:"unverified"`, `runtimeReopened:false`
and global quarantine.

## Verification boundary

Disposable tests cover stale/revoked authority, changed sources/policy/scope, unknown policy,
held retention, one-effect reconciliation, own-party isolation, client/export revocation,
optional-copy removal, queued alert cancellation and signed tail failures/replay. Native and
enhanced browsers commit a real POST, deliberately lose the response, recover with the issued
key and check truthful partial outcomes and narrow layout. These checks establish no deployed,
provider, archival or human acceptance.
