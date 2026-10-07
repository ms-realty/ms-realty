# Access administration: Case picker visibility

The client-invitation picker on `/[locale]/access/manage` selected the first 200 Cases without
the caller's Case-read filter. A staff member with only `access.grant` could therefore receive
Case references and titles in the rendered page. Access administration is not Case-read authority.

The picker now uses the existing `caseVisibility` SQL predicate before its 200-row limit.
This preserves the normal access-management commands and independent server authorization.
The screen has no Case search/pagination implementation or separate Case-list JSON API:
its native submit route delegates to the existing invitation/grant services. Query parameters
cannot widen the picker, and the server-rendered response must not include forbidden titles.

The browser regression uses a real staff session with access administration alone and 201
synthetic Cases. Before the fix it expected zero choices and received 200. After the fix it
shows zero, then exactly one Case after a narrowly scoped read grant, then zero after revocation.
The allowed record is beyond the former limit, demonstrating filtering before limiting.
The test also checks the raw response and attempts `q`/`page` parameters. It runs in the existing
required browser suite, not an optional manual check.

Evidence in `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:

- `access-case-visibility-repro.log`: reproduced 200 forbidden choices. The earlier `red.log`
  failed on an invalid synthetic stage and was not a reproduction; the fixture was corrected.
- `access-case-visibility-green.log`: fresh Linux production build and all three browser profiles
  passed the deny/scoped-grant/revoke path. Later raw-response/query coverage is recorded in the
  joined `coverage-access-linux-final.log`: all three Case-picker checks passed, including raw
  response/query assertions. That joined run had six separate container DNS failures;
  `offboarding-linux-dns.log` passed those six with the explicit hosts mapping and unchanged
  production build. `access-case-lint.log` passed.

## Deployment boundary

The route was introduced in recovery commit `24b9b394`, on the unmerged PR #280 branch.
The GitHub API reported main as `aa2860d5646cd788f560640b92f7f7a5b81337db` on 29 September;
its complete tree does not contain this route or the new Case query service. The repository's
GitHub Deployments API returned no deployments. That establishes source scope, not the exact
identity of every running installation. This task has not deployed the branch; the deployed
production SHA was not independently established here. Do not claim a production leak, actual
third-party access or a deployed remediation from these synthetic checks.
