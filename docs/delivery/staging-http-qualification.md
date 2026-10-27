# Protected staging HTTP qualification scope

The read-only workflow `staging-http-qualification.yml` observes one existing deployment
bound to its exact source SHA and immutable candidate bundle. It does not deploy or approve
content. Its `transport` mode makes eight requests to protected health and staff session
gates. Its `full` mode adds route response/redirect mapping, retained body/article title/locale,
exact source gallery images in source order, source-backed media bytes and continuous HTTP
observations. Every initial failure remains in the result.

## Use the existing staging environment boundary

After the combined candidate passes its source/browser checks, its content is integrated
into reviewed `main`, and it is deployed through the existing staging procedure, dispatch
this workflow from `codex/msr-staging` at that same qualified source commit H. The commit
must contain this checker. Keep the existing staging environment's allowed-branch rule
unchanged; no new `main` secret-access grant is needed.

The prerequisite job requires the exact repository, manual event and staging branch,
matching workflow/run/source SHAs, the repository's qualified source, a clean exact
checkout, proof of integration in reviewed `origin/main`, and the successful staging deployment
workflow/run/attempt for that source. Only then can the protected environment resolve.
GitHub defines these workflow and commit identities in its
[variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
The immutable candidate bundle, image checks, observation-only credentials and shared
`ms-realty-staging` concurrency lock remain required. Reusing a deployment receipt for
another source or running an ahead/behind checker is rejected.

The prerequisite resolves `origin/main` once to commit S, then accepts either H as an
ancestor of S or exact equality of their entire Git trees. The second path supports a
reviewed squash merge without claiming ancestry. H remains the qualified CI, deployment,
workflow and verifier source; S establishes reviewed content integration. No path allows
a different HEAD or staged/unstaged tracked changes. Missing refs, missing objects and
Git errors fail closed. An ancestor H can have a different tree from a later S; the
recorded proof distinguishes that existing ancestry path from `exact_tree_squash`.

The qualification job checks pinned S again, verifies both clean H checkouts and their
trees, and repeats these checks after HTTP observations. A changed main ref, checkout or
proof fails the run. `qualification.json` retains H and its tree, S and its tree, proof
mode, ancestry/tree equality results and an integrity digest, including partial or failed
observations. `source-binding-before.json` and `source-binding-after.json` retain the
successful boundary checks; `sourceBindingVerified` is true only after both checks pass.
The digest detects record changes; it is not a signature or separate CI approval.

The companion Cloudflare inventory workflow keeps its redacted run artifact and cannot
commit or push generated inventory back to the staging branch. Such a push would advance
the branch beyond its qualified/deployed SHA and correctly fail this checker's guards.
Before promoting the combined candidate, retain the existing staging tip in its history
so promotion to H can fast-forward without discarding earlier inventory evidence. When
main uses squash commit S, the exact-tree proof permits staging to retain H and its history.
Source review does not move the live branch or rewrite that history.

The older frozen deployment does not contain this new workflow, so it cannot execute
this route. Keep that image held until the coordinated candidate is qualified. A source
review does not authorize branch promotion, deployment or workflow dispatch.

## HTTP evidence boundary

P21 retains the exact captured body and its SHA-256 in the source inventory, while the
reviewed reading view separates literal source facts and removes identified theme/plugin
residue. The HTTP checker binds the raw body hash to the rendered source marker and checks
the complete derived prose, every fact label/value in order and every safe source link.
Unknown markup and editorial prose remain literal. Omitting, changing or reordering facts,
replacing the body, or claiming a different source hash fails qualification. This uses the
same reviewed pure presentation function as the renderer; its independent source fixtures
and full-inventory preservation tests remain necessary. It does not approve source
equivalence, facts, translations, availability or media rights.

`passed` applies only to the named HTTP scope. `fullHttpQualificationPassed` records a
successful complete HTTP run. The ambiguous `fullQualificationPassed` field is omitted.
`fullLegacyParityQualified`, `seoQualified` and `sitemapConsistencyQualified` remain false
in every result, including a passing run. An empty document head can satisfy the body and
gallery checks; this checker makes no positive metadata or sitemap claim.

## Mandatory separate candidate evidence

Architecture section 18.2 and AT27/AT57 require a separate
`staging-url-seo-sitemap-parity.json` before complete legacy parity can be accepted. The
HTTP report names that outstanding evidence and its expected source SHA and image. That
reference is a requirement, not an existing receipt or a qualified image observation.

The separate receipt must bind the actual observed deployment to its source SHA, image and
gateway digests, route/source/data/config digests and policy revision. It must retain the
observation time, tool identity, assertion results, reviewer where required and redaction
status under architecture section 20.1. It must check:

- Every frozen URL on both domains against its recorded response, redirect and canonical
  mapping, including recorded exclusions and unresolved decisions.
- Locale, canonical and reciprocal hreflang behavior against explicitly approved source
  equivalence and translation eligibility. A captured translation is not human approval.
- Titles, descriptions and structured data against the same visible eligible content.
- Sitemap entries, metadata and public projections against the same current eligible
  revision, including their exclusions for held or stale content.
- Protected staging access and noindex behavior, with unapproved locales still held.

The separate evidence starts pending. Fixture tests and a passing HTTP run cannot supply
it. Staging must remain protected and noindex while these checks run; the receipt does not
authorize publication, indexability or cutover. The production launch authority and all
human content/rights decisions retain their existing gates.
