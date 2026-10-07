# Case and appointment continuity (S4)

This slice implements a durable path from an assigned Inquiry to an owned Case, revisioned
Brief, property Interests, in-app conversation and appointments. The current database schema,
capabilities and state machines remain authoritative. No migration from PR275 is imported.

## Routes and commands

The staff host exposes `/{locale}/cases`, `/cases/new?inquiry={id}`, `/cases/{id}`, `/calendar`
and `/calendar/{id}`. Inbox detail links to qualification after the broker accepts ownership.
It also lists `listInquiryCaseCandidates`; `/inquiries/{id}/link?case={caseId}` reviews
`linkInquiryToExistingCase` (O03L), and `?key={operation}` shows the actor's own result (O03LR).
Candidate rows carry a server-owned `blockReason` when linking is unavailable. `partyLabel`
is present only for an exact live Party participant; a contact-route match has no identity label.
The client host exposes `/{locale}/overview`, `/properties`, `/appointments` and `/messages`,
with record detail below each collection. These routes resolve only records within current
access. Shared navigation uses the existing private shells.

`commands.ts` provides `createCaseFromInquiry`, `updateNextAction`, `reviseBrief`, `addInterest`,
`respondToInterest` and `postCaseMessage`. Appointment commands are in
`../appointments/service.ts`: `requestAppointment`, `arrangeAppointment` and
`respondToAppointment`. Each takes `(db, session, input)`; input includes `id`, `operationId`
and `expectedVersion`. The actor is resolved from a live session, never a posted identity.

All commands authorize before idempotency lookup and again in their locked transaction.
Record versions, mutation, audit/activity and outbox events commit together. The UI uses
same-origin Server Actions, host-specific sessions and scoped signed operation keys. A lost
response retains its key; action status checks authorize the record again. A stale revision
retains the draft and requires review of the current record before a new intent.

Case qualification binds the original Inquiry party explicitly; contact matching does not
grant access or authority. Existing Inquiry tasks move to the Case without losing their
owners or outcomes. Seller/landlord authority remains self-declared until the separate,
document-backed property relationship review. A Brief revision is broker interpretation;
this workflow never records client agreement on the client's behalf. A client requests
changes through the conversation. Internal next actions are restricted by
`case.read_internal`; client next actions come only from an explicit client-visible summary.

Interest suggestions use an approved published source revision. Client feedback has its own
version, retains the assessed listing revision and never changes the Case stage implicitly.
For buyer/tenant Cases, `reviseBrief` may save validated structured hard filters alongside
the prose. A prose-only revision clears older filters. Staff-only `readCaseMatches` binds the
current Brief revision to eligible public search results, separating confirmed facts from
facts needing confirmation; it never treats an unknown as a hard match or searches historical
offers. A continued page must name the Brief revision it started from and conflicts after a
revision change. The read model returns client acknowledgment so a draft Brief remains visible.
Each result includes only applied, verified hard keys in `confirmedCriteria[]`; `unconfirmed[]`
names unknown keys, including `availability` when the presented state requires confirmation.
It also includes `existingInterestId` for that Case–Listing relation, or null, from the current
result page; the idempotent Interest command remains the final duplicate guard.
Staff-only `readCaseCandidate` inspects one currently public reference against a required Brief
revision and returns its public card, confirmed keys, known hard violations and facts needing
confirmation. A known hard violation ends the fit claim; `confirmedCriteria[]` and
`unconfirmed[]` are then empty because other facts were not fully assessed.
It cannot turn an unpublished or stale candidate into an Interest or a public recommendation.
For every new buyer/tenant Interest, `addInterest` requires current structured Brief criteria
and `matchReview` with the reviewed Brief revision, public manifest, presented availability,
exact violation/unknown keys and explicit review.
The command recomputes that assessment inside its idempotent operation and rejects changed
snapshots, unknown facts, non-offered listings and a different transaction purpose. A
hard-violating alternative requires `alternativeDecision: "propose_despite_mismatch"` and a
broker explanation of at least 20 characters; the recorded Case event retains the assessment
and explicit decision. Human review of the explanation remains a staff responsibility.
The staff workbench still has to bind this read model and explain any proposed alternative
before O07 can pass journey acceptance.
Staff messages intended for clients require an explicit human review bound to the exact
body and recipient snapshot. In-app availability is recorded without claiming email delivery
or a read receipt. Internal notes are separate. Current case access and original recipient
membership are both required to read client messages; joining later does not reveal earlier
messages. No provider dispatch or external-send action is created.

## Appointments

Requests contain a preferred window and an explicit appointment participant. They reserve
nothing. Confirmation requires current published listing availability, an active authorized
host and case participant, an approved Europe/Sofia service-hours policy, an explicit property
access check and an explicit external-busy check. This slice schedules Bulgarian properties.
The accepted service-hours policy shape is `{ "mon": ["09:00", "18:00"], ... }`; unsupported
shapes fail closed. Times must carry the correct Sofia offset (`+02:00` or `+03:00`). Spring
gaps and incorrect seasonal offsets are rejected; the offset distinguishes autumn repeats.

