# Admin connections research — 10 September 2026

OpenRouter supports a provider-hosted authorization flow using a callback URL,
an S256 challenge, and a server-side exchange of the returned code and verifier.
It does not require the owner to paste an API key into MS Realty.
[OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth).

OAuth callbacks must use exact trusted redirect addresses; clients must prevent
open redirects and bind authorization to the initiating browser. The existing
signed state, owner identity check, host-only PKCE cookie and encrypted storage
remain required. [OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html).

Google requires a registered OAuth application and authorized redirect URI.
Consent should explain the access required by the actual workflow. A connect
button cannot substitute for missing provider-side configuration.
[Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

Linear makes integrations discoverable through a directory and a named settings
entry, with ownership and permissions available for review.
[Linear Integration Directory](https://linear.app/docs/integration-directory).

Applied design decision: one list of the six providers already represented by
MS Realty, a direct Connect action when authorization is available, account
identity for connected apps, and native disclosures for access, reconnect and
disconnect. Optional desktop clients and managed infrastructure are collapsed.
There is no mandatory completion score for optional integrations. Facebook and
Instagram descriptions now match their implemented publishing consumers.

Reproduced defects: clicking Dismiss set the banner's native `hidden` state but
component `display: grid` overrode it. The shared admin hidden rule restores the
browser contract. Production OAuth used the legacy workers.dev origin from a
canonical-domain session, losing both host-only cookies. Both server adapters
now use the existing canonical-domain allowlist for connection requests.

Validation boundaries: browser checks use the isolated QA server and a stubbed
Hermes suggestion. Provider round-trip tests use stubbed upstream responses.
Neither proves a real provider grant or production model availability.
