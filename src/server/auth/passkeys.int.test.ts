import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { passkeys, principals, staffMemberships } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { getEnv } from "../config/env";
import { createClient, createStaff } from "../testing";
import { staffAccess } from "./access";
import {
  challengeTtlMs,
  enrolmentWindowMs,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "./passkeys";
import {
  type AccountKind,
  createSession,
  readSession,
  revokeSession,
  type Session,
  sessionPolicy,
} from "./sessions";
import { SoftAuthenticator } from "./testing-authenticator";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
let ip = 0;
const begin = (context: AccountKind = "staff", now?: Date) =>
  startPasskeyAuthentication(t.db, context, { clientIp: `192.0.2.${++ip}`, now });
async function register(
  session: Session,
  authenticator = new SoftAuthenticator(session.account.kind),
) {
  const options = await startPasskeyRegistration(t.db, session);
  await finishPasskeyRegistration(t.db, session, authenticator.register(options.challenge), {
    expectedChallenge: options.challenge,
    label: "Test key",
  });
  return authenticator;
}
async function enrolled(context: AccountKind = "staff") {
  const account = context === "staff" ? await createStaff(t.db) : await createClient(t.db);
  const issued = await createSession(t.db, { kind: context, id: account.id });
  const key = await register(issued.session);
  return { account, issued, key };
}
describe("AT36–AT39: passkey ceremonies with real P-256 signatures", () => {
  it("opens staff routes only after two distinct credentials, and signs in on the staff relying party", async () => {
    const { account, issued, key } = await enrolled();
    expect((await staffAccess(t.db, issued.token)).state).toBe("enrolling");
    await register(issued.session);
    expect((await staffAccess(t.db, issued.token)).state).toBe("ready");
    const options = await begin();
    expect(options.rpId).toBe(new URL(getEnv().hosts.staff).hostname);
    const signedIn = await finishPasskeyAuthentication(
      t.db,
      "staff",
      key.authenticate(options.challenge),
      { expectedChallenge: options.challenge },
    );
    expect((await readSession(t.db, signedIn.token))?.actor).toEqual(account.actor);
  });
  it("a second registration of the same credential cannot satisfy the minimum", async () => {
    const { issued, key } = await enrolled();
    const options = await startPasskeyRegistration(t.db, issued.session);
    expect(options.excludeCredentials?.map((item) => item.id)).toContain(
      Buffer.from(key.credentialId).toString("base64url"),
    );
    await expect(
      finishPasskeyRegistration(t.db, issued.session, key.register(options.challenge), {
        expectedChallenge: options.challenge,
      }),
    ).rejects.toThrow();
    expect((await staffAccess(t.db, issued.token)).state).toBe("enrolling");
  });
  it("consumes a challenge once and rejects replay", async () => {
    const { key } = await enrolled();
    const { challenge } = await begin();
    const response = key.authenticate(challenge);
    await finishPasskeyAuthentication(t.db, "staff", response, { expectedChallenge: challenge });
    await expect(
      finishPasskeyAuthentication(t.db, "staff", response, { expectedChallenge: challenge }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });
  it("refuses an assertion from a different browser ceremony, origin or context", async () => {
    const { key } = await enrolled();
    const { challenge } = await begin();
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
        expectedChallenge: "another-browser",
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    key.origin = "https://phishing.example";
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
        expectedChallenge: challenge,
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    const other = await begin("client");
    await expect(
      finishPasskeyAuthentication(t.db, "client", key.authenticate(other.challenge), {
        expectedChallenge: other.challenge,
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });
  it("rejects expired and unissued challenges and unknown credentials", async () => {
    const { key } = await enrolled();
    const now = new Date();
    const { challenge } = await begin("staff", now);
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
        expectedChallenge: challenge,
        now: new Date(now.getTime() + challengeTtlMs),
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate("unissued"), {
        expectedChallenge: "unissued",
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    const fresh = await begin();
    await expect(
      finishPasskeyAuthentication(
        t.db,
        "staff",
        new SoftAuthenticator().authenticate(fresh.challenge),
        { expectedChallenge: fresh.challenge },
      ),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });
  it("step-up requires the same current principal and preserves the original absolute deadline", async () => {
    const { account, key } = await enrolled();
    const start = new Date(Date.now() - sessionPolicy.staff.stepUpMs - 1000);
    const old = await createSession(t.db, { kind: "staff", id: account.id }, start);
    const { challenge } = await begin();
    const signedIn = await finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
      expectedChallenge: challenge,
      currentSessionToken: old.token,
      reauthenticate: old.session,
    });
    expect(await readSession(t.db, old.token)).toBeNull();
    expect(signedIn.session.expiresAt).toEqual(old.session.expiresAt);
    expect(signedIn.session.reverifiedAt?.getTime()).toBeGreaterThan(start.getTime());
    const other = await enrolled();
    const next = await begin();
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(next.challenge), {
        expectedChallenge: next.challenge,
        currentSessionToken: other.issued.token,
        reauthenticate: other.issued.session,
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });
  it("a session revoked while step-up is open cannot be refreshed", async () => {
    const { issued, key } = await enrolled();
    const { challenge } = await begin();
    await revokeSession(t.db, issued.token);
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
        expectedChallenge: challenge,
        currentSessionToken: issued.token,
        reauthenticate: issued.session,
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("enrollment closes after fifteen minutes and clients require recent verification", async () => {
    const staff = await createStaff(t.db);
    const now = new Date();
    const old = await createSession(
      t.db,
      { kind: "staff", id: staff.id },
      new Date(now.getTime() - enrolmentWindowMs - 1),
    );
    await expect(startPasskeyRegistration(t.db, old.session, now)).rejects.toMatchObject({
      code: "step_up_required",
    });
    const client = await createClient(t.db);
    const stale = await createSession(
      t.db,
      { kind: "client", id: client.id },
      new Date(now.getTime() - sessionPolicy.client.stepUpMs - 1),
    );
    await expect(startPasskeyRegistration(t.db, stale.session, now)).rejects.toMatchObject({
      code: "step_up_required",
    });
  });
  it("allows optional client passkeys but never lets a client session open staff", async () => {
    const { issued, key } = await enrolled("client");
    expect((await staffAccess(t.db, issued.token)).state).toBe("signed_out");
    const options = await begin("client");
    const signedIn = await finishPasskeyAuthentication(
      t.db,
      "client",
      key.authenticate(options.challenge),
      { expectedChallenge: options.challenge },
    );
    expect(signedIn.session.account.kind).toBe("client");
  });
  it("revoked credentials, inactive accounts and ended memberships cannot enter the workspace", async () => {
    const { issued, key, account } = await enrolled();
    await register(issued.session);
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, account.id));
    expect((await staffAccess(t.db, issued.token)).state).toBe("denied");
    await expect(startPasskeyRegistration(t.db, issued.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await t.db
      .update(passkeys)
      .set({ revokedAt: new Date() })
      .where(eq(passkeys.principalId, account.id));
    const challenge = (await begin()).challenge;
    await expect(
      finishPasskeyAuthentication(t.db, "staff", key.authenticate(challenge), {
        expectedChallenge: challenge,
      }),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    await t.db.update(principals).set({ status: "suspended" }).where(eq(principals.id, account.id));
    expect(await readSession(t.db, issued.token)).toBeNull();
  });
});
