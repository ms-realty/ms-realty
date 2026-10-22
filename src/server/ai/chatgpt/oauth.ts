import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import {
  type ChatGptCredential,
  type ChatGptCredentialStore,
  ChatGptError,
  chatGptIssuer,
  chatGptResource,
  credentialSchema,
  directScope,
  registrationId,
} from "./types";

const authorizationEndpoint = `${chatGptIssuer}/api/accounts/authorize`;
const tokenEndpoint = `${chatGptIssuer}/api/accounts/oauth/token`;
const jwks = createRemoteJWKSet(new URL(`${chatGptIssuer}/.well-known/jwks.json`), {
  timeoutDuration: 10_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});
const random = () => randomBytes(32).toString("base64url");
function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export interface OAuthAttempt {
  clientId: string;
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly hostId: string;
  readonly selected: ChatGptCredential | null;
  readonly label: string;
  readonly expiresAt: number;
  consumed: boolean;
}
export function beginAuthorization({
  redirectUri,
  hostId,
  selected = null,
  label = "MS Realty Butler",
  now = Date.now(),
  includeHints = false,
  issuedClientId,
}: {
  redirectUri: string;
  hostId: string;
  selected?: ChatGptCredential | null;
  label?: string;
  now?: number;
  includeHints?: boolean;
  issuedClientId?: string;
}): { attempt: OAuthAttempt; url: string } {
  const callback = new URL(redirectUri);
  if (
    callback.protocol !== "http:" ||
    callback.hostname !== "127.0.0.1" ||
    callback.pathname !== "/auth/callback" ||
    callback.search ||
    callback.hash ||
    callback.username ||
    callback.password
  )
    throw new ChatGptError("chatgpt_callback_invalid", "configuration");
  const attempt: OAuthAttempt = {
    clientId: selected?.clientId ?? issuedClientId ?? "dynamic_agent_client",
    state: random(),
    nonce: random(),
    verifier: random(),
    redirectUri: callback.href,
    hostId,
    selected,
    label: label.trim().slice(0, 160) || "MS Realty Butler",
    expiresAt: now + 600_000,
    consumed: false,
  };
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: attempt.clientId,
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource: chatGptResource,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
  }).toString();
  if (attempt.clientId === "dynamic_agent_client")
    url.searchParams.set("agent_name_hint", "MS Realty Butler");
  if (includeHints && selected?.tokens) {
    url.searchParams.set("id_token_hint", selected.tokens.idToken);
    if (selected.email) url.searchParams.set("login_hint", selected.email);
  }
  return { attempt, url: url.href };
}
export async function boundedJson(response: Response, maxBytes = 131_072): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ChatGptError("chatgpt_empty_response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ChatGptError("chatgpt_response_oversize");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ChatGptError("chatgpt_response_invalid");
  }
}
const tokensSchema = z.object({
  access_token: z.string().min(1).max(32_768),
  refresh_token: z.string().min(1).max(32_768).optional(),
  id_token: z.string().min(1).max(32_768).optional(),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive().max(604_800),
  scope: z.string().max(8192).optional(),
});
type TokenResponse = z.infer<typeof tokensSchema>;
export interface OAuthDependencies {
  fetch?: typeof fetch;
  key?: JWTVerifyGetKey;
  now?: () => number;
}
async function exchange(form: URLSearchParams, deps: OAuthDependencies): Promise<TokenResponse> {
  const response = await (deps.fetch ?? fetch)(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await boundedJson(response);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    const terminal =
      error.success && ["invalid_grant", "invalid_client"].includes(error.data.error);
    throw new ChatGptError(
      terminal ? "chatgpt_reauthorization_required" : "chatgpt_token_exchange_failed",
      terminal ? "reauthorize" : "later",
    );
  }
  return tokensSchema.parse(body);
}
export async function verifiedIdentity(
  token: string,
  clientId: string,
  deps: OAuthDependencies = {},
  nonce?: string,
) {
  const { payload } = await jwtVerify(token, deps.key ?? jwks, {
    issuer: chatGptIssuer,
    audience: clientId,
    algorithms: ["RS256", "ES256"],
    requiredClaims: ["iss", "aud", "sub", "iat", "exp"],
    clockTolerance: 5,
    currentDate: new Date((deps.now ?? Date.now)()),
  });
  if (
    !payload.sub ||
    (nonce !== undefined &&
      (typeof payload.nonce !== "string" || !equalSecret(payload.nonce, nonce)))
  )
    throw new ChatGptError("chatgpt_identity_invalid", "reauthorize");
  return { subject: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}
function scopesOf(response: TokenResponse, previous?: readonly string[]): string[] {
  const scopes =
    response.scope === undefined
      ? [...(previous ?? [])]
      : response.scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes(directScope))
    throw new ChatGptError("chatgpt_plan_scope_missing", "configuration");
  return [...new Set(scopes)];
}
function unique(params: URLSearchParams, name: string, required = true): string | null {
  const values = params.getAll(name);
  if (values.length > 1 || (required && (values.length !== 1 || !values[0])))
    throw new ChatGptError("chatgpt_callback_invalid", "configuration");
  return values[0] ?? null;
}
export async function finishAuthorization(
  attempt: OAuthAttempt,
  callbackUri: string,
  deps: OAuthDependencies = {},
): Promise<ChatGptCredential> {
  const now = (deps.now ?? Date.now)(),
    callback = new URL(callbackUri),
    expected = new URL(attempt.redirectUri);
  if (
    attempt.consumed ||
    now > attempt.expiresAt ||
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname
  )
    throw new ChatGptError("chatgpt_attempt_expired", "reauthorize");
  const state = unique(callback.searchParams, "state");
  if (!state || !equalSecret(state, attempt.state))
    throw new ChatGptError("chatgpt_state_invalid", "reauthorize");
  attempt.consumed = true;
  const returnedClient = unique(callback.searchParams, "client_id", false);
  const knownClient = attempt.clientId === "dynamic_agent_client" ? null : attempt.clientId;
  const clientId = knownClient ?? returnedClient;
  if (knownClient && returnedClient && returnedClient !== knownClient)
    throw new ChatGptError("chatgpt_client_invalid", "reauthorize");
  // Retain an issued public client for a new authorization, including after denial.
  // It is never an account credential until the ID token has been verified.
  if (clientId && clientId !== "dynamic_agent_client") attempt.clientId = clientId;
  if (unique(callback.searchParams, "error", false))
    throw new ChatGptError("chatgpt_authorization_denied", "reauthorize");
  const code = unique(callback.searchParams, "code");
  if (
    !clientId ||
    clientId === "dynamic_agent_client" ||
    (knownClient && returnedClient && returnedClient !== knownClient)
  )
    throw new ChatGptError("chatgpt_client_invalid", "reauthorize");
  const response = await exchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: code ?? "",
      code_verifier: attempt.verifier,
      redirect_uri: attempt.redirectUri,
      resource: chatGptResource,
    }),
    deps,
  );
  if (!response.id_token || !response.refresh_token)
    throw new ChatGptError("chatgpt_token_response_incomplete", "reauthorize");
  const identity = await verifiedIdentity(response.id_token, clientId, deps, attempt.nonce);
  if (attempt.selected && identity.subject !== attempt.selected.subject)
    throw new ChatGptError("chatgpt_account_mismatch", "reauthorize");
  const { access_token: accessToken, refresh_token: refreshToken, id_token: idToken } = response;
  return credentialSchema.parse({
    issuer: chatGptIssuer,
    clientId,
    ...identity,
    label:
      attempt.selected?.label ??
      `${attempt.label.slice(0, 140)} (${registrationId({ issuer: chatGptIssuer, clientId, subject: identity.subject }).slice(0, 12)})`,
    hostId: attempt.hostId,
    savedAt: now,
    tokens: {
      accessToken,
      refreshToken,
      idToken,
      scopes: scopesOf(response),
      expiresAt: now + response.expires_in * 1000,
    },
  });
}
export async function saveRegistration(
  store: ChatGptCredentialStore,
  value: ChatGptCredential,
): Promise<string> {
  const credential = credentialSchema.parse(value),
    id = registrationId(credential);
  await store.withRegistration(id, async (session) => {
    await session.save(credential);
  });
  return id;
}
/** Lock spans read, rotating refresh and durable save; concurrent callers re-read the replacement. */
export async function accessToken(
  store: ChatGptCredentialStore,
  id: string,
  deps: OAuthDependencies = {},
): Promise<string> {
  return store.withRegistration(id, async (session) => {
    let record = await session.load();
    if (!record?.tokens) throw new ChatGptError("chatgpt_reauthorization_required", "reauthorize");
    const now = (deps.now ?? Date.now)();
    if (!record.tokens.scopes.includes(directScope))
      throw new ChatGptError("chatgpt_plan_scope_missing", "configuration");
    if (record.tokens.expiresAt > now + 60_000) return record.tokens.accessToken;
    const previous = record.tokens;
    const response = await exchange(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: record.clientId,
        refresh_token: previous.refreshToken,
        resource: chatGptResource,
      }),
      deps,
    );
    if (response.id_token) {
      const identity = await verifiedIdentity(response.id_token, record.clientId, deps);
      if (identity.subject !== record.subject)
        throw new ChatGptError("chatgpt_account_mismatch", "reauthorize");
    }
    const { access_token: accessToken, refresh_token, id_token } = response;
    const refreshToken = refresh_token ?? previous.refreshToken,
      idToken = id_token ?? previous.idToken;
    record = credentialSchema.parse({
      ...record,
      savedAt: now,
      tokens: {
        accessToken,
        refreshToken,
        idToken,
        scopes: scopesOf(response, previous.scopes),
        expiresAt: now + response.expires_in * 1000,
      },
    });
    await session.save(record);
    if (!record.tokens) throw new ChatGptError("chatgpt_token_response_incomplete");
    return record.tokens.accessToken;
  });
}

/** A bounded operator action: an unconfirmed revocation is never reported as remote success. */
export async function revokeSession(
  record: ChatGptCredential,
  deps: { fetch?: typeof fetch; wait?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  if (!record.tokens) return false;
  const doFetch = deps.fetch ?? fetch;
  let endpoint: URL | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!endpoint) {
        const response = await doFetch(`${chatGptIssuer}/.well-known/openid-configuration`, {
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          if (response.status < 500) return false;
          throw new ChatGptError("chatgpt_revocation_discovery_unavailable");
        }
        const discovery = z
          .object({ revocation_endpoint: z.string().url() })
          .parse(await boundedJson(response));
        endpoint = new URL(discovery.revocation_endpoint);
        if (endpoint.origin !== chatGptIssuer || endpoint.username || endpoint.password)
          return false;
      }
      const form = new URLSearchParams({
        token: record.tokens.refreshToken,
        token_type_hint: "refresh_token",
        client_id: record.clientId,
      });
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 200) return true;
      if (response.status < 500) return false;
    } catch {
      /* A network/discovery failure gets at most one bounded retry. */
    }
    if (attempt === 0)
      await (deps.wait ?? ((ms) => new Promise((done) => setTimeout(done, ms))))(250);
  }
  return false;
}
