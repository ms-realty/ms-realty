# Full-suite handover failures on f39770b0

CI run `36622886082` failed on `f39770b0`: 438 browser scenarios passed, seven failed and
five skipped. The preceding 1,312 unit/integration checks passed with two skips, and the
separate live-byte scanner integration passed 11 checks. This is a failed CI checkpoint.
The complete failed-job log is preserved in local artifacts as `ci-f39770b0-failed.log`.

The joined dataset exposed three limits hidden by the small isolated browser run:

- Case receiver options loaded only the first 50 active staff before evaluating permissions.
  Later eligible receivers were unavailable to the browser. That arbitrary limit is removed;
  option eligibility remains checked, with database concurrency bounded to four candidates.
  The mutation still independently checks current authority and all retained commitments.
- The linked coverage test assumed its new records were on page one. It now follows actual
  queue pagination for both presence and absence, so a record on another page cannot produce
  a false successful absence assertion.
- A full-page WebKit screenshot of a populated coverage queue exceeded the engine's 32,767px
  image dimension. That evidence image now captures the viewport; record navigation and
  handover assertions remain. No product or test timeout was increased.

`handover-directory.int.test.ts` proves an eligible receiver beyond 51 earlier ineligible
staff remains selectable. `host-browser.log` records a fresh Linux build and 27 successful
host/linked/Case/task handover journeys across Chromium desktop/mobile and WebKit mobile,
including JavaScript off. This includes the previously failing paths, but is not a full CI
run with its complete dataset. Exact-head CI must qualify the updated candidate separately.

Artifacts: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/` (new checks), and
`/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/` (failed CI log).
