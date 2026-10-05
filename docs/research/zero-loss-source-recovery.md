# Zero-loss source recovery checkpoint

The frozen 457-row legacy baseline still has 88 unresolved primary-content identities.
No source-to-target equivalence has been approved, the 268 historical `approved_410`
decisions remain revoked, and this checkpoint does not permit production deployment.

Read-only public GET recovery replaced 223 recorded DNS/handshake failures with
successful captures. The live sitemap index and all 71 listed sub-sitemaps were
captured as immutable, hash-addressed XML. Their 154 URL identities and the source
links discovered from saved HTML were visited in explicit batches of at most 40.
The last frontier has no unrequested discovered links. This establishes bounded
traversal closure for these observations; it does not establish a complete current
listing inventory or approve any missing/empty page.

The final `live-delta.json` records 1,138 requested source identities and 1,078
successful captures. The remaining observations include 54 HTTP404 responses and
six old binary-photo decoding failures, which need media evidence rather than HTML
page projections. The staging export contains 1,108 prepared source pages/routes:
991 same-path200 candidates and 117 one-hop301 candidates. It explicitly holds 243
excluded identities. These pages have not been imported into a serving staging app.

The 88 frozen-baseline primary-source gaps consist of 61 historical `.ru` identities
requiring original WordPress content, nine live404 pages without verified historical
main text, three live200 soft404 pages, and 15 empty archives without verified main
text or cards. Exact URLs and available excerpts are listed in the controller's
`output/msr-launch/source-recovery/required-primary-sources.json`. None of these
conditions authorizes a builder-selected removal or homepage redirect.

A later read-only check queried the live `.com` WordPress REST index and its exposed
`posts`, `pages` and `categories` collections by the exact slugs of all 27 unresolved
`.com` URLs. Three `/category/` URLs returned exact taxonomy records with short
descriptions and current count zero; no exact record appeared in these collections
for the other 24. The API did not expose the historical archive cards, custom listing
content or original main text needed for equivalence. This observation changes no
unresolved row or redirect decision; an original export/backup or independent
historical source remains necessary.

The larger real source set exposed a generator memory failure. Source extraction
now closes each jsdom window, and re-extraction yields between bounded batches so
queued document lifecycle work can drain. A narrow, source-specific selector also
retains WordPress's published HTML sitemap pages; unrelated pages cannot gain a
primary-content classification from an arbitrary table. No source scripts execute.

Validation: 25 targeted legacy tests pass, root typecheck and scoped lint pass, and
the complete immutable-source generator exits0 with the normal Node heap. Raw HTML
and XML hashes, export hash, route counts and held launch flags were checked. The
generator's measured peak footprint was 1,571,644,504 bytes. The initial memory
failure and missing local OpenNext dependency are retained in the evidence logs;
the latter was repaired from the existing lockfile without package changes.

The previously qualified local Containers image is tied to source `a3db2ec0` and
does not contain this expanded migration checkpoint. A future staging candidate
must package the final source and data once, publish an immutable provider digest,
and pass the independent staging checker. On 2 October, the owner corrected the
GitHub identity to `ms-realty`. The source checkpoint was pushed successfully and
Environment `staging` was created with a branch policy for `codex/msr-staging`.
The earlier write/admin403 responses came from the superseded identity and do
not establish an MS Realty access problem. Fresh staging-only secrets and actual
isolated Postgres/Tunnel/Access/R2/HTTPS inputs still prevent staging deployment.
No production routes, DNS, buckets, UI or Figma assets changed in this checkpoint.
