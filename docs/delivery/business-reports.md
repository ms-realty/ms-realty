# O22 business reporting

The staff `/reports` page answers bounded operating questions from authorized source records.
It works through native GET filters and ordinary workbench links. `/reports/export` downloads
the same scoped totals in a private, uncached CSV; it contains no record titles, customer
contacts, message contents or arbitrary source values.

Reporting permission intersects the ordinary record and field grants before counts and
samples are computed. A Case shared-summary grant cannot reveal internal next-action or
stage-history aggregates. Each read resolves the current staff session, active passkey and
grants. Opening a drill link resolves the ordinary workbench authorization again.

One repeatable-read, read-only transaction binds the report observations. The sample is
limited to twenty records per measure while the count covers every matching authorized row.
Denied measures return an unknown count, rather than a false zero. Database failures render
an unknown report with a read-only retry that retains the filters.

## Definitions

- Unowned requests are received, assigned or waiting requests without a named owner; the
  coverage queue still owns intake. They are outside the My responsibility scope.
- Overdue promises are open, in-progress or waiting tasks with an explicit client promise
  and an elapsed promised due time. An internal follow-up is not counted as a promise.
- Due next steps require internal Case access and an elapsed next-action or waiting-review
  time on an active Case.
- Completed viewings are appointments currently recorded completed with a confirmed end in
  the selected period. A passed appointment time alone cannot count as completion.
- Stage changes are recorded changes between different stages within the period. Initial
  creation is excluded; events include reversals and are not a distinct-Case conversion rate.
- Freshness work includes elapsed review times, review-due, conflicting and unknown states.
- Delivery exceptions are current failed, bounced or unknown outgoing Case emails under the
  same Case-read and message-draft authority as their email workbench.

The rolling period is seven, thirty or ninety elapsed days, with Europe/Sofia display. Open
work measures are current snapshots. Event windows are half-open. Responsibility filters
use the recorded inquiry/task/Case owner, viewing host or listing broker. A current incomplete
period, small response sample and missing response observations are explicitly labelled.

The response cohort contains inquiries received in the period. Only the existing human-contact
command's `firstResponseAt` observation counts as a useful response; acknowledgement does not.
The displayed median is elapsed time including time outside staffed hours, among valid
recorded responses only. Missing observations never become zero-duration responses. Invalid
timestamps are excluded and disclosed. There is no staffed-hour SLA claim.

Staffed-hour duration remains unknown until an approved versioned hours policy is bound to
the observations. Correction/re-entry effort remains unknown until actual effort events
exist. These are remaining B07/B08 qualification inputs, not passed reporting measures.

## Verification and acceptance

Focused PostgreSQL checks cover report denial, record/report scope intersection, revocation,
internal-field denial, full totals beyond the sample, useful response versus acknowledgement,
actual stage history and promised-task semantics. DOM checks cover native filters, localized
staff labels, permitted drill links and unavailable/denied/zero distinctions. The browser
corpus uses only disposable synthetic records and covers native/enhanced filter reload,
scoped totals and private export on desktop and phone profiles.

Source/test proof does not close F01/G1–G4, real operating-hour policy, final-candidate metric
truth or actual manager acceptance. Production launch authority is unchanged.
