# UX18 — explicit receiving host from agency coverage

An authorized staff member can now accept the recorded viewing from coverage as its new
host. The receiver reviews the arrangement and travel interval, confirms property access and
their own external calendar, and records a reason. Current scope, two passkeys, fresh
authentication, appointment revision and availability are checked at execution. The command
cannot assign another person or displace an available existing host.

The broker reservation moves atomically. Existing time, participants, logistics, property
reservation, Case ownership and task promises remain unchanged. Ordered resource locks and
the PostgreSQL exclusion constraint prevent conflicting concurrent acceptance. Missing or
inconsistent booking intervals fail closed. The calendar UID is retained and SEQUENCE
advances; existing version-bound email approvals require renewed review. No email is sent by
accepting hosting. [Behavioral contract](../contracts/appointment-host-coverage.md).

## Evidence

Artifacts: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`.

- `host-directory-tests.log`: eight tests passed, covering seven host checks and the late
  Case-recipient regression. Includes idempotent replay, two receivers competing for one
  viewing, one receiver competing for overlapping viewings, travel-buffer conflict/absence,
  lost access, explicit review, current coverage, resource consistency and fresh authentication.
- `host-regressions.log`: 47 PostgreSQL checks passed across six files, including appointment,
  Case lifecycle, coverage and reviewed calendar/email behavior.
- `host-integrity-tests.log`: all eight focused host checks passed after adding the mismatched
  booking-interval guard. The initial focused run's one failure was an invalid test query for
  an operation column; that fixture/assertion error was corrected, not a production schema.
- `host-browser.log`: fresh Linux build and 27 host/linked/Case/task handover checks passed.
- `host-conflict-browser.log`: six additional conflict journeys initially failed because a
  known rejection kept the form locked. The reason is now retained, checkboxes cleared and a
  new operation identity issued for explicit resubmission; unknown outcomes remain blocked.
- `host-integrity-browser-final.log`: fresh build of the final source and all 12 host happy
  and conflict/review/retry scenarios passed across Chromium desktop/mobile and WebKit mobile,
  with JavaScript on/off. The initial form was exercised at 320px in BG/RU/EN; screenshots
  were inspected. Staff translations still need human language acceptance.
- Lint and TypeScript passed; the scoped UI detector returned no findings. Exact-head CI is
  required separately. Prior `f39770b0` CI failed as recorded in the linked CI review.

Correctness review checked transaction rollback, stale version and actor-bound receipt paths,
exclusive intervals, absence through the travel buffer, permission reevaluation and the lack
of outbound sends. Spec review follows architecture §6.4/§6.6 and UX18. This covers receiving
existing coverage work; planned handover between available hosts and notification policy/
acknowledgement remain separate. No production migration, provider activation or launch-gate
change occurred.
