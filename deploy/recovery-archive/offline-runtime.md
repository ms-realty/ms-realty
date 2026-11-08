# R08 / AT64 Phase D offline archive

This is a dormant implementation candidate, with deterministic offline and native
storage tests. It does not activate replication or qualify R08. Coverage is always
`incomplete`, currentness is always `unknown`, and `archiveBarrier` is always null.
The source DB, release policy, launch authority and existing Worker protocols are
unchanged. Ivan remains the sole human operator and reviewer.

The implementation follows the [recovery archive contract](../../docs/delivery/contracts/production-recovery-archive.md).
Its separate private recovery Worker and SQLite Durable Object are an offline
implementation selection. No deployed namespace, EU residency, credentials, custody,
recipient, provider role or resource approval is established by this code.

## Entry and authority boundaries

`scripts/recovery-archive-worker.ts --validate-offline <file>` accepts only the strict
fixture admission shape shown in [offline-inputs.example.json](./offline-inputs.example.json).
Run it with `node --import tsx`. It reads that local file and reports a plan digest;
it does not connect to a database, instantiate storage, sign, schedule or execute work.
The example uses synthetic identities and hashes and cannot select real resources.

`replicateOnce` is an explicitly injected, bounded iteration. Its selected admission
digest, source reader, public encryption profile, durable spool, transports, recovery
signers and coordinator come from its caller. There is no environment loader or
application caller. `loadProductionArchive` always rejects. No queue, cron, alarm,
route, startup hook, replay or business-command retry is installed.

`gateway/recovery-coordinator.ts` always returns 503 from the public Worker entry.
The disabled configuration has no routes, Durable Object binding, migration or
provider account. The class's private fetch handler is exercised only with explicit
offline fixture environment values in a local test harness. It admits signed
`reserve`, `prepare`, `copy`, `advance`, and challenge-read requests at the pinned
origin. There is no bootstrap, source admission, source closure, route mutation,
SQL, shell, deletion, retention, send, publication, restore or reopening request.
The test harness seeds its own generation-zero fixture; shipped code never does.

Trust roots are caller-owned pins indexed by recovery purpose, subject and key ID.
Strict signed bodies reject request-supplied roots and execution-purpose credentials.
Responses bind context, authority namespace, EU jurisdiction, incarnation, restore
ID, isolated destination and a fresh one-use challenge. Cacheable, redirected,
oversized, mismatched or unsigned responses reject. A current-authority read does
not prove source currentness.

Every head is bound to the selected admission and an independently retained
incarnation/generation/digest floor. Missing authority, lower generation, changed
incarnation or missing floor ancestry rejects. The reader serializes observations
and requires successful outside-account receipt retention before returning a result.
Real custody must load the newest retained floor on restart; this package supplies
an injected retention interface, not a production custody mechanism. A challenge
alone cannot discover every administrative rollback or a lost external floor.

## Source, ciphertext and copying

The journal remains the durable work source. A separate read-only repeatable-read
transaction reads committed entries. Another read-only transaction checks the exact
committed entry and immutable private payload, including canonical UTF-8 bytes,
context, effect kind, subject, byte length, digest and v1 or C1 v2 codec. No source ACK
or mirror is written. Uncommitted outer transactions are invisible. Missing payloads
and unknown writer/object coverage stay unresolved.

The coordinator reserves one exact contiguous range at its predecessor and retains
the authenticated source observation. Different segmentation at the same cursor
conflicts. Sequence/digest and transaction identities cannot fork. Canonical source
and descriptor selection precede destination I/O.

`PreparationStore` requires an explicit private real directory. The candidate
encryption profile uses installed `jose` 6.2.13 General JWE, RSA-OAEP-256 and A256GCM,
with independently selected public recipient fingerprints and the scope digest as
authenticated data. This is a standard offline candidate profile, not an approved
production profile or proof of recoverable private-key custody. No private recipient
key or plaintext body is written to the spool.

Preparation writes a retained attempt, fsyncs ciphertext, installs it without
clobbering, writes and fsyncs the descriptor, links one winning descriptor and fsyncs
the directory. Restart opens and remeasures that exact selected ciphertext. Lost or
corrupt selected bytes stop replication; uncertainty never grants permission to
reencrypt them. Unselected interrupted attempts may prepare again only before a
descriptor has been selected and before any upload; their artifacts remain retained.
There is no automatic cleanup, expiration, compaction or orphan deletion.

