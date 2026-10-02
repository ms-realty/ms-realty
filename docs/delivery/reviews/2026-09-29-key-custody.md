# Key custody implementation review

Direct review in this delivery session, not an independent-agent audit. Scope: new agency
key register and a shared native-select height correction confirmed in the running app.

The register is manager-only by default through a separate global capability. Every service
entry point requires a live staff session, current membership and two passkeys. Record-scoped
grants do not expose the global register. A selected staff holder is checked for current
identity/membership/passkeys without receiving register privileges. State transitions recheck
the operator after the row lock and expected revision; durable operation identities protect
replays. Immutable set identity and event triggers preserve history. Return remains possible
after holder offboarding; current names can still identify that historical holder.

Reviewed evidence is operator input, not an automated claim of physical possession or entry
authority. Tags are normalized and unique, receipt references are never fetched, private
addresses/access codes are excluded from the schema and audit stores a digest. Overdue keys
stay checked out. Owner-returned sets are terminal. All forms use existing native operation
envelopes, origin/host checks, retained failure values, cleared confirmation and actor-bound
receipts. No public/client surface, AI capability or outbound action is added.

Validation: six new PostgreSQL tests cover duplicates/replay, immutable records, concurrent
issue/loss, missing physical review/holder/deadline, overdue retention, revoked holder return,
loss/recovery/terminal owner return, and denied broker/client/scoped/revoked access. Full local
check passed 1243 tests in 125 files, lint/types/build (two explicit real-scanner skips).
Twenty-four final browser journeys passed across three profiles, including native forms and
related mail/ICS/complaint regressions. The final mobile screenshot was inspected; controls
fit the viewport and the native select is at least 44px high.

The first integration failure was a test grant missing its required reason. Initial browser
fixtures queried a lower-case tag despite documented uppercase normalization and used the
public form's error title instead of the existing private form's title. These expectations
were corrected against the stored row and actual accessibility tree; application checks were
not weakened. A later sizing assertion reproduced the real WebKit 27px select defect. An
explicit height probe produced 44px while preserving native appearance, and the production
class plus fresh build passed the final unchanged minimum-size assertion. Earlier logs remain.

Evidence: `/Users/ivan/Code/.artifacts/ms-realty/key-custody/20260929`. Outstanding: Linux CI
for this revision, automated reminders/deadline amendments/partial-set splits, full offboarding
orchestration and approved design/runtime/operator qualification. No launch gate is claimed.
