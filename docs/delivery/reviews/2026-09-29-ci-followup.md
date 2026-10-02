# Browser qualification follow-up

All jobs passed in CI 36533491658 on `8430cd0a`: 1237 baseline tests (two explicit real-scanner
skips), eleven actual ClamAV checks, 341 browser passes with two retry passes/five explicit
skips, 96 visual passes and container smoke. The host-locale check no longer flaked in this
run. Two other browser cases needed investigation; green job status did not erase them.

The publication helper waited only for any `saved` query parameter after reviewing a file.
That parameter already identified its upload receipt, so the assertion could finish before
the new review committed. File and media review checks now require a different nonempty
receipt before proceeding. The existing database assertion still requires reviewed,
accepted-for-purpose bytes with professional validation explicitly not requested. Three
WebKit repetitions passed with actual ClamAV scans. The pinned scanner image has no ARM64
manifest; the first local start failed, then the same digest ran successfully under Docker's
explicit AMD64 emulation. The lifecycle script cleaned up only its own scanner container.

The public inquiry test shared one client IP with unrelated browser profiles. A nine-journey
repeat reproduced five passes/four failures; the retained trace contains an actual
`rate_limited` rejected outcome. Each work journey now has its own synthetic documentation
IPv6 identity in the trusted-edge header on the disposable stand. No production rate-limit
policy changed, no buckets were cleared globally and no timeout/retry was widened. The same
nine-journey repeat now passes. This local reproduction explains the symptom; CI did not
publish its original failed trace, so exact remote root-cause attribution remains bounded.

That reproduction also exposed misleading customer copy: rate rejection said information
could not be loaded. The native action now explains the wait from the actual retry-after
value, that the inquiry was not submitted and that entered values are retained. Dedicated
browser checks exhaust only their own fixture bucket, assert no Inquiry exists, advance
that bucket's refill time and resubmit the same operation to obtain exactly one durable
Inquiry. JavaScript and native form versions pass on all three profiles. BG is the source;
new interface translations retain the existing human-approval/indexing boundary.

Validation: fresh build and twelve work/rate-recovery browser scenarios; nine repeated work
journeys; three actual-scanner publication repetitions; twenty-two focused inquiry/form
tests; TypeScript and final repository lint passed. One initial lint failure was formatting
in the new fixture and was corrected. Logs, including failures, are in
`/Users/ivan/Code/.artifacts/ms-realty/ci-followup/20260929`. Latest-head CI remains required.
