# Workflow context and reading order

Direct review in the delivery session; no independent-agent review is claimed.

The seller preview already returned to its authorized client Case, and AI drafts already
retained the minimized immutable source. The changes address reading order: broker open tasks
precede the long requirements editor, and the AI source precedes proposed text. A native
disclosure keeps model/digest/cost metadata available after review without separating the
source from the proposed text. Source status and stale-source warning remain visible. Staff
labels are supplied in BG/EN/RU. No capability, command, source minimization, grant, provider
or public-indexing behavior changed.

The added browser assertions click the real task and seller return links, check the target
record and host, verify source-before-draft ordering, open generation details, and retain
existing client-private-text denial, stale-source review rejection and revoked-access denial.
Seller journeys run without JavaScript.

Validation: TypeScript and repository lint (789 files) passed. Fresh Linux build followed by
15 scenarios across Chromium desktop/mobile and WebKit mobile passed. After the generation
disclosure refinement, another fresh build and all nine AI scenarios passed. The initial
run had nine passes and six DNS failures in Playwright API requests: the disposable container
lacked `my.localhost` in its hosts file. Adding loopback aliases to that container resolved
the environment failure; no application DNS behavior or test assertion was weakened.

Desktop/mobile screenshots are retained; the mobile WebKit Case and final AI screen were
visually inspected. Tasks now precede the requirements editor; source, draft, quotes, warnings
and review read in order. Existing palette, spacing and controls are preserved. The layout
detector reports no findings. This does not establish all locale/zoom/a11y/design parity.

Evidence: `/Users/ivan/Code/.artifacts/ms-realty/workflow-context/20260929`. Final Case/seller
run: `27fe101541274bab897f57cdd0059577`; final AI run: `0e7fbaba05df4c3b96ab5d3e0f85a374`.
Remote CI is still required for the new commit. Mobile comparison/client message designs and
overall design acceptance remain open pending exact revised source contracts.