Confirmation locks broker/property resources in stable order and creates buffered exclusive
Postgres intervals. A pending reschedule retains the previous confirmed slot and its resource
reservation until a replacement commits. Cancellation and completed/no-show outcomes release
resources. Completion/no-show need a past end time and a factual note. Client response
capability permits requesting a change or cancellation, not staff confirmation or attendance.

Authenticated `GET /{locale}/calendar/{id}/calendar` on staff and
`GET /{locale}/appointments/{id}/calendar` on client export `text/calendar`, private/no-store.
Exports recheck access, preserve a stable UID and increase sequence on confirmation changes
or cancellation. A request has no calendar export. Files contain the recorded times and
reference, never private access instructions, and do not send invitations. Client access
instructions are limited to the confirmed appointment's participant, from seven days before
through one day after the recorded slot; revocation or cancellation removes access.

## Verification

Use a disposable PostgreSQL 16.14 database. The integration helper creates and drops a separate
UUID database per suite; the browser harness creates its own run database.

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  npx vitest run src/server/cases/cases.int.test.ts \
  src/server/appointments/appointments.int.test.ts \
  src/server/appointments/time.test.ts --maxWorkers=2

TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  NEXT_DIST_DIR=.next-cases-e2e E2E_PORT=3159 \
  npx playwright test e2e/cases.spec.ts
```

Integration coverage includes immutable Brief revisions, carried commitments, internal-field
denial, audience snapshots, revocation before replay, booking races, preserved reschedules,
DST and calendar sequence/cancellation. Browser coverage exercises staff qualification,
client feedback and a real request/confirmation/change/cancel flow, then message isolation and
revocation. Identity ceremonies are covered by the identity suite; these browser fixtures use
synthetic valid sessions. Private localized copy remains an unreviewed draft. These checks do not
establish production, provider, operator, language or release acceptance.

## Lifecycle and exact owner preview

Staff `/{locale}/cases/{id}/continuity` records guarded stage changes, dispositions and broker
handover. Stage evidence is read from current records; posted checkboxes cannot supply it.
Clients acknowledge the exact current Brief using `portal.brief.acknowledge`; revising the
Brief removes that acknowledgment from the new revision. Client proposal requests retain the
exact Interest and current offer source. Proposal agreement and coordination call the shared
compliance gate; completion also requires reviewed completion evidence and the applicable
recorded listing outcome. Closing a Case never declares a transaction completed or erases it.

A handover remains pending until the named receiving broker accepts the exact current work
snapshot. The acceptance rechecks access, transfers the prior owner's open tasks atomically,
and preserves other owners and appointment hosts. Any changed commitment requires review of
a fresh snapshot. Closeout requires each open commitment to be resolved, retained with its
recorded outcome, or handled through the explicit handover. A waiting Case has a dependency
and future review time. Reopening records its reason and owned next action without replacing
the immutable prior closeout history. Retention remains enforced by the compliance service.

For seller/landlord Cases, staff explicitly bind a selected current reviewed Seller Instruction
on the continuity page. The instruction must match the participating owner, property, current
authority and exact terms; an existing binding to another Case cannot be silently replaced.
The client Case then links to `/{locale}/properties/{caseId}/preview?listing={reference}`.
The preview uses the current approved Bulgarian source, factual values, terms, public location
projection, media, disclosure and instruction scope. Original object keys and private addresses
are never returned. Authenticated `/preview/media/{assetId}` reads serve only the exact reviewed
derivative, rechecking current authority and snapshot digest with private/no-store responses.

`acknowledgeOwnerPreview(db, session, input, storage?)` requires a fresh active owner session,
the current primary seller/landlord party, `portal.listing.acknowledge`, an exact preview hash
and expected Case version. It verifies the reviewed image bytes, then records a client-authored
approval with the operation, audit and Case update in one transaction. No acknowledgement is
seeded and no publication command is invoked. Changes to the facts, terms, source, instructions,
disclosure, media, authority or participant make the prior decision unusable. Seller marketing
requires a current acknowledgement; publication still requires the separate staff command.

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  npx vitest run src/server/cases/lifecycle.int.test.ts \
  src/server/cases/owner-preview.int.test.ts --maxWorkers=2

TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  NEXT_DIST_DIR=.next-owner-preview-e2e E2E_PORT=3163 \
  npx playwright test e2e/owner-preview.spec.ts
```

Proposal revisions and party responses are documented in `../proposals/README.md`. Client
documents use the identity team's safe document projection and current document-specific
grant, with fresh-auth recovery at `/access/reauth`; generic Case access never grants downloads.
External calendar synchronization and authorized invitation email dispatch remain outside this
module. Synthetic tests establish the bounded workflow only, not operational or launch approval.
