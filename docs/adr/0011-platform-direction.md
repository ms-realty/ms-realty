# ADR 0011 — One platform, many brands; outcomes before gates

Status: accepted under the owner's ownership mandate ("question everything inherited, simplify,
replace or remove what does not serve the outcome"). Where this ADR and an earlier document
disagree, this ADR wins: architecture §3.3 (non-goals "multitenant agency SaaS" and the public
chatbot), architecture D12 (draft-only as the ceiling), architecture §20.3 and the files in
`production/data/` as launch authority, and the delivery order in the previous `docs/plan.md`.

## What we found

- The public site of the agency still runs on the legacy system. Nobody outside the team has used
  the rebuild.
- Running the rebuild on the imported legacy data shows an empty public site and 165 listings
  waiting in the staff queue. Publishing one listing needs six separate approvals and two uploaded,
  scanned and reviewed seller documents. A two- or three-person agency cannot do that for its
  inventory, so it cannot launch.
- A deal stops at "agreed for next step". Nothing records the contract, the checks, the deed, the
  registration or the keys, and the client cannot see where the purchase stands.
- Butler only drafts, only for staff, and only when several switches are set. Visitors wait for a
  person.
- Roughly a fifth of the code is release ceremony: thirteen gates, evidence bundles, two-key
  signatures and an offline archive coordinator for a business with one operator. There is no
  production deploy path.
- No competing product covers the path from offer to registered title for a foreign buyer in
  Bulgaria or Greece. The best-supported driver of conversion is the time to the first useful reply.

## Decisions

### 1. The product

An AI-native brokerage platform built by Mindburn Labs. It takes a buyer, seller, landlord or
tenant from the first question to a completed, verified deal, and it lets a small agency run that
whole path without training. MS Realty is the first brand. The HELM property-management pack is the
governance vocabulary (roles, human-only actions, autonomy levels); this application is the
product that people use.

### 2. How we judge it

Three numbers, per brand:

1. time from a visitor's question to a useful answer;
2. the share of inquiries that reach a viewing;
3. deals completed with a recorded outcome.

Work that moves none of them waits.

### 3. Brands

One deployment per brand, configured from `src/config/tenant.ts` (ADR 0010): its own database,
hosts, mail identity and storage. No shared-database tenancy until a second paying brand needs it.
Anything brand-, country-, language- or currency-specific belongs in the tenant profile or in
content, never in a literal.

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

### 7. Frozen

Kept in the repository, not extended and not required for launch: the evidence-bundle system
(`src/release`, `release/`), two-key cutover signing (`scripts/production-cutover.mjs`), the offline
archive coordinator, the R00 candidate contracts, `docs/acceptance.md` and the delivery narratives
in `docs/delivery/`. `production/data/launch-readiness.json` and `launch-input-checklist.md` stay
verbatim as history. They are removed after launch, once nothing reads them.

### 8. Business model to test

A subscription per office that includes the public site, the client area and Butler, plus a fee per
completed deal; identity checks passed through at cost. It is tested with the second brand and no
billing is built before then.

## Consequences

- `AGENTS.md` and `docs/plan.md` follow this ADR.
- Data rules do not change: legacy data stays recoverable, real customer data never enters code or
  tests, and the cutover keeps the legacy origin as the way back.
- Rules kept from the earlier authority: property facts are preserved exactly; a translation is
  public only after a person approves it; Sandanski is inland; legacy URL decisions rest on recorded
  evidence.
