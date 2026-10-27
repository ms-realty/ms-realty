# B11 consultation browser limiter isolation

Base candidate: `590117d1`. The combined browser run `111a707aa0274360a159704f3d547001`
passed five B11 variants, then failed the WebKit native variant while reading
`received.inquiry.purpose`.

The failed trace has two native `POST /bg/inquire` requests without `cf-connecting-ip`.
Its final snapshot shows the expected throttle: wait 38 seconds, inquiry not sent,
fields preserved. The `inquiry.ip` policy allows five new submissions per client IP,
then refills one token per 120 seconds. All six variants shared the fallback IP.
The repeated synthetic email is not the rate-limit key.

The test now assigns each journey a unique `2001:db8::/32` documentation-range IP,
following the existing discovery/work browser fixtures. It requires the visible
Bulgarian receipt heading before querying durable inquiry state. Production policy,
seed behavior, and the dedicated throttle/recovery cases remain unchanged.

Focused validation:

- `npx biome check e2e/service-intake.spec.ts`: passed.
- `npx tsc --noEmit --incremental false`: passed.
- Playwright list for `e2e/service-intake.spec.ts`: six variants registered.
- Focused inquiry intake/review/state unit tests: 3 files, 33 tests passed.
- `git diff --check`: passed.

The corrected browser journey has not been rerun in this worktree. Integration and
release evidence remain unproven by these focused checks. No product defect was
observed in the throttle behavior inspected here.

Failure trace SHA-256:
`d555fa0ca457b9351e1af4c961e5b62f4d55fb4711d8b2a84dd88dae8b4139cd`.
