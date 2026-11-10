# ADR 0015 — Terms agreed by one recorded decision; legal duties are steps on the Deal path

Status: accepted (owner decision). Implemented on `claude/agree-in-one-decision` with migration
`0040_agree_in_one_decision`. Builds on ADR 0011 §4 (one decision per outcome) and ADR 0013 (the
Deal path). Where this ADR and ADR 0008 §5 or ADR 0013 disagree for a brand on the
`staff_attestation` policy, this ADR wins.

## Context

A code audit found that a Deal could practically never reach "terms agreed":

- every agree decision ran `assertCaseAgreementReady`: an approved process review for the exact
  proposal revision, an active process policy backed by a reviewed document, every policy and
  due-diligence item reviewed per party with evidence, and a signed service agreement with
  reviewed documents for each agency client. The test fixture needs three extra grants, about
  eight commands and four reviewed documents for one buyer and one seller;
- evidence documents count only with a clean scan from a live ClamAV;
- every party, the seller included, had to sign in to the client area and agree there;
- a proposal needed a published listing with a current agreed seller instruction;
- a home joined a buyer's Deal only through structured Brief criteria and an exact match review;
- completing a Deal never marked the listing sold or let.

A two- or three-person agency cannot run that. The goal (ADR 0011) is a real deal from first
contact to completion without training.

## Decision

Under the brand's tenant policy the broker's recorded word is the basis, documents are optional
supporting evidence, and legal duties are visible steps on the Deal path instead of walls in
front of "terms agreed".

### Deal policy

`dealPolicy` in `src/config/tenant.ts`, pinned in `tenant.test.ts`:

| Field                           | This brand          | `strictDealPolicy` (kept, tested) |
| ------------------------------- | ------------------- | --------------------------------- |
| `agreementBasis`                | `staff_attestation` | `reviewed_process`                |
| `counterpartyAccountRequired`   | `false`             | `true`                            |
| `shortlistNeedsStructuredBrief` | `false`             | `true`                            |
| `proposalsNeedPublishedListing` | `false`             | `true`                            |

The strict values reproduce the behaviour before this ADR. The existing strict tests run under
them (`vi.mock` of the tenant profile in the proposal, co-party, compliance and matching
integration tests, and `agreement-strict.int.test.ts`).

### 1. Terms agreed by one recorded decision

On a proposal revision that is a draft, reviewed, shown or awaiting answers, the broker records
"Record that both sides agreed" (`recordAgreement`, `src/server/proposals/service.ts`). For every
required party that has not accepted in the client area, the broker records how the party said
yes (in person, by phone, by e-mail, by message) and on which day, with an optional note for the
team and an optional existing Deal document. One side's answer covers every party on that side.

- **Storage.** A broker's record is a `proposal_responses` row with `actor_kind = 'staff'`,
  `decision = 'agree'`, the revision's terms hash, and the new columns `channel` and `given_on`.
  The CHECK that required a document for a staff response now accepts a channel and a date
  instead (`proposal_responses_staff_basis`). A party's own answer in the client area is
  unchanged and counts the same.
- **One operation.** The revision walks the proposal state machine with its guards in the same
  transaction: a draft gets its exact-terms approval and is shown to its parties, then reaches
  `agreed_for_next_step`. The Deal path is created from its template, as ADR 0013 says.
- **Exact revision.** Answers bind the revision and its terms hash. A counteroffer or a broker's
  revision is a new revision with no answers; recording on the old one is a version conflict.
- **Idempotent and audited.** Through its operation id; audited as `proposal.agreement_recorded`
  with the actor, `basis` (the policy), the parties the broker recorded with channel and date,
  and the parties who answered in the client area.
- **No account for the other side.** With `counterpartyAccountRequired = false` the seller or
  landlord does not need a client account. With `true`, the broker can record only the buyer's
  side and the seller answers in the client area.
- **Strict policy.** `reviewed_process` still runs `assertCaseAgreementReady` on every agree
  decision (client or broker) and requires a Deal document with the broker's record.

### 2. Legal duties as path steps

The template steps in `dealPathTemplates` carry the duty they record (`duty`) and whether they
move money, a signature or the property (`afterIdentityChecks`). Every template now starts with
`brokerage_agreement` and `identity_checks`. Existing Deals keep their recorded copy (ADR 0013).

How each duty maps:

