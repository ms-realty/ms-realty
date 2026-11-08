// R08 D05-D07: JWE is provided by pinned jose; plaintext and private recipient keys never enter the spool.

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { calculateJwkThumbprint, GeneralEncrypt, importJWK } from "jose";
import { z } from "zod";
import { canonicalJson } from "@/domain/approval";
import { recoveryDigest } from "@/domain/recovery-archive";
import {
  bytes,
  demand,
  type Prepared,
  prepared,
  same,
  scope,
  scopeDigest,
} from "../../../../gateway/recovery-coordinator-contract";
import { readPrivateFile, syncDirectory } from "./filesystem";

export const encryptionProfile = z.strictObject({
  kind: z.literal("jose_general_jwe_v1"),
  implementation: z.literal("jose-6.2.13"),
  alg: z.literal("RSA-OAEP-256"),
  enc: z.literal("A256GCM"),
  recipients: z
    .array(
      z.strictObject({
        fingerprint: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        publicKey: z.strictObject({
          kty: z.literal("RSA"),
          n: z.string().min(342),
          e: z.literal("AQAB"),
        }),
      }),
    )
    .min(1)
    .max(8),
});
export type EncryptionProfile = z.infer<typeof encryptionProfile>;
export const profileDigest = (p: EncryptionProfile) =>
  recoveryDigest("archive-encryption-profile-v1", encryptionProfile.parse(p));
export async function encryptJwe(input: Uint8Array, profile: EncryptionProfile, scopeId: string) {
  const parsed = encryptionProfile.parse(profile);
  const jwe = new GeneralEncrypt(input)
    .setProtectedHeader({ enc: parsed.enc, typ: "ms-realty-recovery-jwe-v1" })
    .setAdditionalAuthenticatedData(Buffer.from(scopeId));
  const seen = new Set<string>();
  for (const recipient of parsed.recipients) {
    demand(
      (await calculateJwkThumbprint(recipient.publicKey)) === recipient.fingerprint &&
        !seen.has(recipient.fingerprint),
      "recipient fingerprint differs or duplicates",
    );
    demand(
      Buffer.from(recipient.publicKey.n, "base64url").length >= 256,
      "RSA recipient below 2048 bits",
    );
    seen.add(recipient.fingerprint);
    jwe
      .addRecipient(await importJWK(recipient.publicKey, parsed.alg))
      .setUnprotectedHeader({ alg: parsed.alg, kid: recipient.fingerprint });
  }
  return Buffer.from(canonicalJson(await jwe.encrypt()));
}
export type CrashStage =
  | "before_ciphertext"
  | "after_ciphertext_sync"
  | "before_descriptor_install"
  | "after_descriptor_sync";
