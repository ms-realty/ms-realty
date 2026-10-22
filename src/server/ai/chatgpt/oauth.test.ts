import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  accessToken,
  beginAuthorization,
  finishAuthorization,
  revokeSession,
  saveRegistration,
  verifiedIdentity,
} from "./oauth";
import { FileChatGptStore } from "./store";
import { type ChatGptCredential, chatGptIssuer, chatGptResource, directScope } from "./types";

let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let key: ReturnType<typeof createLocalJWKSet>;
const roots: string[] = [];
beforeAll(async () => {
  pair = await generateKeyPair("ES256");
  key = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "synthetic" }] });
});
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
async function signed(
  nonce: string,
  audience = "oaiapp_synthetic",
  subject = "synthetic-subject",
  expiry = 3600,
) {
  return new SignJWT({ nonce, email: "operator@example.invalid" })
    .setProtectedHeader({ alg: "ES256", kid: "synthetic" })
    .setIssuer(chatGptIssuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiry)
    .sign(pair.privateKey);
}
const start = (selected?: ChatGptCredential) =>
  beginAuthorization({
    redirectUri: "http://127.0.0.1:12345/auth/callback",
    hostId: "urn:uuid:synthetic-host",
    selected,
  });
function callback(
  attempt: ReturnType<typeof start>["attempt"],
  changes: Record<string, string> = {},
) {
  const url = new URL(attempt.redirectUri);
  url.search = new URLSearchParams({
    state: attempt.state,
    code: "synthetic-code",
    client_id: "oaiapp_synthetic",
    ...changes,
  }).toString();
  return url.href;
}
async function complete(selected?: ChatGptCredential): Promise<ChatGptCredential> {
  const { attempt } = start(selected),
    id_token = await signed(attempt.nonce);
  const transport: typeof fetch = async () =>
    Response.json({
      access_token: "test-access",
      refresh_token: "test-refresh",
      id_token,
      token_type: "Bearer",
      expires_in: 3600,
      scope: `openid offline_access ${directScope}`,
    });
  return finishAuthorization(attempt, callback(attempt), { fetch: transport, key });
}