The runner retains the exact PUT identity and signed coordinator intent before
effects. Lost coordinator responses are reconciled with one bounded resend of the
same signed request, whose immutable terminal record is read before a mutation.
After another failure, the retained request remains unresolved and available for
exact reconciliation. The caller owns iteration/cursor management; no daemon or
automatic recovery planner is provided.

The EU R2 adapter uses the fixed private EU S3 endpoint, explicit credentials,
conditional single PUT, one SDK attempt and no region redirect. The outside-volume
adapter requires its explicit private directory, checks each namespace component
before descent, fsyncs parent directories and never overwrites an existing object.
Its logical destination ID does not prove physical separation, actual persistent
storage, retention or custody. A temporary fixture directory is not a production
fallback or evidence of an outside-account copy.

Every acknowledged object requires a full GET of actual bytes and measured hash and
size. A 412 or exact 409 `ObjectLockedByBucketPolicy` can be reconciled against the
same object. Other 409s reject. A timeout followed by 404 stays unknown; a later exact
GET establishes present-identical ciphertext, not the original PUT acknowledgment.
Create/reconciliation and readback receipts remain separate and authenticated for
their exact destination, scope, key, ciphertext and attempt.

## Durable progress and supported bounds

Native SQLite synchronous transactions atomically check the predecessor and write
the next head, immutable terminal receipt and current head. Authentication and I/O
finish outside transactions; bindings and the predecessor are revalidated inside.
Native tests reopen the persisted workerd namespace after response loss and injected
failures at each commit stage. In-memory mocks are not native durability evidence.

Internal stream prefixes describe progress from the admitted anchor. An anchor
prefix can mean no new bytes were copied. It is not a point watermark. Without an
independently selected real point, `packet` is null. With a selected point, public v2
prefixes remain null at each destination until all four point components have exact
copy receipts there. Segments then advance only contiguously, with every referenced
restrictive payload. Missing earlier bytes block later receipts from advancing a
prefix. No dummy point or fabricated component receipt is introduced.

| Bound                                         | Behavior                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| Entries per source batch                      | Explicit 1–1000; no partial entry or silent truncation                        |
| Plaintext/ciphertext object                   | Explicit maximum up to 8 MiB; JWE expansion must also fit                     |
| Source observation/history and projected head | At most 1 MiB canonical metadata; stop before native row overflow             |
| Signed request/response                       | At most 2 MiB; incoming/outgoing HTTP reads are bounded before full buffering |
| Selected ranges                               | Explicit maximum up to 1000, also subject to cumulative metadata bound        |
| Recipients                                    | 1–8 pinned RSA public recipients, at least 2048 bits                          |
| Upload                                        | One conditional PUT per attempt; full bounded streaming GET; no multipart     |
| Larger point artifacts                        | Unimplemented; no automatic splitting, compaction or alternate format         |

The first runner slice prepares journal segments and restrictive payloads. Tests can
inject exact small selected point-component descriptors and copy evidence to exercise
v2 semantics. It does not stream real dumps, complete a point snapshot, supply a
closed barrier, execute a restore or replay business operations. A fully copied
supplied open/lost/unknown prefix still requires quarantine.

## Verification and remaining admission

Use Node 24, installed dependencies, `npm run typecheck`,
`npx tsc --noEmit --project gateway/tsconfig.recovery.json`, and the archive/coordinator
Vitest files. Native tests use local Miniflare/workerd SQLite and delete only their
owned temporary fixture directories. PostgreSQL tests use the repository's canonical
migrations in uniquely named databases on an explicitly selected disposable server.
They include actual C1 grant/session denials remaining effective with unchanged
saved receipts during archive and authority outages, then copying on resume.

Fixture signatures, process kills, synthetic storage responses and native local
transactions qualify only their offline contracts. Provider qualification and seal/
restore closure remain unexecuted. Before any activation, a separate exact-scope
packet must resolve actual resource/namespace/jurisdiction and source identity,
complete writer coverage, source/copy/authority roles and denied capabilities,
approved encryption and custody, persistent spool and outside destination, retained
floor continuity, actual copy/readback receipts, live failure exercises and Ivan's
review. No existing retention, staging approval or release gate is upgraded here.
