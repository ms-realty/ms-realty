# Owner pilot on protected staging

The pilot is a supervised review of one qualified main build. Its purpose is to let the
owner judge listing review, case continuity and calendar work while recording unresolved
business decisions. It does not authorize production cutover or satisfy owner acceptance
before the owner has exercised and signed off the workflows.

## Entry conditions and evidence

Use only the three Access-protected staging hosts. Keep anonymous access denied, all
responses noindex, private storage isolated and the production launch gates blocked.
Record the main commit, application tree, successful source/browser CI, immutable image
digest, provider-observed web/worker/migrator identities, migration receipt and database
schema. The same candidate must serve all three hosts. Reconcile an uncertain migration
with its receipt before taking any further action.

Use the existing first staging manager. Preserve that identity, invitation acceptance and
enrolled passkey. ADR 0005 requires one verified staff
passkey; backups are optional. Sensitive actions still require fresh passkey verification.
The operator must not manufacture a passkey ceremony or an owner's decision.

Bind the execution record to the candidate before the walkthrough. Record each actual
result and its receipt; leave unexercised rows pending. A source test, screenshot or health
response cannot stand in for a deployed workflow or human acceptance.

## Walkthrough sequence

| Task | Expected result | Evidence to retain |
| --- | --- | --- |
| Sign in as the existing manager | The saved passkey opens the staff workspace; no second key is mandatory. A signed-out visitor cannot enter it. | Host, actual role, readback and any unresolved enrollment error. |
| Review the imported inventory | Frozen identities, source links and recorded facts remain visible. Unverified facts, rights and translations remain held. | The exact listing reference and source URL; review decisions and reviewer. |
| Review current source differences | New source identities and absent frozen identities are handled individually. Conflicting prices and reused references receive explicit decisions. | Completed source-review rows with supporting evidence. Absence never implies sold. |
| Follow an owned inquiry into a case | The brief, interests, next action and ownership remain on the same scoped record. Reopening the case preserves submitted state. | Inquiry/case identifiers and command receipts. Use a clearly labelled pilot record. |
| Check case visibility | Authorized staff see the record; a client sees only the case access actually granted to that client. Revocation removes that access. | Grant and revocation readbacks with the affected scope. |
| Request and confirm a viewing | A tentative request remains distinct from a confirmed appointment. Host and resource conflicts are visible before confirmation. | Request, confirmation and conflict receipts; host, resources and time zone. |
| Move or cancel the appointment | The updated calendar and case agree. Cancellation releases the booking; exported ICS reflects the reviewed event state. | Before/after state, ICS UID and revision, cancellation readback. |
| Review a proposed reply or calendar email | The human can edit and inspect the exact recipients, text and attachments before approval. No message leaves during an unapproved pilot. | Preview and approval state. A provider-send test needs a separately approved controlled recipient. |
| Check assistance and manual completion | A draft is clearly labelled and editable. The same task can be completed manually when the provider is unavailable. | Actual provider result or explicit unavailable state, plus manual completion. |
| Check file handling | Unscanned, infected or unapproved files cannot become public. A clean local fixture is insufficient evidence for the live scanner. | Actual staging scanner/provider result or a visible blocked state. |
| Reopen a case after a controlled runtime restart | Accepted records and command receipts survive; web readiness and the worker heartbeat recover on the pinned candidate. | Accepted record, restart/cold-start observations and post-restart readbacks. |

Use pilot contacts and records that the owner has approved. The operator may inspect and
prepare drafts under existing authority. Customer messages, publication and legal or tax
approval require their respective explicit human actions.

## Source review packet

The operator packet contains a URL ledger, listing observations and price differences.
Every human decision cell begins blank. The URL ledger preserves duplicate frozen source
spellings and includes both deployed protected routes and exclusions. A retained source
page is not an approved equivalent or an approved translation.

The listing sheet keeps frozen catalog rows separate from current source observations.
Those rows must not be counted as distinct properties or merged merely because references
look alike. Verify price, currency and rent period, area, bedrooms, location, reference,
availability, seller/source authority, photo rights and approved locales. Preserve the raw
observation and attach evidence for each correction. Bulgarian remains the source default;
public translations require human approval before indexing. Sandanski is inland.

The packet manifest records source hashes and row counts. The final execution record adds
the selected main commit and deployed digest. Technical source/photo readbacks do not fill
human review cells or change the production readiness authority.

## Recovery and rollback review

The selected PostgreSQL 16.14 rehearsal and a real encrypted staging snapshot restore are
separate evidence. The live restore must compare every table and durable object, revoke
restored credentials and prove startup remains quarantined. A matching restore is useful
proof but is not a sealed independent recovery point.

Architecture §17.3 and owner-approved ADR 0006 additionally require an EU R2 archive under
separate administration, an encrypted copy and keys outside the application account,
retention approval, an independent safety tail and watermark, named operator and separate
reviewer, signed evidence and controlled reopening. The plan lives in
`deploy/recovery-archive/`. Its proposed retention is not approval. Existing same-account
Cloudflare storage does not establish separate recovery custody.

Application rollback must preserve writes accepted after the previous build. Do not restore
an older database as an application rollback. Any unavailable independent destination or
unreconciled external action keeps the restored environment quarantined.

## Exit and handoff

The owner records accept, rework or blocked for each exercised task, with the candidate,
record identifiers, evidence, reviewer and unresolved issues. The technical owner records
which provider, recovery, load, security and content proofs remain open. Unexercised steps
stay pending; generated approval rows and successful CI cannot sign on a human's behalf.

R00 authority and the applicable R01–R09 evidence must be complete before R10 cutover
attestation. Production cutover and R11/R12 operational acceptance follow their own gates.
`production/data/launch-readiness.json` and the launch input checklist remain the current
launch authority. Search Console, Yandex Webmaster and backlink exports are optional
historical analytics, not pilot or launch requirements.
