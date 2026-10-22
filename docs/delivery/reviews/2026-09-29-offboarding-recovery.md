# O23 operation recovery

Leaving during an offboarding request previously exposed a fresh destructive form on return.
The failing browser reproduction is preserved in `offboarding-navigation-red.log` under
`/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`.

The hydrated form now records only its signed operation reference in a host-only session
cookie before sending. The marker is scoped to actor and target; the server verifies its
signature, current operator authority and receipt actor before presenting a result. No reason,
person details or authorization credential is stored in this marker. Known responses clear it;
unreceived responses retain it. Returning to the canonical page reconciles that same operation
before rendering another form. A recorded failure permits a separate explicit review; an absent
or unknown receipt does not permit resubmission. A success must match the target principal.

Revision conflicts retain the reason, clear the acknowledgement and show freshly authorized
identity and retained-work counts. Reapplication uses the current revision and a new signed
operation identity. Reading the latest data never executes the command.

Evidence on the final runtime build:

- `offboarding-reconciliation-final.log`: 15 existing/navigation/conflict browser checks passed.
  Its six lost-response checks initially failed because the proxy applied response cookies.
- `offboarding-lost-response-verified.log`: all six lost-response checks passed on desktop
  Chromium, mobile Chromium and mobile WebKit with an isolated proxy that drops both response
  headers and body. The test checks a real operation row before navigating; it does not synthesize
  a receipt. WebKit requires copying the synthetic browser's cookie jar into this isolated proxy.
- `offboarding-regressions.log`: 20 form and database offboarding regressions passed.
- Lint, TypeScript and the production build passed. Conflict screenshots at 320 CSS pixels
  were inspected; drafts and review controls fit without horizontal scrolling. Native conflict,
  validation, success and receipt flows were exercised with JavaScript disabled.
- Concurrent seed processes exposed a timestamp-based fixture-reference collision; test-only
  references now use UUIDs. Failed fixture/proxy logs remain alongside the successful evidence.

Limits: the pre-request navigation marker requires hydration. Native no-JavaScript commands
retain server revision/idempotency protections, but leaving before their first response is not
claimed to preserve a browser marker. Closing/clearing a browser session can also remove the
marker. These local synthetic checks do not prove provider operation, human design acceptance,
assignment handover, performance gates or launch readiness. Jev semantic review was unavailable
because its daily budget was exhausted; this is not a successful semantic review.

The preceding source commit `ad81c06b5b3064e58942e986ed736a439b48cddd` passed all jobs in
[CI run 36578052100](https://github.com/ms-realty/ms-realty/actions/runs/36578052100).
That result is not CI proof for this later change. R00 and the launch authority remain unchanged.
