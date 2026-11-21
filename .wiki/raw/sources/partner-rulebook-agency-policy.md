# MS Realty agency policy and rehearsal excerpts

> Source: [ADR 0011 at the accepted revision](https://github.com/ms-realty/ms-realty/blob/6928f80f3091738b2b716868c4fc72be1c167d2f/docs/adr/0011-platform-direction.md), [ADR 0007](../../../docs/adr/0007-public-butler-chat.md), and the earlier local rehearsal notes.
> Collected: —
> Published: —

## ADR 0011, sections 4 to 6

### 4. One decision per outcome

A person makes one recorded decision for each outcome; the system does the checking and keeps the
trail. Supporting documents are evidence a brand may require, not a universal gate.

- Publishing a listing: one attested decision (ADR 0012).
- A deal: one shared path from first contact to keys, closed by a recorded completion (ADR 0013).
- A brand that wants stricter rules (independent review, documents before publication) turns them
  on in its tenant policy.

### 5. Butler acts within levels

Butler moves from draft-only to four levels, set per task and per brand, in the HELM vocabulary:
Watch, Suggest, Ask me first, Act.

| Level        | First brand default                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Act          | Answer visitor questions from approved public content (ADR 0007); acknowledge every inquiry at once in the visitor's language; remind people of viewings and due steps; tell the client when a deal step is done |
| Ask me first | Replies to clients with new content; proposed viewing times; a translation going public                                                                                                                          |
| Suggest      | Summaries, matches, next actions, listing text                                                                                                                                                                   |
| Never        | Price, offers, terms and conditions, contracts, money, publication and withdrawal, access, cancellations, legal, tax and process conclusions                                                                     |

The owner confirmed the Act row for public answers and inquiry acknowledgements when this ADR was
written.

Every action Butler takes has a receipt and a manual path, uses only approved facts, and stops at
one switch per brand. A task reaches Act only with an evaluation set that passes for the exact
build. The "Never" row is the pack's human-only catalogue and no approval lifts it.

### 6. Five launch checks

These replace R00–R12 as the launch authority. Each is checked on the exact build that goes live.

| Check      | Passes when                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Works      | CI is green on the commit, and on the deployed build a visitor can search and send an inquiry, a broker can sign in and a client can sign in  |
| Data safe  | A backup of the production database restores into a scratch database, the media count matches, and the legacy site archive is stored off-site |
| Found      | Every legacy URL answers as `data/legacy/url-decisions.json` says                                                                             |
| Lawful     | The privacy notice, consent behaviour and retention policy are in force, and only human-approved languages are indexable                      |
| Reversible | The cutover and the return to the legacy origin were rehearsed on staging                                                                     |

The owner gives the production go. Merges to `main` still never deploy production. Staging follows
`main` and is where people try the product.

## ADR 0011, consequences excerpt

- Rules kept from the earlier authority: property facts are preserved exactly; a translation is
  public only after a person approves it; Sandanski is inland; legacy URL decisions rest on recorded
  evidence.

## ADR 0007, public answer scope

A public Butler chat may answer visitors on listing, area and guide pages from approved public
content only. It names its source, says what is unknown, hands off to a broker, and gives no view
on price, money, legal or tax questions. Its role is limited to the in-page answer and hand-off.
Inquiry acknowledgements are a separate Act task. To enable public chat, the brand needs an
accepted policy, a passing exact-build evaluation, a receipt, a manual path and a switch that
stops the task.

## [Architecture, viewings and calendar](../../../docs/architecture.md#64-viewings-and-calendar)

Public UI offers preferred windows or a request, not instant confirmed slots. States are `requested`, `proposed`, `confirmed`, `completed`, `declined`, `cancelled`, `reschedule_requested`, and `no_show`. Tentative proposals are visually different from confirmed arrangements.

Before confirmation, validate current Interest/Listing eligibility, host, property access permission, participants, local time, working hours, travel buffers and internal resource conflicts. Store occupied resource intervals for broker and property access; use transactional exclusion/locking so simultaneous confirmations cannot double-book the same resource. Group viewings require an explicit shared appointment, not overlapping independent bookings.

## Earlier viewing rehearsal

MS Realty · Does the buyer know whether a viewing is booked? In a rehearsal, ask a buyer to request a preferred window and retry the submission. Look for one receipt, one inquiry for the agency and a buyer who can explain the next step. Count duplicate cases and mistaken beliefs that a slot is confirmed. The agency checks availability and property access before confirming a real viewing.

## Earlier contributor instruction, superseded by ADR 0011

- A person owns publication, indexability, customer sends, booking, access changes,
  cancellations and decisions about price, offers, contracts or conditions. Butler has no
  capability to execute or approve them. A separate accepted policy and release proof are
  required before any autonomous routine action is enabled.
