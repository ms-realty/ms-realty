import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from "node:crypto";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { getEnv } from "../config/env";
import { createClient, createStaff } from "../testing";
import {
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "./passkeys";
import { createSession, readSession, sessionPolicy } from "./sessions";

// Staff passkeys (AD7) exercised end to end with a software authenticator: a P-256 key,
// "none" attestation, real signatures, and the rpID/origin from configuration.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const b64 = (bytes: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(bytes));
const sha256 = (data: Uint8Array | string) =>
  new Uint8Array(createHash("sha256").update(data).digest());
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const u32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

class SoftAuthenticator {
  readonly credentialId = new Uint8Array(randomBytes(16));
  readonly #privateKey: KeyObject;
  readonly #publicJwk: { x: string; y: string };
  #counter = 0;

  /** Where the browser says the ceremony ran; a phishing page would put its own origin. */
  origin = getEnv().appOrigin;
  readonly rpId = getEnv().webauthn.rpId;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#privateKey = privateKey;
    this.#publicJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  }

  #clientData(type: string, challenge: string) {
    return new TextEncoder().encode(JSON.stringify({ type, challenge, origin: this.origin }));
  }

  register(challenge: string): RegistrationResponseJSON {
    const coseKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, isoBase64URL.toBuffer(this.#publicJwk.x)],
        [-3, isoBase64URL.toBuffer(this.#publicJwk.y)],
      ]),
    );
    const authData = concat(
      sha256(this.rpId),
      new Uint8Array([0x45]), // user present + user verified + attested credential data
      u32(0),
      new Uint8Array(16), // AAGUID
      new Uint8Array([0, this.credentialId.length]),
      this.credentialId,
      coseKey,
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never,
    );
    return {
      id: b64(this.credentialId),
      rawId: b64(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64(this.#clientData("webauthn.create", challenge)),
        attestationObject: b64(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  authenticate(challenge: string): AuthenticationResponseJSON {
    this.#counter += 1;
    const authData = concat(sha256(this.rpId), new Uint8Array([0x05]), u32(this.#counter));
    const clientData = this.#clientData("webauthn.get", challenge);
    const signature = sign("sha256", concat(authData, sha256(clientData)), this.#privateKey);
    return {
      id: b64(this.credentialId),
      rawId: b64(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authData),
        signature: b64(new Uint8Array(signature)),
      },
      clientExtensionResults: {},
    };
  }
}

async function registeredStaff() {
  const staff = await createStaff(t.db, { roles: ["assigned_broker"] });
  const { session } = await createSession(t.db, { kind: "staff", id: staff.id });
  const authenticator = new SoftAuthenticator();
  const options = await startPasskeyRegistration(t.db, session);
  await finishPasskeyRegistration(t.db, session, authenticator.register(options.challenge), {
    label: "Test key",
  });
  return { staff, authenticator };
}

describe("passkeys", () => {
  it("registers a passkey and signs the staff member in with it", async () => {
    const { staff, authenticator } = await registeredStaff();
    const options = await startPasskeyAuthentication(t.db);
    expect(options.rpId).toBe(getEnv().webauthn.rpId);
    const issued = await finishPasskeyAuthentication(
      t.db,
      authenticator.authenticate(options.challenge),
    );
    expect((await readSession(t.db, issued.token))?.actor).toEqual(staff.actor);
  });

  it("consumes each challenge once: a replayed assertion is refused", async () => {
    const { authenticator } = await registeredStaff();
    const { challenge } = await startPasskeyAuthentication(t.db);
    const assertion = authenticator.authenticate(challenge);
    await finishPasskeyAuthentication(t.db, assertion);
    await expect(finishPasskeyAuthentication(t.db, assertion)).rejects.toMatchObject({
      code: "passkey_failed",
    });
  });

  it("refuses an assertion made for another origin or an unissued challenge", async () => {
    const { authenticator } = await registeredStaff();
    const { challenge } = await startPasskeyAuthentication(t.db);
    authenticator.origin = "https://makler-realty.evil.example";
    await expect(
      finishPasskeyAuthentication(t.db, authenticator.authenticate(challenge)),
    ).rejects.toMatchObject({ code: "passkey_failed" });
    authenticator.origin = getEnv().appOrigin;
    await expect(
      finishPasskeyAuthentication(
        t.db,
        authenticator.authenticate(b64(new Uint8Array(randomBytes(32)))),
      ),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });

  it("answers unknown credentials exactly like bad signatures", async () => {
    const stranger = new SoftAuthenticator();
    const { challenge } = await startPasskeyAuthentication(t.db);
    await expect(
      finishPasskeyAuthentication(t.db, stranger.authenticate(challenge)),
    ).rejects.toMatchObject({ code: "passkey_failed" });
  });

  it("step-up: authenticating while signed in replaces the session with a fresh one", async () => {
    const { staff, authenticator } = await registeredStaff();
    const old = await createSession(
      t.db,
      { kind: "staff", id: staff.id },
      new Date(Date.now() - sessionPolicy.stepUpMaxAgeMs * 2),
    );
    const { challenge } = await startPasskeyAuthentication(t.db);
    const stepped = await finishPasskeyAuthentication(t.db, authenticator.authenticate(challenge), {
      currentSessionToken: old.token,
    });
    expect(await readSession(t.db, old.token)).toBeNull();
    expect(stepped.session.reverifiedAt).not.toBeNull();
  });

  it("registration needs a fresh verification and a staff session", async () => {
    const staff = await createStaff(t.db);
    const stale = await createSession(
      t.db,
      { kind: "staff", id: staff.id },
      new Date(Date.now() - sessionPolicy.stepUpMaxAgeMs - 60_000),
    );
    await expect(startPasskeyRegistration(t.db, stale.session)).rejects.toMatchObject({
      code: "step_up_required",
    });
    const client = await createClient(t.db);
    const { session } = await createSession(t.db, { kind: "client", id: client.id });
    await expect(startPasskeyRegistration(t.db, session)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
