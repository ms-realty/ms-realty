# Approved Cloudflare recovery alternative

ADR 0006 is the current decision. Cloudflare replaces the earlier AWS requirement.
Ivan is the sole operator using the existing identity; no second person or separately
administered account is required for the current protected staging setup.

Use private EU R2 recovery storage, encryption, immutable conditional writes, complete
checksummed manifests and a verified encrypted copy outside the application account.
Preserve existing retention. R2 administrators can remove locks; that accepted tradeoff
and the shared operator must remain visible in every recovery report.

The operator's own review is not independent review. A real R2 round trip and closed
restore cannot establish safety-tail completeness, signed reopening authority, recovery
objectives or production acceptance merely by configuration.

Follow `README.md` and the single-operator input model. Keep credentials private.
Unknown current revocations or provider outcomes keep the restored destination closed.
Ratify the draft production policy for this model before production launch; do not invent
a second reviewer or silently satisfy its older independent assertions.
