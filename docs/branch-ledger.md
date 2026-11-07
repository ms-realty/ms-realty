# Branch ledger

Record of every branch on `ms-realty/ms-realty` after the hygiene lane (#358) pruned the
19 branches whose content had landed, with the verdict and evidence for each. The ledger
exists because the repository has no tracker: the plan and the outcome live here and in the
pull-request descriptions it names.

Snapshot: tips and ahead/behind counts were taken against `main` at `387ad639`. `main` moved
to `0271450f` (#373, #374, #376) while the lane ran, and live branches keep moving; the pull request
numbers are the stable anchors. Recompute a count with
`git rev-list --count 387ad639..<tip>` and `git rev-list --count <tip>..387ad639`.

## Method

A branch counts as **landed** when one of two checks holds:

1. Blob check. For every path the branch changed between its merge base and its tip, the
   tip's blob either equals `main`'s blob for that path, or appears among the blobs `main`'s
   history ever recorded for that path (`git log origin/main --raw --no-renames --format= --
   <paths>`, fourth column). A path the branch deleted counts when `main` lacks it too.
2. Ancestry. The tip is an ancestor of a commit whose tree is identical to a squash commit on
   `main` (`git merge-base --is-ancestor <tip> <candidate>` and
   `git rev-parse <candidate>^{tree} <squash>^{tree}`).

Codex's own closing comments on pull requests are corroboration, never the proof. A branch
is **pruned** only when it is landed and its tip is held by the archive bundle.

Archive: `~/Archive/MS-Realty/pre-prune.bundle` (all 176 refs at prune time, mirror-clone
fsck clean), with `pre-prune.refs.txt` (ref list), `pre-prune.stashes.txt` (10 stash entries
as temporary refs) and `deleted-branches.txt` (tips of the 19 branches #358 deleted).
Verify a tip with `git bundle list-heads ~/Archive/MS-Realty/pre-prune.bundle | grep <sha>`.
"In bundle: yes (n ref names)" means n refs in the bundle point at that tip, not n copies.

## Remote branches

| Branch                                               | Tip at snapshot | Ahead / behind `387ad639` | Pull request      | Verdict                                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                            | In bundle         |
| ---------------------------------------------------- | --------------- | ------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| `main`                                               | 387ad639        | –                         | –                 | trunk; now `0271450f`                                                                                                                                                                                                                                                                                                                                                | –                                                                                                   | –                 |
| `claude/retention-policy-aml`                        | 69e0b68e        | 2 / 0                     | #374              | **Claude-live.** Docs-only (retention policy v1, ADR 0008) owned by another Claude session; merged while this lane ran (squash `1db8f291`, with ADRs 0008 and 0009 and the EU-27 compliance rules). GitHub deleted the branch.                                                                                                                                       | `gh pr view 374`                                                                                    | no (live)         |
| `codex/msr-recovery-journal`                         | f2da94d7        | 27 / 0                    | #373 merged       | **Codex-live, merged while this lane ran.** Squash `784f944a`; GitHub deleted the branch.                                                                                                                                                                                                                                                                            | `gh pr view 373`                                                                                    | no (live)         |
| `codex/msr-public-qualification-fixes`               | 23218846        | 232 / 19                  | #344 draft        | **Codex-live.** Not touched. Contains the whole `codex/msr-staging` and `codex/msr-erasure-propagation` lineage.                                                                                                                                                                                                                                                     | `git merge-base --is-ancestor b8d5ad74 23218846`                                                    | yes (5 ref names) |
| `codex/msr-reauth-draft-continuity`                  | 12c0e76a        | 33 / 1 at e0c561c0        | #376              | **Codex-live.** Opened and merged while this lane ran (squash `0271450f`). Not touched.                                                                                                                                                                                                                                                                              | `gh pr view 376`                                                                                    | no (live)         |
| `codex/msr-staging`                                  | b8d5ad74        | 161 / 21                  | none              | **Landed, keep.** Tree identical to the #340 squash commit `7196bb09` (`4d5a871b`). Kept because it is the staging deployment ref: `staging.yml` and `staging-cloudflare.yml` trigger on it and the protected `staging` environment allows only this branch. Not a work branch.                                                                                      | `git rev-parse 7196bb09^{tree} b8d5ad74^{tree}`                                                     | yes (6 ref names) |
| `codex/msr-erasure-propagation`                      | c2263495        | 146 / 21                  | none              | **Landed, pruned.** Ancestry: ancestor of `b8d5ad74`, whose tree is the #340 squash. 22 of 392 paths carry intermediate blobs that later commits of the same lineage overwrote before the squash; nothing unique.                                                                                                                                                    | `git merge-base --is-ancestor c2263495 b8d5ad74`                                                    | yes (1)           |
| `codex/msr-privacy-export`                           | 22b1e8b8        | 21 / 22                   | #339 closed       | **Landed, pruned.** Ancestry: the last content commit `9fea7fee` is an ancestor of `b8d5ad74` (#340); the tip is a merge of `origin/main` with no content of its own. Codex closed #339 as superseded by #340.                                                                                                                                                       | `git merge-base --is-ancestor 9fea7fee b8d5ad74`; `git log b8d5ad74..22b1e8b8` shows the merge only | yes (2 ref names) |
| `codex/msr-cms-editions`                             | b7a00de1        | 4 / 26                    | #333 merged       | **Landed, pruned.** Blob check: 35 of 35 paths, 22 equal `main`, 13 in `main`'s history.                                                                                                                                                                                                                                                                             | blob check as in Method                                                                             | yes (2 ref names) |
| `codex/msr-staging-http-ci`                          | e28f86b0        | 6 / 21                    | #341 closed draft | **Landed, pruned.** Blob check: 7 of 7 paths, 3 equal `main`, 4 in `main`'s history. Nothing in `main` references the branch.                                                                                                                                                                                                                                        | blob check as in Method; `git grep msr-staging-http-ci origin/main` empty                           | yes (3 ref names) |
| `dependabot/npm_and_yarn/patch-and-minor-b48824801f` | 2cdff7a0        | 1 / 2                     | #371 open         | **Automated, CI red.** Eleven patch and minor bumps across both package files. `make test-release` fails because `scripts/release-ci-scenarios.mjs` pins the digests of `package.json` and `package-lock.json` as reviewed-producer inputs; a bump cannot pass until a person reviews it and moves the pins. Superseded by #378 once that merges (see "Dependabot"). | `gh run view 42210396443 --log-failed`                                                              | no (live)         |
| `claude/branch-ledger`                               | 9cc6dd95        | –                         | #375              | This lane: the ledger.                                                                                                                                                                                                                                                                                                                                               | –                                                                                                   | no (live)         |
| `claude/tenant-profile`                              | 2e9453b7        | –                         | #377              | This lane: the tenant profile (see below).                                                                                                                                                                                                                                                                                                                           | –                                                                                                   | no (live)         |
| `claude/deps-patch-minor`                            | 79a4451a        | –                         | #378              | This lane: the reviewed dependency bump.                                                                                                                                                                                                                                                                                                                             | –                                                                                                   | no (live)         |

### Dependabot

The bump cannot pass CI on its own: `scripts/release-ci-scenarios.mjs` records the digests
of `package.json` and `package-lock.json` as reviewed-producer inputs, so any dependency
change fails `make test-release` until a person reviews it and moves the pins. That review is
the point of the pin, and pushing it onto Dependabot's branch would merge and ship on green
without an independent reviewer. #378 therefore takes Dependabot's four package files byte
for byte, moves the two pins, and lands after its own review; #371 then closes as
superseded. Until then the branch stays as Dependabot left it.

## Local branches in the primary checkout

Local branches live in the primary checkout that Codex sessions use and are shared by every
worktree. They are Codex's working branches; this lane deleted only the two that are proven
landed, bundled and attached to no worktree.

### Kept by the hygiene lane (41)

Codex branches whose blob versions never landed, kept by #358. Their work reached `main`
through later pull requests in another form. All 41 tips are in the bundle; none exists on
the remote except `codex/msr-public-qualification-fixes` (#344, above), and this lane removed
the remote copy of `codex/msr-privacy-export`. Verdict: **bundled, local-only, Codex-owned;
prune when Codex retires them.** Names:

`codex/msr-agency-http`, `codex/msr-agency-obligations`, `codex/msr-bounded-service-intake`,
`codex/msr-browser-policy-recovery`, `codex/msr-client-catalog-recovery`,
`codex/msr-client-closeout-staff-actions`, `codex/msr-client-reply-receipt-fix`,
`codex/msr-client-workflow-completion`, `codex/msr-consent-withdrawal-drafts`,
`codex/msr-consultation-browser`, `codex/msr-date-control-native-baseline`,
`codex/msr-duplicate-browser-recovery`, `codex/msr-erasure-browser-sync`,
`codex/msr-governance-review-binding`, `codex/msr-inquiry-photos-e2e`,
`codex/msr-local-service-checks`, `codex/msr-native-publication-ci`,
`codex/msr-operating-policy`, `codex/msr-partner-picker`, `codex/msr-photo-confirmation`,
`codex/msr-photo-transport-contract`, `codex/msr-policy-owner-directory-review`,
`codex/msr-privacy-ci-independent`, `codex/msr-privacy-ci-independent-agency`,
`codex/msr-privacy-ci-performance`, `codex/msr-privacy-export`, `codex/msr-privacy-governance`,
`codex/msr-privacy-source-integration`, `codex/msr-public-alert-enrollment`,
`codex/msr-public-discovery-ux`, `codex/msr-public-map-label`,
`codex/msr-public-qualification-fixes`, `codex/msr-public-runtime-232-held`,
`codex/msr-public-runtime-repairs`, `codex/msr-service-privacy-classification`,
`codex/msr-service-recovery`, `codex/msr-staff-intrinsic-sizing`,
`codex/msr-staff-workflow-completion`, `codex/msr-task-effort`,
`codex/msr-typed-content-composition`, `codex/msr-workspace-navigation`.

### Created after the hygiene prune (33)

Codex branches that did not exist when the bundle was made, so none of them is in it unless
stated. Those with a merged pull request landed by squash, which is why their tips are not
ancestors of `main`; those without one are Codex's in-flight work, several checked out in
Codex worktrees. None is on the remote. Verdict: **Codex-owned; not touched.**

| Branch                                    | Tip      | Pull request | Note                                                                     |
| ----------------------------------------- | -------- | ------------ | ------------------------------------------------------------------------ |
| `codex/msr-advisory-release-repair`       | 9e3b7c30 | #361 merged  |                                                                          |
| `codex/msr-indexability-boundary`         | 4b1c2b6f | #369 merged  |                                                                          |
| `codex/msr-listing-acceptance`            | e668edd7 | #357 merged  | in bundle (3 ref names)                                                  |
| `codex/msr-native-navigation-receipts`    | 584f0ca9 | #366 merged  |                                                                          |
| `codex/msr-native-photo-order-navigation` | b6f90b90 | #364 merged  |                                                                          |
| `codex/msr-privacy-ci-repair`             | 970d5b23 | #360 merged  |                                                                          |
| `codex/msr-public-language-corrections`   | 66395593 | #368 merged  |                                                                          |
| `codex/msr-r00-candidate-foundation`      | 1160b0ec | #362 merged  |                                                                          |
| `codex/msr-r02-listing-review`            | f78bb92c | #365 merged  |                                                                          |
| `codex/msr-raw-language-completion`       | e130f5f7 | #370 merged  |                                                                          |
| `codex/msr-release-ci-scenarios`          | 462e9a01 | #367 merged  |                                                                          |
| `codex/msr-webkit-stop-target`            | 74244b3c | #363 merged  |                                                                          |
| `codex/msr-release-gates`                 | e2f25a50 | none         | ancestor of `main` (no own commits); checked out in a Codex worktree     |
| `codex/msr-expanded-acceptance`           | 0be05c3c | none         | 28 ahead; Codex worktree                                                 |
| `codex/msr-r00-execution-bridge`          | 5d46049e | none         | 24 ahead; Codex worktree                                                 |
| `codex/msr-r10-bundle-tools`              | 7db05043 | none         | 25 ahead; Codex worktree                                                 |
| `codex/msr-recovery-access-history`       | 069ca92f | none         | 23 ahead; Codex worktree                                                 |
| `codex/msr-recovery-archive-runtime`      | 64401bb6 | none         | 24 ahead; Codex worktree                                                 |
| `codex/msr-reviewed-terminal-404`         | b056f908 | none         | 30 ahead; Codex worktree                                                 |
| `codex/msr-staging-parity-collector`      | 3e2b8535 | none         | 27 ahead; Codex worktree                                                 |
| `codex/msr-media-native-recovery`         | ebdf26bd | none         | 8 ahead; in bundle (1)                                                   |
| `codex/msr-media-reconciliation-tests`    | 0324d058 | none         | 18 ahead; in bundle (1)                                                  |
| `codex/msr-privacy-revocation-receipt`    | 21b59333 | none         | 1 ahead                                                                  |
| `codex/msr-r00-source-foundation`         | 7af9be48 | none         | 1 ahead                                                                  |
| `codex/msr-recovery-archive-contracts`    | cc33c73c | none         | 3 ahead                                                                  |
| `codex/msr-release-proof-composition`     | 6fdf0de9 | none         | 20 ahead                                                                 |
| `codex/msr-reviewed-route-export`         | b056f908 | none         | 30 ahead; same tip as `msr-reviewed-terminal-404`                        |
| `codex/msr-webkit-aim-investigation`      | 79d757e2 | none         | 8 ahead                                                                  |
| `codex/msr-webkit-partial-diagnostic`     | fbb63d57 | none         | 7 ahead                                                                  |
| `codex/msr-webkit-release-repair`         | 6a5a0f10 | none         | 2 ahead                                                                  |
| `codex/msr-webkit-stop-diagnostic`        | 015efb55 | none         | 3 ahead                                                                  |
| `codex/msr-phase-one-qualified`           | 80964128 | none         | **deleted by this lane**: ancestor of `main`, in bundle (1), no worktree |
| `codex/msr-phase-two-main-qualification`  | e59befa0 | none         | **deleted by this lane**: ancestor of `main`, in bundle (3), no worktree |

Stashes in the primary checkout are listed in `pre-prune.stashes.txt`; entries @7 and @8
(`codex/custom-admin-listing-launch` lead ledger and probe writes) may hold personal data
and wait for the owner's review before they are dropped.

## Pull requests from this lane

Every pull request stays a draft until CI is green and a different model has reviewed it,
because a ready pull request merges and ships on green. The current state is on GitHub.

| Pull request | Branch                    | Content                                                                                                                                                               | Review                                                 |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| #375         | `claude/branch-ledger`    | this note                                                                                                                                                             | fact-checked by a different model; corrections applied |
| #377         | `claude/tenant-profile`   | `src/config/tenant.ts`: jurisdictions and time zones, locales, currency, review defaults, references, legacy domains and agency identity behind one profile; ADR 0010 | reviewed by a different model; findings applied        |
| #378         | `claude/deps-patch-minor` | Dependabot's patch-and-minor group (#371) with the reviewed-producer pins moved                                                                                       | reviewed by a different model; no findings             |

## Pruned

Remote branches deleted by this lane, each proven landed and held by the bundle, each with
`--force-with-lease` on its recorded tip:

- `codex/msr-erasure-propagation` (c2263495)
- `codex/msr-privacy-export` (22b1e8b8)
- `codex/msr-cms-editions` (b7a00de1)
- `codex/msr-staging-http-ci` (e28f86b0)

Local branches deleted by this lane (`git branch -d`, ancestors of `main`, in the bundle,
attached to no worktree): `codex/msr-phase-one-qualified` (80964128),
`codex/msr-phase-two-main-qualification` (e59befa0).

`codex/msr-recovery-journal` was deleted by GitHub when #373 merged.

## Waits on the owner or on Codex

- Launch gate: R00–R12 in `docs/architecture.md` §20.3, none passed with exact-release
  evidence; `production/data/launch-readiness.json` remains the authority.
- #344: Codex.
- The property-management pack (`helm-ai-enterprise`, `packs/property-management`) did not ask
  this side for a lifecycle export. For the record: 17 of its 20 lifecycles match the code's
  `defineMachine` tables edge for edge (inquiry, demand and supply case stages, disposition,
  interest, appointment, proposal revision, owner instruction, listing availability, listing
  editorial, locale copy, publication, client message, task, external action, consent
  subscription, privacy request); key custody, complaint and import batch have state lists
  but no single transition table in code; four code machines (service-intake stage, destination
  delivery, document, approval) have no pack lifecycle. Owners, handoffs and agent verdicts are
  pack policy and are not derivable from code, so an exporter would cover structure only. Whether
  to build one is the pack owner's call.
- The local Codex branches and stashes @7/@8 above.
