# Individual task handover and retained-work navigation

The offboarding screen previously showed counts without a route to each outstanding assignment.
It now lists authorized Cases, tasks, inquiries and physical-key records, 25 per category per page.
Filtering happens before pagination. Access administration alone does not reveal record details.
Case, inquiry and key links lead to their existing review workflows; they do not transfer or close
records by opening a page.

Task ownership now has explicit request, named-receiver acceptance and cancellation commands.
Each command rechecks a live staff session, recent verification, scoped task authority and the
current revision. Receivers must be active staff with two active passkeys and access to that task.
Requests set only `pendingOwnerId`; the old owner remains until that person accepts. Cancellation
removes the proposal without changing ownership. Due dates, dependencies, evidence requirements,
client promises and task state are preserved. The audit and operation receipt are transactional.

The named receiver discovers proposals on Today and in the paginated “Awaiting my acceptance”
queue. The native task form supports request, acceptance, cancellation, retained validation drafts,
cleared acknowledgement and a stored-operation status page. Success redirects to that stable GET
because a successful handover changes which forms exist on the source page. Work screens also
have mobile gutters and wrapping; cancellation has its own visible section so native validation
errors cannot be hidden inside a closed disclosure.

Local evidence under `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:

- `handover-queue-regressions.log`: 12 database work/handover/authorization tests pass. They cover
  departed owners, named acceptance, unchanged commitments, replay, stale revisions, cancellation,
  ineligible receivers, terminal tasks, recipient-only queues and restricted pagination.
- `task-handover-flow-final.log`: six complete browser journeys pass on desktop/mobile Chromium
  and mobile WebKit, with JavaScript both enabled and disabled. Each enters through offboarding,
  requests a transfer, switches to the recipient's Today queue, accepts it, then requests and
  cancels another proposal. Invalid cancellation retains the reason and clears acknowledgement.
- `task-handover-validation-final.log`: six WebKit handover/existing-work scenarios passed,
  including public intake, record authorization and native rate-limit recovery.
- `task-handover-native-final.log`: six earlier request/acceptance journeys passed. Initial native
  failures exposed disappearing-form receipt state; the stable status redirect fixed it. Failed
  logs remain preserved. The 320px WebKit handover screenshot was inspected.
- Lint, TypeScript and a production build passed. The preceding offboarding recovery commit
  `22c2eba0` passed [CI 36581682486](https://github.com/ms-realty/ms-realty/actions/runs/36581682486):
  1,255 tests, a separate 11-test real-ClamAV run, 385 browser checks and 96 visual checks.
  That is not CI evidence for this later increment.

Still open: effective coverage ownership after revocation/absence from architecture §6.6,
complete end-to-end acceptance of every linked Case/inquiry/key workflow, key reminders and
independent design acceptance. Transferring a task does not transfer its parent Case or inquiry,
grant access, approve regulated work, send a notification or confirm a physical key return.
The launch authority and R00 remain unchanged; no live provider/customer action was performed.
