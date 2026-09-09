# MS Realty owner runbook

Updated 2026-09-09 during recovery of the interrupted Claude Desktop session.
This replaces the September 7 execution commands. Do not rerun the old
force-push, PR-ready, stash-drop or forced-worktree-removal commands from history.

## Current authority and release check

`production/data/launch-readiness.json` and
`production/data/launch-input-checklist.md` remain the launch authorities.
Local checks and merged code do not establish live readiness. Read the live
health and readiness endpoints and compare both release markers to current main.
Use the agency GitHub account for each command; do not export credentials globally.

```bash
cd /Users/ivan/Code/MS-Realty
git fetch origin
GH_TOKEN="$(gh auth token -u ms-realty)" gh pr list -R ms-realty/ms-realty
GH_TOKEN="$(gh auth token -u ms-realty)" gh run list -R ms-realty/ms-realty --limit 10
git rev-parse origin/main
curl --fail --silent --show-error https://makler-realty.com/api/health
curl --fail --silent --show-error https://makler-realty.com/api/ready
```

Deployments are serialized. Allow an active deployment or rollback to finish
before triggering another. A healthy previous release is recovery, not proof
that current main has shipped. Never cancel an origin activation mid-rollback.

## Recovered execution state

At 2026-09-09 13:32 UTC, the previous release
`7d93b4d7c9893a4a7570af059d6d2e6c21b7fbb4` was healthy again after an origin
rollback. Both public health markers matched that SHA. The pending release
contains further changes; recheck the live endpoints after it completes.

- #182 (lot identities) is already merged. Do not force-push its old helper branch.
- #208 (search words and references) and #212 (contacts/viewings/consents) passed
  CI and merged after conflict repair.
- #216 fixed authoritative price projection parity and passed CI before merge.
  The local focused projection checks passed 46 tests. Deployment proof remains separate.
- #215 received media-tab integration-test corrections and merge regeneration,
  passed full CI and merged.
- #218 adds the missing lot-identity database migration that caused Payload
  draft reads to fail during deployment. A production schema-only copy reproduced
  the failure; applying the migration made the same Payload probe pass. PostgreSQL
  repeat-run and history-preservation checks passed. Full CI passed before merge.
- #217 preserves and completes the interrupted deals/documents/team/languages
  work. Seventy-four targeted checks passed on the integrated source; browser
  checks found and corrected deal-form layout and language-save feedback.
  Arabic draft creation was tested locally and remained off/nonindexable.
  Full CI passed, including production build and deployable-container smoke.
  Final CI also passed after merging #218; #217 merged at 13:45 UTC.

Check GitHub for the current deployment and #217 status; this snapshot is not a
live status feed. The original Claude worktrees remain intact.

## Inputs still owned by humans

1. Agency Cloudflare was inspected on September 9: `ms.realty.bg@gmail.com`
   is already a verified destination. Email Sending for
   `notifications.makler-realty.com` is enabled and DNS configured; root-domain
   SuperHosting mail was preserved. The Worker/origin shared secret is configured
   and the origin sender is `noreply@notifications.makler-realty.com`.
   #194 still needs final CI, deployment and authorized delivery verification.
   Do not send customer messages as a setup test.
2. Supply or verify Search Console, Yandex Webmaster and backlink evidence.
   Reports must describe real services, not local fixtures.
3. Approve public translations, listing-fact reviews and legal/process copy.
   Hermes drafts cannot substitute for those approvals.
4. Confirm the per-URL `.ru` serve/redirect decision before any host cutover.
   Preserve `.com` and `.ru` crawl parity; do not invent blanket homepage redirects.
5. Time-based release criteria still require three consecutive successful
   releases and the specified seven successful scheduled checks/drills.
   They cannot be manufactured with a local test run.

## Safe recovery and cleanup

Read-only origin inspection is available through the existing agency host:

```bash
ssh -o BatchMode=yes root@157.230.109.185 \
  'readlink -f /opt/ms-realty/current; docker ps --format "{{.Names}} {{.Status}}"; df -h /opt'
```

Do not print environment files, tokens or full container configuration.
Read the failed workflow step before choosing a repair. Search projection,
Payload availability, readiness evidence and Worker/origin SHA parity are
separate checks.

Inventory first:

```bash
git worktree list --porcelain
git stash list
git branch --merged origin/main
git status --short
```

A merged branch does not prove its dirty worktree or stash is redundant.
Preserve and review unique diffs before removal. The original Claude audit
worktree contains 85 modified design-canvas files and generators; its layout
linter still reports issues in eight canvas files. The failed
admin-agent worktree also remains as recovery evidence; its runtime changes
were recovered separately in #217. Other old worktrees contain unique code.
Remove only individually verified clean, integrated worktrees using ordinary
`git worktree remove`, and branches using `git branch -d`; do not bulk-force
remove them to satisfy a zero-branches target.

`PRODUCTION_END_GOAL.md` retains the acceptance criteria and dated audit history.
Its historical counts and PR lists must be refreshed before acting on them.
