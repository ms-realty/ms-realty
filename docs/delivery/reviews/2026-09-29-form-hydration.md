# UI07 / O21 — preserve edits made before JavaScript loads

CI run 36559267811 on 926e2aa3 failed both known Linux WebKit overflow checks and the
JavaScript-enabled content lifecycle (first at draft confirmation, then at a decision redirect
on retry). No downloadable trace artifact was retained by that workflow. Twenty-four local
WebKit content repetitions with two workers passed, so repetition alone did not isolate it.

A delayed-script browser regression exposed a concrete shared-form defect in all three
profiles: type into two usable server-rendered fields, allow JavaScript to load, then edit one
field. The other field resets to its empty server initial value. React preserves the native
DOM during hydration, but the controlled draft had not adopted the earlier edits. This is a
plausible explanation for the CI content symptoms, not a claim of an observed CI trace.

ActionForm now adopts only declared safe, visible native field values on the first client
commit before another controlled render. It supports text/textarea, single-select and checkbox
controls. Hidden metadata, passwords, files and unsupported grouped controls are not copied.
The operation/revision identity stays server-issued, and command authorization, validation and
explicit-review requirements are unchanged. Later action responses still own validation and
conflict restoration; this does not replay or submit any action automatically.

The initial delayed-script regression failed in Chromium desktop/mobile and WebKit mobile;
the unchanged test then passed in all three. A second end-to-end scenario verifies an early
content-type selection, all entered draft fields, a checked qualified-review confirmation and
its expiry after enhancement, followed by the real persisted decision receipt. The joined
Linux run passed **39 scenarios without retries**: delayed hydration, pending/duplicate-submit,
validation, conflict/reapply, RTL/accessibility, native forms, content lifecycle and offboarding.
Eight existing form unit tests and the production build passed. Type/lint results are recorded
with the source checkpoint. No test deadline or retry policy was increased.

Evidence: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:
`content-head-ci-failure.log`, `content-linux-stress.log`, `form-hydration-baseline.log`,
`form-hydration-fix.log`, `form-hydration-qualified.log`, `form-unit.log`.
R00, independent design review, current full CI and the remaining release gates remain open.
