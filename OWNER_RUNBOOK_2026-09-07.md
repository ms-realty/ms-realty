# Owner runbook — what only you can run (2026-09-07)

Everything below was blocked for the agent by the auto-mode classifier or
needs credentials only you hold. Each step is copy-paste ready and uses the
`ms-realty` GitHub identity. Run them in order; each section says what it
unblocks.

## 0. Shell setup (once per terminal)

```bash
export GH_TOKEN="$(gh auth token -u ms-realty)"
gitms() { git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64)" "$@"; }
cd /Users/ivan/Code/MS-Realty
gitms fetch origin --prune
```

`gh` now acts as `ms-realty`; `gitms` pushes and fetches as `ms-realty`.

## 1. Hermes live-service evidence on the origin host (unblocks every deploy)

Every release rolls back at "Verify deployed Worker" because `/api/ready` is
503 while `live_services` lacks a Hermes worker report with one real attempt.
The translation dispatch is empty, so the only honest attempt is a
source-review task, and opening one needs a human `--confirm-task`.

```bash
ssh <your-deploy-user>@157.230.109.185
release="$(readlink -f /opt/ms-realty/current)"
cd "$release"
docker compose --env-file /opt/ms-realty/shared/.env.production-review \
  -f production/docker-compose.local-production.yml \
  -f production/docker-compose.production-review.yml \
  run --rm --no-deps app sh -c '
    if [ -f /runtime-evidence/hermes-draft-worker-report.json ]; then
      mv /runtime-evidence/hermes-draft-worker-report.json \
         "/runtime-evidence/hermes-draft-worker-report.$(date -u +%Y%m%dT%H%M%SZ).json"
    fi
    node production/scripts/run-hermes-source-review.mjs \
      --listing MS-CRAWL-0002 --task "source-review-$(date -u +%Y%m%d)" \
      --actor "Ivan Peychev" --owner agency_admin \
      --reason "Release evidence: Hermes source passage review" \
      --report /runtime-evidence/hermes-draft-worker-report.json --confirm-task'
```

After the lot-number rekey (section 4) lands, the listing id in that command
becomes `MS-00907`; the merged branch already updates `DEPLOYMENT.md`.

Confirm from your laptop that the origin now reads back the task:

```bash
curl -s https://ms-realty.ms-realty-bg.workers.dev/api/health | jq '{build_marker,blockers}'
```

`live_services` should leave the blockers on the next release capture (it is
evaluated during deploy, not instantly). The report is valid for seven days.

## 2. Land the two release fixes and trigger one release

Branch protection is off and auto-merge merges any green non-draft PR and
fires the deploy, so "ready" means "deploy now".

**#178, preserve readiness evidence across rollback.** The agent rebased it
onto today's main (26 tests pass) and published the result as
`claude/pr178-rebased-on-main`. Put it back on the PR branch and undraft:

```bash
gitms push --force-with-lease=codex/rollback-readiness-evidence-fix:26d38a498e69d3fe58238d9aecfc724b4cf4526d \
  origin origin/claude/pr178-rebased-on-main:refs/heads/codex/rollback-readiness-evidence-fix
gh pr ready 178
gh run watch "$(gh run list --branch main --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Wait for `Deploy production` to finish before the next merge (deploys are
serialized on purpose).

**#197, release the hold without unrouting.** Already on the main tip, green:

```bash
gh pr ready 197
```

Then verify the release:

```bash
sha="$(git rev-parse origin/main)"
curl -s https://makler-realty.com/api/health | jq --arg s "$sha" '{ok: (.build_marker==$s and .origin_build_marker==$s), blockers}'
curl -s -o /dev/null -w 'ready %{http_code}\n' https://makler-realty.com/api/ready
```

If `Deploy production` still rolls back, open the run and read the first
`Verify` step that failed; the agent's audit says the only remaining blocker
after section 1 is timing (cold render, section 7).

Afterwards delete the helper branches:

```bash
gh api -X DELETE repos/ms-realty/ms-realty/git/refs/heads/claude/pr178-rebased-on-main
```

## 3. PR #194 is not redundant, retitle it

Its first commit is on main as #196; its second commit (Cloudflare Email
Workers mail, +215) is not. The agent could not edit the PR.

```bash
gh pr edit 194 --title "Send mail through Cloudflare Email Workers, pinned to the agency inbox" --body-file - <<'EOF'
This branch now carries two things. The first, letting the release capture reuse a self-hosted source-review report, already landed on main as #196. What remains here is the second commit: outbound mail goes through a Cloudflare Email Worker bound to the agency inbox, with the send boundary pinned by `production/test/email-send-boundary.test.mjs` and `payload-email.test.mjs`.