async function durableFile(path: string, content: Uint8Array) {
  const fd = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await fd.writeFile(content);
    await fd.sync();
  } finally {
    await fd.close();
  }
}
/** Caller explicitly supplies a private persistent volume. No default/temp/production constructor. */
export class PreparationStore {
  constructor(
    readonly directory: string,
    readonly maxBytes: number,
    private readonly crash: (stage: CrashStage) => void = () => {},
  ) {}
  private async checkDirectory() {
    demand(
      isAbsolute(this.directory) &&
        Number.isSafeInteger(this.maxBytes) &&
        this.maxBytes > 0 &&
        this.maxBytes <= 8 * 1024 * 1024,
      "explicit spool/bound required",
    );
    const info = await lstat(this.directory);
    demand(
      info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
      "spool must be a private real directory",
    );
  }
  async openPreparedExact(expected: Prepared) {
    await this.checkDirectory();
    const descriptor = prepared.parse(expected);
    demand(
      descriptor.scopeDigest === scopeDigest(descriptor.scope),
      "prepared scope digest differs",
    );
    const stored = prepared.parse(
      JSON.parse(
        (
          await readPrivateFile(join(this.directory, `${descriptor.scopeDigest}.json`), 16384)
        ).toString("utf8"),
      ),
    );
    demand(same(stored, descriptor), "selected preparation differs; no reencrypt");
    const fd = await open(
      join(this.directory, `${descriptor.ciphertext.sha256}.jwe`),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await fd.stat();
      demand(
        stat.isFile() && stat.size === descriptor.ciphertext.size && stat.size <= this.maxBytes,
        "selected ciphertext length differs or is unavailable",
      );
      const content = await fd.readFile();
      demand(same(bytes(content), descriptor.ciphertext), "selected ciphertext hash differs");
      return content;
    } finally {
      await fd.close();
    }
  }
  async prepareOnce(
    input: z.infer<typeof scope>,
    plaintext: Uint8Array,
    profile: EncryptionProfile,
  ) {
    await this.checkDirectory();
    const parsed = scope.parse(input),
      id = scopeDigest(parsed);
    demand(
      same(bytes(plaintext), parsed.plaintext) && plaintext.length <= this.maxBytes,
      "plaintext binding/bound differs",
    );
    demand(parsed.encryptionProfileDigest === profileDigest(profile), "encryption profile differs");
    const descriptorPath = join(this.directory, `${id}.json`);
    let prior: Prepared | undefined;
    try {
      prior = prepared.parse(
        JSON.parse((await readPrivateFile(descriptorPath, 16384)).toString("utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (prior) {
      demand(same(prior.scope, parsed), "preparation scope conflict");
      await this.openPreparedExact(prior);
      return prior;
    }
    // A retained attempt is evidence, not a lease. Interrupted/unselected bytes stay on disk.
    const attempt = `${id}-${randomUUID()}`;
    await durableFile(
      join(this.directory, `${attempt}.attempt`),
      Buffer.from(canonicalJson({ scopeDigest: id, state: "uncommitted_retained" })),
    );
    await syncDirectory(this.directory);
    this.crash("before_ciphertext");
    const ciphertext = await encryptJwe(plaintext, profile, id);
    demand(
      ciphertext.length <= this.maxBytes,
      "ciphertext oversized; single PUT only, no multipart/split",
    );
    const descriptor = prepared.parse({
      scope: parsed,
      scopeDigest: id,
      ciphertext: bytes(ciphertext),
    });
    const temporary = join(this.directory, `${attempt}.partial`);
    await durableFile(temporary, ciphertext);
    this.crash("after_ciphertext_sync");
    const immutable = join(this.directory, `${descriptor.ciphertext.sha256}.jwe`);
    try {
      await link(temporary, immutable);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    await syncDirectory(this.directory);
    const candidate = join(this.directory, `${attempt}.descriptor`);
    await durableFile(candidate, Buffer.from(canonicalJson(descriptor)));
    this.crash("before_descriptor_install");
    try {
      await link(candidate, descriptorPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    await syncDirectory(this.directory);
    this.crash("after_descriptor_sync");
    const winner = prepared.parse(
      JSON.parse((await readPrivateFile(descriptorPath, 16384)).toString("utf8")),
    );
    demand(same(winner.scope, parsed), "concurrent preparation scope differs");
    await this.openPreparedExact(winner);
    return winner;
  }
  async retainEvidence(event: { attemptId: string; state: string; raw?: string }) {
    await this.checkDirectory();
    demand(
      /^[a-zA-Z0-9_-]{1,128}$/.test(event.attemptId) &&
        event.state.length < 128 &&
        (event.raw?.length ?? 0) <= 2 * 1024 * 1024,
      "receipt bound differs",
    );
    await durableFile(
      join(this.directory, `${event.attemptId}-${randomUUID()}.receipt`),
      Buffer.from(canonicalJson(event)),
    );
    await syncDirectory(this.directory);
  }
  async retainedArtifacts() {
    await this.checkDirectory();
    return (await readdir(this.directory)).sort();
  }
}
/** Explicit offline fixture helper, never called by the CLI or production loader. */
export async function createPrivateFixtureSpool(directory: string) {
  await mkdir(directory, { mode: 0o700 });
}
