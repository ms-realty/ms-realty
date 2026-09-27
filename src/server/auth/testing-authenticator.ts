// A software authenticator for behavioral tests: P-256 signatures and real WebAuthn payloads.
import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from "node:crypto";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { getEnv } from "../config/env";

const b64 = (bytes: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(bytes));
const sha256 = (data: Uint8Array | string) =>
  new Uint8Array(createHash("sha256").update(data).digest());
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const u32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export class SoftAuthenticator {
  readonly credentialId = new Uint8Array(randomBytes(16));
  readonly #privateKey: KeyObject;
  readonly #publicJwk: { x: string; y: string };
  #counter = 0;

  /** Where the browser says the ceremony ran; a phishing page would put its own origin. */
  origin: string;
  readonly rpId: string;

  constructor(context: "staff" | "client" = "staff") {
    this.origin = getEnv().hosts[context];
    this.rpId = new URL(this.origin).hostname;
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
