# Inbound email increment review

Scope: new inbound schema/migration, fixed-origin provider adapter, queue integration,
private native forms, Case history, and related tests. Direct review against AGENTS.md,
architecture §9/F13 and `contracts/inbound-email.md`; no independent-agent review claimed.

## Standards

No unresolved findings within the implemented plaintext triage boundary. The signed inbox
stores only provider identifiers before the worker retrieves bounded content. Unknown mail
never creates a Case participant or grants access. Exact record versions, current permission,
participant validity, idempotency, internal audience and attributable review are checked at
assignment. HTML and remote file links are never rendered or fetched. Review cookies are
session/record-bound, HttpOnly and short-lived; they do not restore human confirmation.
Operation receipts bind the current actor, command and exact inbound record.

Review repairs: separate delivery/inbound sweeps; paging for triage backlog; explicit labels
for controls with restored server values; current Case search; rejection of signed receipts
without a provider identity; and restoration of a shared synthetic policy fixture after its
revocation test. Real pg-boss consumption and manual no-JavaScript recovery were exercised.

## Spec

Remaining partial requirements: inbound files are metadata-only (no import/scan/approval or
client forwarding), HTML-only mail requires the approved external mail process, unmatched
mail cannot create a new inquiry from this screen, and live receiving-domain/provider proof
is absent. Outgoing attachments/multi-recipient revisions/cancellation and ICS dispatch
also remain open. Legal, retention and service-policy inputs require current human approval.
This increment does not satisfy full F13 or release readiness.

Evidence: 73 targeted tests; six final native browser cases on three profiles; fresh build
with TypeScript and repository lint passed. The selected WebKit review screenshot was read
back: text remains within the viewport, untrusted markup is escaped, attachment metadata has
no download link, and assignment/rejection remain separate actions. See the contract for
persistent evidence paths and the CI review for the unresolved remote validation boundary.

Full local `make check` also passed: lint, TypeScript, 1224 tests in 122 files and production
build. Two real-ClamAV tests were explicitly skipped because this run did not configure a
scanner; this does not replace earlier real-scanner or future CI evidence.
