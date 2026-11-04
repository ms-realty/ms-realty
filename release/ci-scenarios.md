# R03 CI browser evidence for shared shortlists

Run the collector from a checkout containing the exact post-merge commit. It needs Node 24, Python 3 and a GitHub CLI account with permission to read the repository’s Actions runs, job logs and artifacts. The destination must be a new directory under a private parent.

```sh
node scripts/release-ci-scenarios.mjs \
  --sha "$CANDIDATE_SHA" --run "$CI_RUN_ID" --attempt "$CI_RUN_ATTEMPT" \
  --out "$PRIVATE_EVIDENCE_DIR/shortlist-capture"
```

The collector writes `receipt.json` together with the provider responses and selected native report files. Exit 0 means every mapped check was observed on all required profiles. Exit 2 records incomplete coverage. Exit 1 means the inputs or provider identity could not be verified. A new invocation needs a new destination, including after a partial capture.

## What the two tests observe

The F04 browser checks exercise the public shared-shortlist portion of AT09. Each row runs on Chromium desktop, Chromium mobile and WebKit mobile with the CI application and disposable database.

| Browser case | Required observations from the reviewed test |
| --- | --- |
| Public recipient and revocation | The recipient sees the selected public listings and price. The omitted reference, creator controls and creator session value are absent. Revocation removes recipient cards and the listing title on the next request. |
| Expired recipient and creator | The recipient sees an expired state without the listing title. The creator’s card also shows expiry and offers no action buttons. |

The map fixes the source file, titles, lines and columns, per-project test IDs, native expectation matchers and selectors. The creator’s card identifies the two selected listing references and the omitted one. Each recipient selector must match the appropriate reference, and the collector requires individual observations for Revoke and Copy link. The candidate Git object pins the workflow, package manifest and lifecycle scripts, dependency lock, scanner wrapper and readiness probe, browser configuration, server entry point and test source. Changes to these inputs require reviewing the map and updating the pins. A job conclusion or a test name containing an acceptance ID supplies no case evidence by itself.

## Where the receipt comes from

The CLI reads the official GitHub API for the specified attempt on the repository’s post-merge main CI workflow. It checks the IDs of the repository, workflow, attempt and browser jobs, the candidate commit, CI runner label, browser step and upload step. Each upload log has to identify the same artifact ID, byte length, digest and run URL as the provider metadata. Ambiguous or incomplete inventories block the affected observation.

The collector reads the selected HTML ZIP entry through GitHub’s authenticated redirect and bounded anonymous HTTPS ranges on one ETag. ZIP CRC checks protect the extracted members. The byte counters distinguish requested ranges, response payload bytes read (including a partial read returned by the transport), and fully verified range payloads. The receipt records SHA-256 for the provider JSON, job logs, HTML, native report index and detailed case file. The whole-archive digest comes from GitHub and the upload step. `wholeArchiveVerified` stays false because the collector did not read the entire archive.

The native report must identify the run, checked-out commit and single project. Its timing must fall within the browser step. Each expected test must appear once across the whole index and once in its detail file. A retained ID with a changed title is contradictory and yields unknown. A passing case requires a single successful attempt. Each mapped assertion must occupy its pinned source position, match the adjacent source excerpt, and execute in sequence after setup and before teardown. The collector uses the test’s native hook timestamps because its measured duration can exclude setup. Failed, skipped, retried, unscheduled and unrecognized cases retain distinct states. A repeated workflow attempt is identified separately and cannot produce a complete observation. Unavailable provider records and expired or malformed artifacts leave incomplete evidence.

The CLI accepts provider selectors only. The output is an unsigned review input. Local edits to metadata and hashes are possible after capture. Verification that depends on provider origin requires fresh readback from the named GitHub endpoints while the evidence is retained.

## Release boundary

The receipt describes tests on synthetic fixtures in CI. It has no admitted release context and always emits an empty `countedReleaseAssertions` list. It records no customer data, deployed behavior, provider operation or human decision in its verdict. Store the capture outside the evaluator’s evidence directory.

A full `ci_test_report` also needs lint, typecheck, unit, integration, browser and build evidence bound to an admitted candidate and policy. This collector measures two browser cases. It does not ingest individual Vitest results or establish the full AT09 obligation. The release evaluator and R00 authority control any later counting.

```sh
node --test scripts/release-ci-scenarios.test.mjs
python3 -B scripts/release-ci-archive.test.py
```