Remaining diff against main: `payload.config.js`, `production/lib/payload-email.mjs`, `workers/email-send-boundary.mjs`, `workers/index.js`, `wrangler.jsonc`, the production-review compose file, and the DEPLOYMENT.md section on mail. Nine files, +215.

Kept as draft until the Email Routing destination is verified in the Cloudflare dashboard.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Merge it only after the Email Routing destination address is verified in the
Cloudflare dashboard for the zone, otherwise the first send fails.

## 4. Lot-number rekey (#182), merged with main and fully green

The agent merged `origin/main` into `feat/legacy-lot-identity`, resolved the
eight code conflicts, removed a duplicated `searchPath`, restored the listing
editor heading the merge had dropped, rekeyed nine tests main had added with
crawl-era ids, and ran the whole CI chain locally:

| check | result |
|---|---|
| `npm run validate` (two passes) | 10 PASS lines, converged |
| `npm test` | 2007 pass, 0 fail, 1 optional skip |
| `next build` + `next:smoke` | passed, `launch_ready:false` as expected |

Published as `claude/pr182-merged-main` (two commits on top of the old head
`a59b02ab`). Land it **after** section 2 is live, because it moves every
listing URL and the release must carry the slug-history 301s:

```bash
gitms push --force-with-lease=feat/legacy-lot-identity:a59b02ab40c284f87540270081ab5f2aab584d68 \
  origin origin/claude/pr182-merged-main:refs/heads/feat/legacy-lot-identity
gh pr ready 182
```

After it deploys, spot-check live:

```bash
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://makler-realty.com/bg/imoti/MS-CRAWL-0001
curl -s https://makler-realty.com/sitemap.xml | grep -c '/imoti/MS-0'
```

Expected: `301 -> https://makler-realty.com/bg/imoti/MS-00815` and 127 lot-number listing URLs.
Then the Hermes command in section 1 uses `MS-00907`.

## 5. Two PRs that need your decision

**#177** (owned-origin admin login exception): rebased clean as
`claude/pr177-rebased-on-main`. #174 and #176 already fixed canonical admin
login posts; check whether #177 still changes behaviour before landing:

```bash
gitms diff origin/main origin/claude/pr177-rebased-on-main --stat
# keep:
gitms push --force-with-lease origin origin/claude/pr177-rebased-on-main:refs/heads/codex/admin-login-owned-origin-pair && gh pr ready 177
# drop:
gh pr close 177 --delete-branch --comment "Superseded by #174 and #176."
```

**#173** (durable tasks and owner-approved automation, +3877): rebase conflicts
in four files (`owner-operator-catalog.mjs`, `owner-operator-coverage.json`,
two tests). Keep it only if the automation UI is on the roadmap; otherwise:

```bash
gh pr close 173 --delete-branch --comment "Parked: no UI planned for the automation runner in the release scope."
```

## 6. Repository settings (need admin scope the local tokens lack)

```bash
# branch protection: the check job must pass before auto-merge
gh api -X PUT repos/ms-realty/ms-realty/branches/main/protection --input - <<'EOF'
{"required_status_checks":{"strict":false,"contexts":["npm run check"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_deletions":false,"allow_force_pushes":false}
EOF
# Dependabot alerts
gh api -X PUT repos/ms-realty/ms-realty/vulnerability-alerts
# visibility is PUBLIC today; if that is not intended:
gh api -X PATCH repos/ms-realty/ms-realty -f visibility=private
```

## 7. Cold render is 13 seconds (blocks probes, hurts SEO)

Measured today: first byte 13.4 s on `/bg` with `cf-cache-status: DYNAMIC`,
1.0 s when cached, 4.5 s for any uncached 404. On the host, split edge from
origin:

```bash
ssh <your-deploy-user>@157.230.109.185
for i in 1 2 3; do curl -s -o /dev/null -w 'origin ttfb %{time_starttransfer}s\n' -H 'Accept: text/html' http://127.0.0.1:3200/bg; done
docker stats --no-stream
docker compose --env-file /opt/ms-realty/shared/.env.production-review \
  -f "$(readlink -f /opt/ms-realty/current)/production/docker-compose.local-production.yml" \
  -f "$(readlink -f /opt/ms-realty/current)/production/docker-compose.production-review.yml" logs --tail 200 app | grep -iE 'slow|timeout|postgres|render' | tail -30
```

Paste the three numbers back to the agent; the fix depends on whether the
origin itself is slow (Payload/Postgres cold connections, uncached projection)
or only the edge miss path is.

## 8. Local cleanup the classifier refused

Read once, then run. Nothing here touches a branch with an open PR or a dirty
worktree.

