# Branch ledger

Record of every branch on `ms-realty/ms-realty` after the hygiene lane (#358) pruned the
19 branches whose content had landed, with the verdict and evidence for each. The ledger
exists because the repository has no tracker: the plan and the outcome live here and in the
pull-request descriptions it names.

## Method

A branch counts as **landed** only when every path it changed, between its merge base and
its tip, either matches `main` byte for byte or its exact blob appears in `main`'s history
for that path (`git log origin/main --raw -- <paths>`), or when its tip is an ancestor of a
commit whose tree is identical to a squash commit on `main`. Codex's own closing comments
on pull requests are corroboration, never the proof. A branch is **pruned** only when it is
landed or stale and its tip is held by the archive bundle.

Archive: `~/Archive/MS-Realty/pre-prune.bundle` (all 176 refs at prune time, mirror-clone
fsck clean), with `pre-prune.refs.txt` (ref list), `pre-prune.stashes.txt` (10 stash entries
as temporary refs) and `deleted-branches.txt` (tips of the 19 branches #358 deleted).
Verify a tip with `git bundle list-heads ~/Archive/MS-Realty/pre-prune.bundle | grep <sha>`.

## Remote branches

| Branch | Tip | Ahead / behind `main` | Pull request | Verdict | Evidence | In bundle |
|---|---|---|---|---|---|---|
| `main` | 387ad639 | – | – | trunk | – | – |
| `claude/retention-policy-aml` | 69e0b68e | 2 / 0 | #374 draft | **Claude-live.** Docs-only draft (retention policy v1, ADR 0008) owned by another Claude session. CI green except `Browser / webkit-mobile` still running at the time of writing. Left to its owner session for independent review and the ready decision. | `gh pr view 374` | no (live) |
| `codex/msr-recovery-journal` | f2da94d7 | 27 / 0 | #373 open | **Codex-live.** Not touched. | – | no (live) |
| `codex/msr-public-qualification-fixes` | 23218846 | 232 / 19 | #344 draft | **Codex-live.** Not touched. Contains the whole `codex/msr-staging` and `codex/msr-erasure-propagation` lineage. | `git merge-base --is-ancestor b8d5ad74 23218846` | yes (5 refs) |
| `codex/msr-staging` | b8d5ad74 | 161 / 21 | none | **Landed, keep.** Tree identical to the #340 squash commit `7196bb09` (`4d5a871b`). Kept because it is the staging deployment ref: `staging.yml` and `staging-cloudflare.yml` trigger on it and the protected `staging` environment allows only this branch. Not a work branch. | `git rev-parse 7196bb09^{tree} b8d5ad74^{tree}` | yes (6 refs) |
| `codex/msr-erasure-propagation` | c2263495 | 146 / 21 | none | **Landed, prune.** Ancestor of `b8d5ad74`, whose tree is the #340 squash. 22 of 392 paths carry intermediate blobs that later commits of the same lineage overwrote before the squash; nothing unique. | `git merge-base --is-ancestor c2263495 b8d5ad74` | yes |
| `codex/msr-privacy-export` | 22b1e8b8 | 21 / 22 | #339 closed | **Landed, prune.** Last content commit `9fea7fee` is an ancestor of `b8d5ad74` (#340). The tip is a merge of `origin/main` with no content of its own. Codex closed #339 as superseded by #340. | `git merge-base --is-ancestor 9fea7fee b8d5ad74`; `git log b8d5ad74..22b1e8b8` shows the merge only | yes (2 refs) |
| `codex/msr-cms-editions` | b7a00de1 | 4 / 26 | #333 merged | **Landed, prune.** 35 of 35 paths: 22 match `main`, 13 appear in `main`'s history. | blob check | yes (2 refs) |
| `codex/msr-staging-http-ci` | e28f86b0 | 6 / 21 | #341 closed draft | **Landed, prune.** 7 of 7 paths: 3 match `main`, 4 appear in `main`'s history. No workflow or script references the branch. | blob check; `git grep codex/msr-staging-http-ci origin/main` empty | yes (3 refs) |
| `dependabot/npm_and_yarn/patch-and-minor-b48824801f` | 2cdff7a0 | 1 / 2 | #371 open | **Automated, CI red.** Eleven patch and minor bumps across both package files. `make check` fails because Biome 2.6.4 wants formatting changes in three files (template literal, optional chaining); the bump itself is sound. Verdict recorded below under "Dependabot". | `gh run view 42210396443 --log-failed` | no (live) |

### Dependabot

The bump cannot pass CI without a formatting commit. Pushing one onto Dependabot's branch
would merge and ship it on green without an independent review, so the bump is landed
through a reviewed draft pull request instead (see "Pull requests from this lane"), after
which #371 closes as superseded. Until then the branch stays as Dependabot left it.

## Local branches in the primary checkout

The hygiene lane kept 41 local Codex branches whose blob versions never landed and three
in-flight Codex branches; none of them exists on the remote. They are Codex's own
iterations toward work that landed through later pull requests. All 41 tips are in the
bundle. They are not pruned here because they live in the primary checkout that Codex
sessions use, and classifying their content beyond the blob check means re-reading up to
232 commits each. Verdict: **bundled, local-only, Codex-owned; prune when Codex retires
them.** Names:

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

Stashes in the primary checkout are listed in `pre-prune.stashes.txt`; entries @7 and @8
(`codex/custom-admin-listing-launch` lead ledger and probe writes) may hold personal data
and wait for the owner's review before they are dropped.

## Pull requests from this lane

Filled in as the lane progresses; every pull request stays a draft until CI is green and a
different model has reviewed it, because a ready pull request merges and ships on green.

| Pull request | Branch | Content | State |
|---|---|---|---|
| (this ledger) | `claude/branch-ledger` | this note | draft |

## Pruned

Branches deleted from the remote by this lane, each proven landed and held by the bundle:

- (filled in once the pull request that records them is open)

## Waits on the owner or on Codex

- Launch gate: R00–R12 in `docs/architecture.md` §20.3, none passed with exact-release
  evidence; `production/data/launch-readiness.json` remains the authority.
- #374 (retention policy, ADR 0008): review and ready decision by its owner session.
- #373 and #344: Codex.
- The 41 local Codex branches and stashes @7/@8 above.
