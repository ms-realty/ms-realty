# Admin authorization return — checkpoint

Branch `codex/msr-auth-return-20260915`, based on `68bfd457`.

## Root cause

The admin OAuth return URL carried its own routing context in query parameters:
`operator-provider-catalog.mjs:redirectUri()` builds
`{origin}/api/admin/connections?provider={id}&action=callback`, and the OpenRouter
start additionally sets `state` on it before passing the whole thing to
`https://openrouter.ai/auth?callback_url=...`.

OpenRouter documents only that the user "will be redirected back to your site with
a `code` parameter in the URL" (https://openrouter.ai/docs/use-cases/oauth-pkce,
https://openrouter.ai/docs/guides/overview/auth/oauth), and separately announced
that a `state` query parameter may be passed in the callback URL
(https://openrouter.ai/blog/announcements/privacy-clarity-new-providers-oauth-upgrade-and-gemini-gets-parallel-tools/).
Neither page documents preservation of any other query parameter. The observed
return matches that: `state` survives, `provider` and `action` do not.

Both dispatchers keyed the callback entirely on those two unsigned parameters
(`http.mjs` former line 5227/5244, `app-admin-adapter.mjs` former line 5085), so a
real return missed the callback branch, reached the `GET && !action` branch
(`http.mjs` former 5147, adapter former 4987) and rendered the
`provider_connections` inventory JSON into the operator's browser. The
unauthenticated precondition (`http.mjs` former 2887, adapter former 4335) had the
same `action === "callback"` condition, so a return on an expired session produced
an unauthorized JSON body instead of the login page.

Documented vs inferred: the OpenRouter return shape above is documented; that the
drop of `provider`/`action` is what the user's screenshot shows is observed; the
defect in both dispatchers is read directly in code and reproduced below.

The defect is not OpenRouter-specific. Any provider return that does not echo the
route parameters back would have hit the same fallthrough.

## Fix

Route and provider context now come out of the signed state and nothing else.

- `provider-connections.mjs` — new `readProviderOAuthState()`. Fixed trust order:
  timing-safe HMAC, then version/shape/expiry, then equality with the operator id
  of the session making the request. Only then does it return the payload, so the
  provider name is read out of the signature rather than taken from the query.
  `verifyProviderOAuthState()` is now that function plus the caller's expected
  provider; its error strings are unchanged.
- `operator-connect-routes.mjs` — `isOperatorConnectionReturn()` and
  `operatorConnectionReturn()`. The first is a syntactic test on unsigned input
  (`state`/`code`/`error`, or `action=callback`) used only to tell a browser round
  trip apart from an inventory read. The second decides what the return is:
  `unattributable`, `declined`, `incomplete`, `exchange`. A query `provider=` or
  `action=` that contradicts the signature yields `unattributable` rather than
  being resolved in the signature's favour.
- `http.mjs`, `app-admin-adapter.mjs` — three matching changes each: the
  unauthenticated precondition and the inventory branch both consult
  `isOperatorConnectionReturn`, and the callback branch is replaced by one driven
  by `operatorConnectionReturn`. Role, payload-session and owner-admin gates are
  untouched and still run before any return handling.
- `operator-connect-copy.mjs`, `operator-connect.mjs` — one new result state,
  `resultReturnExpired`, in bg/ru/en, reached by `/admin/connect?expired=1`. It
  names no provider on purpose and renders with the error tone.

Nothing in a redirect location is caller-controlled: every target is a literal
path plus our own keys, with the provider (from the signed state) URL-encoded.

## Evidence

All commands from `/Users/ivan/Code/MS-Realty-auth-return-20260915`.

### Red before

```
node /Users/ivan/Documents/Codex/2026-09-12/realtime-voice-chat-2/outputs/ms-realty/auth-return-20260915/reproduce-callback-fallthrough.mjs .
{"case":"state-only","status":200,"raw_inventory":true,"location":null,"provider_calls":0}
{"case":"cancelled","status":200,"raw_inventory":true,"location":null,"provider_calls":0}
{"case":"code-without-route-context","status":200,"raw_inventory":true,"location":null,"provider_calls":0}
{"ordinary_json_api":"preserved","failures":3}
```

```
node /Users/ivan/Documents/Codex/2026-09-12/realtime-voice-chat-2/outputs/ms-realty/auth-return-20260915/review-openrouter-return.mjs .
{"tests":24,"failures":18,"source":"."}
```

```
node --test production/test/operator-connect-routes.test.mjs     # source at HEAD, new test present
not ok 12 - both owner runtimes resolve a provider return from its signed state, not from route parameters
# pass 11  # fail 1
```

### Green after

```
node .../reproduce-callback-fallthrough.mjs .
{"case":"state-only","status":303,"raw_inventory":false,"location":"/admin/connect","provider_calls":0}
{"case":"cancelled","status":303,"raw_inventory":false,"location":"/admin/connect","provider_calls":0}
{"case":"code-without-route-context","status":303,"raw_inventory":false,"location":"/admin/connect","provider_calls":1}
{"ordinary_json_api":"preserved","failures":0}
```

```
node .../review-openrouter-return.mjs .
{"tests":24,"failures":0,"source":"/Users/ivan/Code/MS-Realty-auth-return-20260915"}
```

```
node --test production/test/http-provider-connections.test.mjs     # pass 4   fail 0
node --test production/test/provider-connections.test.mjs          # pass 12  fail 0
node --test production/test/operator-connect-routes.test.mjs       # pass 12  fail 0
node --test production/test/operator-provider-connect.test.mjs     # pass 24  fail 0
node --test production/test/operator-connect.test.mjs              # pass 5   fail 0
```

Scoped route regressions, 114 pass / 0 fail:

```
node --test production/test/admin-cms-screens.test.mjs production/test/admin-login-and-fallbacks.test.mjs \
  production/test/admin-role-access.test.mjs production/test/admin-sign-in-hardening.test.mjs \
  production/test/app-route-parity.test.mjs production/test/app-admin-routes.test.mjs \
  production/test/operator-integration-aggregator.test.mjs production/test/owner-operator-coverage.test.mjs \
  production/test/provider-admin-routes.test.mjs production/test/custom-admin-payload-auth.test.mjs \
  production/test/mcp-server.test.mjs production/test/runtime-data-authority.test.mjs
```

The external reviewer script is unchanged.

## Coverage added

`production/test/operator-connect-routes.test.mjs` — one test driving both the
standalone runtime and the Next adapter from a real `action=start`, then replaying
the return shapes a provider actually sends:

| case | expected |
| --- | --- |
| `state` + `code`, no route parameters | `303 /admin/connect?connected=ai`, PKCE cookie spent, exactly one exchange and one verification, one encrypted row, no code/key/state in location, body or audit |
| `state` + `error=access_denied` | `303 /admin/connect?error=ai`, no provider call, no row |
| `state`, no code | `303 /admin/connect?error=ai`, no provider call, no row |
| forged state | `303 /admin/connect?expired=1`, no provider call, no row |
| no state at all | `303 /admin/connect?expired=1`, no provider call, no row |
| expired state | `303 /admin/connect?expired=1`, no provider call, no row |
| `provider=google` against an `ai` state | `303 /admin/connect?expired=1`, no provider call, no row |
| valid return, PKCE cookie absent | `303 /admin/connect?error=ai`, no provider call |
| valid return, no admin session | `303 /admin/login`, no provider call |
| plain inventory read | `200 provider_connections` |

`production/test/provider-connections.test.mjs` — `readProviderOAuthState` names
its provider only after signature, expiry and operator binding all hold; rejects a
tampered signature, another operator, an expired state and a wrong secret;
`verifyProviderOAuthState` still refuses an unexpected provider.

`production/test/operator-provider-connect.test.mjs` — `resultReturnExpired` exists
in every connect locale, names no provider, and loses to a completed connection.

## Limits

- No live provider account was contacted. Every provider call in these tests and
  in both external scripts is a local stub with synthetic credentials. Nothing
  here is evidence that the real OpenRouter, Google, Meta or GitHub round trip
  succeeds in production.
- Google, Meta and GitHub have no configured credentials in this environment, so
  their returns are exercised only through the shared state and routing logic.
  They remain truthfully unavailable; that is unchanged by this work.
- The signed state is still replay-protected only by its ten-minute TTL — there is
  no nonce store. That is pre-existing and untouched; a genuine single-use
  guarantee would need durable storage and is out of scope here.
- Whether OpenRouter preserves arbitrary callback-URL query parameters is not
  documented either way. The fix does not depend on the answer: it no longer reads
  routing context from the query at all.
- Delegated investigation and review agents were unavailable for this session —
  every nested agent failed with "out of usage credits" — so the trace, the patch
  and the regressions are this session's own work, cross-checked against the
  independent reviewer script.
- Not run here: the full `npm test` sweep and any build. Flagging for the parent
  rather than starting one unannounced.

## Changed paths

```
production/lib/provider-connections.mjs
production/lib/operator-connect-routes.mjs
production/lib/operator-connect-copy.mjs
production/lib/operator-connect.mjs
production/lib/http.mjs
production/lib/app-admin-adapter.mjs
production/test/provider-connections.test.mjs
production/test/operator-connect-routes.test.mjs
production/test/operator-provider-connect.test.mjs
AUTH-RETURN-CHECKPOINT.md
```
