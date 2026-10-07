# Separate reviewed drafts for multiple recipients

Staff can select up to ten current eligible service-email recipients and compose once. The
command atomically creates a separate immutable draft per recipient. Each draft still needs its
own exact-content human approval and has its own logical send, reply token and delivery status.
Other selected addresses are not added to the recipient fields of that email. Existing single
recipient, calendar snapshot, provider fencing and unknown-outcome behavior remain in force.

Duplicate subscription IDs, duplicate addresses and ineligible recipients reject the batch.
Failure after preparing an earlier member rolls back all drafts and audit events from that batch.
Replaying the same operation returns the same draft IDs. The previous single-recipient service
input remains supported; the native UI uses an explicit recipient checkbox group.

The shared form now adopts declared checkbox groups edited before hydration, in addition to
ordinary inputs and selects. Repeated recipient fields are normalized only for this declared
command and validated by the server; arbitrary repeated form fields remain rejected.

Evidence under `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:

- `email-multi-regressions.log`: 42 email/form tests passed, including atomic rejection, replay,
  individual approval isolation and existing dispatch/consent/calendar fences.
- `email-recipients-browser.log`: 18 native/hydrated browser scenarios passed across desktop
  Chromium, mobile Chromium and mobile WebKit. New scenarios select both recipients before
  scripts load, edit after hydration, reject a missing subject, retain both choices and verify
  two durable one-recipient drafts with zero external send actions. Existing exact approval,
  service eligibility/withdrawal and calendar-email scenarios also pass.
- Production build, TypeScript and lint passed. The fixture needed a second formatter pass;
  the first lint failure is retained beside `email-recipients-lint-final.log`.

This is separate-recipient drafting, not a bulk send or a shared To/Cc thread. Uploaded email
attachments, inbound attachments and the remaining calendar notification/acknowledgement work
are still open. No live mail provider was called and no real customer was contacted.

The preceding task-handover commit `e72fbd7d` passed all jobs in
[CI 36585279729](https://github.com/ms-realty/ms-realty/actions/runs/36585279729).
This later change needs its own exact-head CI. Launch authority and R00 remain unchanged.