| Duty (source)                                                                                                    | Represented as                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR 0008 §1–2: identify both parties of every sale, and of a letting from EUR 10,000 a month (BG, GR)            | The `identity_checks` step. On a sale it cannot be marked not needed. On a letting it can only below `customerDueDiligenceScope.monthlyRentFrom` (EUR 10,000.00 a month) in EUR; another currency or an unknown rent counts as in scope.                                                                                                 |
| ADR 0008 §3 and §5: the other party before any deposit, preliminary contract, notary deed or handover            | Steps flagged `afterIdentityChecks` (deposit and preliminary contract, contract or lease signed, deposit and first rent, notary deed, registration, keys handed over) cannot be marked done while identity checks are pending. The staff path shows "Record the identity checks before this step." instead of the form.                  |
| ADR 0008: no completed sale with checks open                                                                     | `completeDealFromPath` refuses while an in-scope duty step is not done (`duty_open`).                                                                                                                                                                                                                                                    |
| ADR 0009 §1: a written brokerage contract with the agency's own client                                           | The `brokerage_agreement` step: done with the date it was signed; it cannot be marked not needed (the Deal's client is always the agency's own client).                                                                                                                                                                                  |
| ADR 0009 §4: 14-day withdrawal when concluded online or off-premises; early start only on the consumer's request | Recorded with the step as two answers: signed online or away from the office (yes/no) and, if yes, whether the client asked in writing to start within the withdrawal period (yes/no). Staff see the last day of the withdrawal period (`brokerageWithdrawalDays` = 14 calendar days from signing). Stored in `case_path_steps.details`. |

What is not represented, and stays as described in the earlier ADRs: the content of the
customer check (beneficial owner, PEP and sanctions, source of funds, enhanced check approval;
ADR 0008 §4), the AML journal and its separation (§7–9), the dual-mandate clause (Q114), the
contract content, durable-medium copies, the "Sign with obligation to pay" button and the
client-area withdrawal function (ADR 0009 §2–6), and the publication-time seller check (ADR 0008
§5, a publication change). The order "own client checked before the contract is signed" (ADR
0008 §3) is not enforced, because the path records steps after the fact and one identity step
covers both parties. ADR 0008 §5's refusal of proposal submission until the own-client check is
recorded is replaced, for this policy, by the path rules above; the strict policy keeps the
reviewed process gate in front of the agreement. No step sentence states a legal requirement.

### 3. Broker's pick

With `shortlistNeedsStructuredBrief = false`, `addInterest` without a match review adds any
listing the agency holds for the Deal's purpose (published or not; not sold, let or withdrawn)
with a one-line reason. The Interest starts `shortlisted`, so a proposal can follow at once; the
client can still decline it. Audited as `case.interest_added` with `basis: "broker_pick"`. A
match review still takes the existing matching path.

### 4. Proposals on listings the agency holds

With `proposalsNeedPublishedListing = false`, `offerContext` accepts any listing that is not
sold, let or withdrawn. The terms bind the published revision, else the approved revision, else
none. The seller or landlord is the recorded seller instruction's party, else a seller or
landlord recorded on the property (`property_relationships`), or one the broker names when
making the proposal: a new party and a relationship with authority `not_claimed` and scope
`{ "source": "broker_named" }`, never presented as reviewed authority.

### 5. Sold and let

`recordListingOutcome` (`src/server/listings/commercial.ts`) sets a listing to sold or let through
the domain's commercial state machine and evidence guard, inside the caller's transaction, with
activity, audit (`listing.commercial.sold` / `.let`) and an outbox event. `markListingOutcome`
is the standalone staff command (needs `listing.edit` and a document). `completeDealFromPath`
calls it for the agreed listing of a buyer's (sold) or tenant's (let) Deal, with the completion
as evidence; a listing whose state does not allow it (for example withdrawn) is left unchanged
and the completion still stands. A sold or let listing stops being offered: public search and
place counts show only offered states, and a published page reads sold or let with similar
homes instead of a viewing request. Publication is not withdrawn by this command. The listing
entry names no party; other Deals interested in the same home see only that it is sold or let.

### 6. Staff screens

One action per outcome, in bg, en and ru (`messages/staff/*/dealAgreement.json`): "Record that
both sides agreed" leads the proposal page with the exact price and parties, and the separate
review and show-to-parties steps fold under "Other ways to continue"; "Add a home to this deal"
is open on a Deal without homes and folds away once there is one; each shortlisted home has
"Make a proposal". Native forms that work without JavaScript.

## Consequences

- A small agency reaches "terms agreed" with one recorded decision and completes a Deal with
  its duty steps done; completion marks the home sold or let.
- A brand that wants the reviewed process sets `dealPolicy` to `strictDealPolicy`; nothing of
  the reviewed process was removed.
- Existing Deals whose path was recorded before this ADR keep their steps without the brokerage
  contract step; their identity checks follow the same skip and completion rules.
- A broker's pick of a home that is not published still links the client to the public page,
  which does not show it; the client link needs a private listing view (follow-up).