```bash
cd /Users/ivan/Code/MS-Realty
# stashes: all nine are WIP on merged branches, 2026-07-31 … 2026-09-01
git stash list
for i in $(seq 1 "$(git stash list | wc -l | tr -d ' ')"); do git stash drop stash@{0}; done

# worktrees whose branch is merged or detached with nothing in them
for w in /Users/ivan/.codex/worktrees/d2d3/MS-Realty /Users/ivan/.codex/worktrees/f031/MS-Realty \
  .codex/worktrees/apex-root-retain-200 .codex/worktrees/documents-signatures \
  .codex/worktrees/hermes-native-completion .codex/worktrees/hermes-upstream-update \
  .codex/worktrees/integration-oauth-aggregator .codex/worktrees/public-construction-hold \
  .codex/worktrees/r2-evidence-capture .codex/worktrees/hermes-owner-os-documents-layer \
  .codex/worktrees/hermes-owner-os-integration .codex/worktrees/hermes-owner-os-oauth-layer \
  .claude/worktrees/ms-realty-redesign-finish-981bcd; do git worktree remove --force "$w"; done
git worktree prune

# merged local branches (PR merged or content identical to main)
git branch -D codex/ai-native-owner-os codex/canonical-production-proof codex/complete-listing-translations \
  codex/durable-media-lifecycle codex/fix-password-change-production codex/fix-pre-origin-readiness-baseline \
  codex/fix-production-cms-resync codex/fix-public-origin-deploy codex/fix-r2-freshness-clock \
  codex/fix-worker-module-release codex/hermes-native-completion codex/ms-realty-owner-operator-plugin \
  codex/owner-runtime-authority codex/production-safe-rollout codex/public-construction-coverage \
  codex/public-construction-hold codex/public-contact-email codex/r2-evidence-capture codex/r2-media-repair \
  codex/reconcile-production-cms-seed codex/remove-production-mocks codex/worker-release-unblock \
  codex/workers-admin-production codex/workers-dev-authority-cleanup codex/workers-dev-final-origin \
  fix/durable-outage-resilience fix/preview-admin-access codex/apex-root-retain-200 codex/documents-signatures \
  codex/durable-media-production-fix codex/hermes-upstream-update codex/integration-oauth-aggregator \
  codex/remove-legacy-public-origin-secret codex/fix-worker-module-import codex/ms-realty-owner-operator-release \
  codex/hermes-owner-os-documents-layer codex/hermes-owner-os-integration codex/hermes-owner-os-oauth-layer \
  claude/ms-realty-redesign-finish-981bcd

# obsolete remote branch with no PR (removes a lead-authority path main still needs)
gh api -X DELETE repos/ms-realty/ms-realty/git/refs/heads/codex/fix-worker-module-import
```

Branches that stay until you decide keep-or-drop (each has unique code and no
PR): `codex/hermes-owner-os-operations-ui` (+4599, 5 dirty files),
`codex/website-cms-pages` (+2413), `codex/media-library-admin-ui` (+1480),
`codex/operator-artboard-shell`, `codex/com-canonical-production` and
`-release`, `codex/ms-realty-owner-operator-package`,
`codex/makler-realty-cloudflare-cutover` (15 dirty files in
`~/.codex/worktrees/7e0d`), `codex/ms-realty-product-spec` (docs only),
`claude/admin-panel-redesign-56f213`, `claude/ms-realty-redesign-finish-3f309b`,
and the #182 family (`hold/*`, `worktree-agent-*`, `claude/relaxed-mestorf-fbd4b7`,
`claude/ms-realty-integration`), which become deletable once #182 lands.

## 9. Cloudflare and DNS (dashboard only, account ms.realty.bg@gmail.com)

- `makler-realty.ru/robots.txt` is served by the holding Worker
  `ms-realty-under-construction` and advertises the `workers.dev` sitemap.
  Either point that Worker's robots at `https://makler-realty.com/sitemap.xml`
  or decide the `.ru` cutover (serve or `301` to `.com`) and add the routes to
  `wrangler.jsonc`.
- Verify the Email Routing destination before merging #194.
- Search Console and Yandex Webmaster ownership for `makler-realty.com`; the
  `seo:preflight` gate reads their exports.

## 10. Monitoring drill

The daily drill has failed ten times in a row with `health must report
expected build marker`. Read the newest run before the next release changes
the marker:

```bash
gh run view "$(gh run list --workflow monitoring-drill.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log | grep -E 'build_marker|expected|isolated' | head -40
```

Once a drill passes, close the nine receipt issues:

```bash
for n in 124 147 150 162 164 179 183 187 195; do gh issue close "$n" --comment "Drill passing; receipt retained in the run artifacts."; done
```
