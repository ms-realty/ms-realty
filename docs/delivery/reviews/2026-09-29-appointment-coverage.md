# O23 / UX18: appointment coverage during absence and offboarding

An open appointment hosted by an unavailable employee now appears in agency coverage and
that employee's retained-work list, even when another broker owns the Case. A scheduled
absence is visible in coverage before it starts when it overlaps the booked host interval,
including the recorded travel buffer. Appointment confirmation checks that same interval.

The queue leads to the calendar record. Its warning preserves the confirmed arrangement,
participants and resource reservations; it does not cancel, reschedule or assign another host.
Returning the employee to availability removes the derived warning. Replacement-host
acceptance still needs a separate workflow and qualification.

Visibility requires both Case-read scope and appointment-management scope, applied before
pagination. Access administration alone does not disclose appointment details. Closed,
cancelled and completed records do not enter this open-work queue. Staff copy is available
in BG/RU/EN and remains subject to human language review.

## Local evidence

Artifacts: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`.

- `appointment-coverage-tests-green.log`: 20 PostgreSQL tests passed across six files. Includes
  future absence during travel buffer, revocation, terminal-state exclusion, independent Case
  and appointment permissions and pagination beyond 25 records. The initial two failures were
  missing explicit fixture grants; production roles were not broadened.
- `appointment-coverage-linux.log`: fresh Linux production build and 48 browser scenarios
  passed across Chromium desktop/mobile and WebKit mobile. Includes absence, offboarding and
  task handover, with JavaScript on/off.
- `appointment-coverage-linux-final.log`: after screenshot review repaired two adjacent
  calendar links and suppressed an empty requested-window section, a fresh build and all six
  appointment journeys passed. They exercise 320px and BG/RU/EN, native forms, return/cancel
  and unchanged booked resources. The final WebKit JS-off screenshot was inspected.
- TypeScript and lint passed. The scoped mechanical UI detector returned no findings.

Correctness review retained the exclusive interval upper bound and current-revocation check;
spec review mapped the change to architecture §6.6 and O23/UX18. These are bounded local
checks. Exact committed-head CI and live operating acceptance remain separate. No launch
authority, provider configuration or production data was changed.
