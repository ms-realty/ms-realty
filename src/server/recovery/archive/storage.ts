// R08 D08-D12/D27: bounded single conditional creation followed by actual private GET bytes.

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  type Admission,
  bytes,
  type CopyEvidence,
  type Destination,
  demand,
  type Prepared,
  type Signer,
  same,
  signEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import { privateChildDirectory } from "./filesystem";

export type PutOutcome = "created" | "precondition_412" | "locked_409" | "uncertain";
export interface ImmutableTransport {
  readonly destinationId: string;
  put(key: string, content: Uint8Array): Promise<PutOutcome>;
  get(key: string): Promise<AsyncIterable<Uint8Array> | null>;
}
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/sha256\/[a-f0-9]{64}$/;
function boundedKey(key: string, namespace: string) {
  demand(
    keyPattern.test(key) && key.startsWith(`${namespace}/sha256/`),
    "foreign/traversal object key",
  );
}
function failure(error: unknown) {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  if (status === 412) return "precondition_412" as const;
  if (status === 409 && (e.Code ?? e.name) === "ObjectLockedByBucketPolicy")
    return "locked_409" as const;
  if (!status || status >= 500) return "uncertain" as const;
  throw new Error(`R08 archive: rejected storage response ${status}`);
}
/** Exact private EU R2 API only; no ambient credentials, endpoint redirects or retry replacement. */
export class PrivateEuR2Archive implements ImmutableTransport {
  private readonly client: S3Client;
  constructor(
    readonly destinationId: string,
    private readonly namespace: string,
    private readonly bucket: string,
    accountId: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    private readonly maxBytes: number,
    private readonly timeoutMs = 15000,
  ) {
    demand(
      /^[a-f0-9]{32}$/.test(accountId) && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket),
      "fixed R2 identity required",
    );
    demand(
      credentials.accessKeyId &&
        credentials.secretAccessKey &&
        Number.isSafeInteger(maxBytes) &&
        maxBytes > 0 &&
        maxBytes <= 8 * 1024 * 1024 &&
        Number.isSafeInteger(timeoutMs) &&
        timeoutMs > 0 &&
        timeoutMs <= 60000,
      "credentials and bounded single PUT required",
    );
    this.client = new S3Client({
      endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
      region: "auto",
      credentials,
      maxAttempts: 1,
      followRegionRedirects: false,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  async put(key: string, content: Uint8Array): Promise<PutOutcome> {
    boundedKey(key, this.namespace);
    demand(
      content.length > 0 && content.length <= this.maxBytes,
      "oversized single PUT unsupported",
    );
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ContentLength: content.length,
          IfNoneMatch: "*",
          ContentType: "application/jose+json",
        }),
        { abortSignal: AbortSignal.timeout(this.timeoutMs) },
      );
      return "created";
    } catch (e) {
      return failure(e);
    }
  }
  async get(key: string) {
    boundedKey(key, this.namespace);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(this.timeoutMs) },
      );
      demand(result.Body && Symbol.asyncIterator in result.Body, "actual GET stream missing");
      return result.Body as AsyncIterable<Uint8Array>;
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return null;
      throw e;
    }
  }
}
/** An explicit outside-volume adapter. Its actual volume/custody is still unqualified. */
export class PrivateDirectoryArchive implements ImmutableTransport {
  constructor(
    readonly destinationId: string,
    private readonly root: string,
    private readonly namespace: string,
    private readonly maxBytes: number,
  ) {}
  private async directory(key: string) {
    boundedKey(key, this.namespace);
    demand(
      isAbsolute(this.root) &&
        Number.isSafeInteger(this.maxBytes) &&
        this.maxBytes > 0 &&
        this.maxBytes <= 8 * 1024 * 1024,
      "explicit persistent outside volume/bound required",
    );
    const info = await lstat(this.root);
    demand(
      info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
      "outside volume must be private",
    );
    const directory = join(this.root, this.namespace, "sha256");
    for (const path of [join(this.root, this.namespace), directory])
      await privateChildDirectory(path);
    return directory;
  }
  async put(key: string, content: Uint8Array): Promise<PutOutcome> {
    demand(
      content.length > 0 && content.length <= this.maxBytes,
      "oversized outside single PUT unsupported",
    );
    const dir = await this.directory(key),
      target = join(dir, key.split("/").at(-1) as string);
    const temporary = join(dir, `.retained-${randomUUID()}`);
    const fd = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await fd.writeFile(content);
      await fd.sync();
    } finally {
      await fd.close();
    }
    let result: PutOutcome = "created";
    try {
      await link(temporary, target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      result = "precondition_412";
    }
    const directory = await open(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return result;
  }
  async get(key: string) {
    const dir = await this.directory(key);
    try {
      const fd = await open(
        join(dir, key.split("/").at(-1) as string),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const info = await fd.stat();
      if (!info.isFile() || info.size > this.maxBytes) {
        await fd.close();
        throw new Error("R08 archive: outside object type/size differs");
      }
      return (async function* () {
        try {
          for await (const part of fd.createReadStream({ autoClose: false })) yield part as Buffer;
        } finally {
          await fd.close();
        }
      })();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
}
export async function verifyStoredObject(
  transport: ImmutableTransport,
  key: string,
  descriptor: Prepared,
  maxBytes: number,
) {
  const stream = await transport.get(key);
  if (!stream) return null;
  let size = 0;
  const digest = createHash("sha256");
  for await (const part of stream) {
    size += part.byteLength;
    demand(size <= maxBytes && size <= descriptor.ciphertext.size, "readback oversized");
    digest.update(part);
  }
  demand(
    same({ sha256: digest.digest("hex"), size }, descriptor.ciphertext),
    "readback ciphertext conflict/truncation",
  );
  return descriptor.ciphertext;
}
export type ReceiptSink = (event: {
  attemptId: string;
  state: string;
  raw?: string;
}) => Promise<void>;
export async function putEncryptedIfAbsent(
  admission: Admission,
  target: Destination,
  transport: ImmutableTransport,
  descriptor: Prepared,
  content: Uint8Array,
  signer: Signer,
  retain: ReceiptSink,
) {
  demand(
    transport.destinationId === admission.context[target] &&
      descriptor.scope.contextDigest === recoveryContextDigest(admission) &&
      descriptor.scope.encryptionProfileDigest === admission.context.encryptionProfileDigest,
    "copy scope/destination differs",
  );
  demand(
    same(bytes(content), descriptor.ciphertext) &&
      content.length <= admission.limits.maxObjectBytes,
    "upload differs from selected ciphertext",
  );
  const objectKey = `${admission.context.archiveNamespace}/sha256/${descriptor.ciphertext.sha256}`;
  const attemptId = randomUUID();
  const base = {
    contextDigest: descriptor.scope.contextDigest,
    scopeDigest: descriptor.scopeDigest,
    ciphertext: descriptor.ciphertext,
    destination: target,
    destinationId: transport.destinationId,
    objectKey,
    attemptId,
  };
  // Retain exact identity before I/O. A stopped process leaves uncertainty, never absence.
  await retain({ attemptId, state: "uncertain_before_put", raw: JSON.stringify(base) });
  const outcome = await transport.put(objectKey, content);
  const create = await signEvidence(
    "recovery-copy",
    transport.destinationId,
    { ...base, phase: "create", outcome } satisfies CopyEvidence,
    signer,
  );
  await retain({ attemptId, state: outcome, raw: create });
  try {
    const measured = await verifyStoredObject(
      transport,
      objectKey,
      descriptor,
      admission.limits.maxObjectBytes,
    );
    if (!measured) return { state: "unknown" as const, create, readback: null };
    const readback = await signEvidence(
      "recovery-copy",
      transport.destinationId,
      { ...base, phase: "readback", outcome: "present_identical" } satisfies CopyEvidence,
      signer,
    );
    await retain({ attemptId, state: "present_identical", raw: readback });
    return { state: "verified" as const, create, readback };
  } catch (error) {
    await retain({ attemptId, state: "readback_conflict_or_unknown" });
    throw error;
  }
}

import { recoveryDigest } from "@/domain/recovery-archive";

function recoveryContextDigest(admission: Admission) {
  return recoveryDigest("context-v1", admission.context);
}
