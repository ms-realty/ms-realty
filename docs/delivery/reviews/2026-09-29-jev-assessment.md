# Typed Jev draft assessment

Choice, Noul and Score now run as one optional Decisions API batch after deterministic
validation of an inquiry, translation or broker-note proposal. Choice evaluates source support,
Noul checks following untrusted instructions, and Score measures task usefulness. They share
only the authorized minimized source and draft. Answers are independently typed and retained
with model snapshot, questions/policy digest and actual billing.

The staff review page shows source support and expandable probability/rubric details in
BG/RU/EN. Uncertainty is not silently converted to approval. Human review records a decision;
it does not write facts, create tasks, send, publish or grant access. Invalid facts are rejected
before assessment. Source version and authority are checked between calls and before saving.

Both calls are reserved before queueing. Unknown second-call cost retains the entire joint
reservation and records the known generation charge separately. Known over-limit billing
fails the draft while retaining the charge. There is no automatic retry. A changed Jev policy
invalidates queued work before either provider call. Requested but unqualified assessment
disables generation instead of silently omitting the assessment.

Validation:

- 208 AI unit/integration checks passed before adding the final explicit excessive-assessment
  billing and between-call authority regression. All 13 final focused assistance tests passed,
  covering these additions; exact results are retained in `jev-assistance-final.log`.
- TypeScript, repository lint and the `.next-jev` production build passed.
- 15 browser scenarios passed across Chromium desktop/mobile and WebKit mobile. Six added
  journeys exercise 320px, BG/RU/EN, details disclosure and explicit human acceptance, with
  JavaScript on/off. The stored run stays a draft until the human review.
- The WebKit assessment screenshot was inspected: readable wrapped copy, no clipped controls,
  source uncertainty prominent, technical model/rubric details contained in a native disclosure.
  Browser run: `5ce318fa8ec948ba8121391cf137eb10`.

Logs live in `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`: `jev-tests.log`,
`jev-types.log`, `jev-build.log`, `jev-browser.log`, `jev-lint.log` and
`jev-assistance-final.log`. Synthetic fixtures do not establish semantic accuracy. This was
author review; the remote Jev edit-rule check remained unavailable due to its daily budget.

Live qualification is blocked in this execution environment: no OpenRouter key, approved
processing flag, qualified routing policy or explicit daily budget was present. No secret
value was printed, another project's credential reused, spend limit increased or live inference
attempted. Restricted-key privacy, Decisions API constraints, current rate card, model quality
and multilingual calibration still require real evidence before activation.

Other Jev uses (search relevance, duplicate matching, bounded candidate extraction) remain
planned. This slice is draft assessment, not completion of all AI or product capabilities.
