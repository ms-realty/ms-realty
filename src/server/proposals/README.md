# Revisioned proposal coordination

Staff create and review proposals at `/{locale}/proposals`; a Case Interest links to
`/proposals/new?case={id}&interest={id}`. Clients see only their submitted exact-party revisions
on their host at `/proposals/{id}`. Drafts and internal review notes are excluded. Submission
records in-app availability; it does not send mail, collect a legal signature or conclude a sale.

Terms retain amount, currency, payment basis, conditions, inclusions, exact parties, deadline
and the approved property source. A material edit creates a new immutable revision and requires
a new human review. Commands validate live sessions, current capabilities and record scope,
expected version, source eligibility and current review before recording the mutation and its
audit. UI writes use same-origin actions and signed idempotency envelopes.

Each client response is append-only and belongs to the client's own party and one exact
revision. One party's acceptance never sets overall agreement. `agreed_for_next_step` requires
acceptance from every required party in that revision and
`assertCaseAgreementReady(db, caseId, { proposalRevisionId })`. The gate requires the current
approved country/process policy, all required party checks and signed agency service agreements.
Missing, expired or superseded evidence blocks the transition. Counteroffers never overwrite
the response or revision they answer. Closed or revoked access is checked again before replay.

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  npx vitest run src/server/proposals/proposals.int.test.ts \
  src/server/proposals/terms.test.ts --maxWorkers=2

TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  NEXT_DIST_DIR=.next-proposals-e2e E2E_PORT=3161 \
  npx playwright test e2e/proposals.spec.ts
```

The synthetic positive fixture uses the real policy, agreement, checklist and review commands;
it is never live legal, operator or launch evidence. Browser coverage includes exact revision
responses and client document downloads with immediate grant revocation. The present proposal
editor selects the principal interested party and the recorded seller/landlord. General editing
of additional required co-parties and external professional or email workflows remain pending.