describe("application-owned ChatGPT authorization", () => {
  it("starts initial registration with fresh state, nonce and PKCE and an exact loopback callback", () => {
    const first = start(),
      second = start(),
      url = new URL(first.url);
    expect(url.origin).toBe(chatGptIssuer);
    expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(url.searchParams.get("agent_name_hint")).toBe("MS Realty Butler");
    expect(url.searchParams.get("resource")).toBe(chatGptResource);
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(first.attempt.verifier).digest("base64url"),
    );
    expect(first.attempt.state).not.toBe(second.attempt.state);
    expect(first.attempt.nonce).not.toBe(second.attempt.nonce);
    expect(first.attempt.verifier).not.toBe(second.attempt.verifier);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it.each([
    "http://localhost:12345/auth/callback",
    "http://127.0.0.1:12345/callback",
    "https://127.0.0.1/auth/callback",
  ])("rejects callback %s", (redirectUri) => {
    expect(() => beginAuthorization({ redirectUri, hostId: "host" })).toThrow(
      "chatgpt_callback_invalid",
    );
  });
  it("exchanges only the issued client ID, validates identity and does not log tokens", async () => {
    const { attempt } = start(),
      id_token = await signed(attempt.nonce);
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("client_id")).toBe("oaiapp_synthetic");
      expect(form.get("redirect_uri")).toBe(attempt.redirectUri);
      expect(form.get("resource")).toBe(chatGptResource);
      expect(form.get("code_verifier")).toBe(attempt.verifier);
      expect(form.has("client_secret")).toBe(false);
      return Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        id_token,
        token_type: "Bearer",
        expires_in: 3600,
        scope: directScope,
      });
    });
    const result = await finishAuthorization(attempt, callback(attempt), { fetch: transport, key });
    expect(result).toMatchObject({
      issuer: chatGptIssuer,
      subject: "synthetic-subject",
      clientId: "oaiapp_synthetic",
    });
    await expect(
      finishAuthorization(attempt, callback(attempt), { fetch: transport, key }),
    ).rejects.toThrow("chatgpt_attempt_expired");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects state/client errors and denial before exchanging any code", async () => {
    const transport = vi.fn<typeof fetch>();
    const rejected: Array<Record<string, string>> = [
      { state: "wrong" },
      { client_id: "dynamic_agent_client" },
      { error: "access_denied" },
    ];
    for (const changes of rejected) {
      const { attempt } = start();
      await expect(
        finishAuthorization(attempt, callback(attempt, changes), { fetch: transport, key }),
      ).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("validates signature, issuer, audience, expiration and nonce using the maintained verifier", async () => {
    await expect(
      verifiedIdentity(await signed("expected"), "oaiapp_synthetic", { key }, "expected"),
    ).resolves.toMatchObject({ subject: "synthetic-subject" });
    await expect(
      verifiedIdentity(await signed("wrong"), "oaiapp_synthetic", { key }, "expected"),
    ).rejects.toThrow();
    await expect(
      verifiedIdentity(
        await signed("expected", "different-client"),
        "oaiapp_synthetic",
        { key },
        "expected",
      ),
    ).rejects.toThrow();
    await expect(
      verifiedIdentity(
        await signed("expected", "oaiapp_synthetic", "synthetic-subject", -60),
        "oaiapp_synthetic",
        { key },
        "expected",
      ),
    ).rejects.toThrow();
    const other = await generateKeyPair("ES256");
    const wrongKey = createLocalJWKSet({
      keys: [{ ...(await exportJWK(other.publicKey)), kid: "synthetic" }],
    });
    await expect(
      verifiedIdentity(await signed("expected"), "oaiapp_synthetic", { key: wrongKey }, "expected"),
    ).rejects.toThrow();
  });
  it("requires granted plan scope and the same returning subject", async () => {
    const previous = await complete();
    const { attempt } = start(previous),
      id_token = await signed(attempt.nonce, previous.clientId, "another-subject");
    const transport: typeof fetch = async () =>
      Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        id_token,
        token_type: "Bearer",
        expires_in: 3600,
        scope: directScope,
      });
    await expect(
      finishAuthorization(attempt, callback(attempt), { fetch: transport, key }),
    ).rejects.toThrow("chatgpt_account_mismatch");
    const fresh = start(),
      freshToken = await signed(fresh.attempt.nonce);
    await expect(
      finishAuthorization(fresh.attempt, callback(fresh.attempt), {
        key,
        fetch: async () =>
          Response.json({
            access_token: "test-access",
            refresh_token: "test-refresh",
            id_token: freshToken,
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid",
          }),
      }),
    ).rejects.toThrow("chatgpt_plan_scope_missing");
  });
  it("reauthorizes a saved client without creating a new registration or printing retained ID-token hints", async () => {
    const previous = await complete(),
      returning = start(previous),
      url = new URL(returning.url);
    expect(url.searchParams.get("client_id")).toBe(previous.clientId);
    expect(url.searchParams.has("agent_name_hint")).toBe(false);
    expect(url.searchParams.has("id_token_hint")).toBe(false);
  });
  it.each(["invalid_grant", "access_denied"])(
    "retains the issued client after %s but uses a fresh authorization and PKCE",
    async (error) => {
      const first = start();
      const transport = vi.fn<typeof fetch>(async () => Response.json({ error }, { status: 400 }));
      await expect(
        finishAuthorization(
          first.attempt,
          callback(first.attempt, error === "access_denied" ? { error } : {}),
          { fetch: transport, key },
        ),
      ).rejects.toThrow();
      expect(first.attempt.clientId).toBe("oaiapp_synthetic");
      const retry = beginAuthorization({
        redirectUri: first.attempt.redirectUri,
        hostId: first.attempt.hostId,
        issuedClientId: first.attempt.clientId,
      });
      expect(new URL(retry.url).searchParams.get("client_id")).toBe("oaiapp_synthetic");
      expect(new URL(retry.url).searchParams.has("agent_name_hint")).toBe(false);
      expect(retry.attempt.state).not.toBe(first.attempt.state);
      expect(retry.attempt.verifier).not.toBe(first.attempt.verifier);
      expect(transport).toHaveBeenCalledTimes(error === "access_denied" ? 0 : 1);
    },
  );
  it("serializes rotating refreshes and atomically retains the replacement for later callers", async () => {
    const root = await mkdtemp(join(tmpdir(), "msr-chatgpt-"));
    roots.push(root);
    const store = new FileChatGptStore(root),
      credential = await complete();
    if (!credential.tokens) throw new Error("Missing test tokens");
    credential.tokens.expiresAt = Date.now() - 1000;
    const id = await saveRegistration(store, credential);
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("client_id")).toBe(credential.clientId);
      expect(form.get("refresh_token")).toBe("test-refresh");
      expect(form.has("scope")).toBe(false);
      return Response.json({
        access_token: "replacement",
        refresh_token: randomUUID(),
        token_type: "Bearer",
        expires_in: 3600,
      });
    });
    expect(
      await Promise.all([
        accessToken(store, id, { fetch: transport }),
        accessToken(store, id, { fetch: transport }),
      ]),
    ).toEqual(["replacement", "replacement"]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await store.list())[0]).toMatchObject({ id, connected: true });
  });
  it("revokes the issued client's renewable session with one bounded retry and explicit uncertainty", async () => {
    const credential = await complete(),
      wait = vi.fn(async () => {});
    let requests = 0;
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes("openid-configuration"))
        return Response.json({ revocation_endpoint: `${chatGptIssuer}/synthetic-revoke` });
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("client_id")).toBe(credential.clientId);
      expect(form.get("token_type_hint")).toBe("refresh_token");
      expect(form.has("client_secret")).toBe(false);
      return ++requests === 1
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 200 });
    });
    expect(await revokeSession(credential, { fetch: transport, wait })).toBe(true);
    expect(requests).toBe(2);
    expect(wait).toHaveBeenCalledOnce();
    expect(
      await revokeSession(credential, {
        fetch: async () => {
          throw new Error("synthetic network failure");
        },
        wait,
      }),
    ).toBe(false);
    expect(
      await revokeSession(credential, {
        fetch: async () => Response.json({ revocation_endpoint: "https://example.invalid/revoke" }),
        wait,
      }),
    ).toBe(false);
    const disconnectedTransport = vi.fn<typeof fetch>();
    expect(
      await revokeSession({ ...credential, tokens: null }, { fetch: disconnectedTransport }),
    ).toBe(false);
    expect(disconnectedTransport).not.toHaveBeenCalled();
  });
});
