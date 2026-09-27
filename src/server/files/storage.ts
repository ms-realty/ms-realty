// §13: staging is writable; sealed originals and derivatives are write-once. No adapter
// exposes a signed original/download URL. All reads pass through current application policy.
import "server-only";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError } from "../errors";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const digestOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface FileStorage {
  writeStaging(key: string, bytes: Uint8Array): Promise<void>;
  writeImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(key: string, limit?: number): Promise<Buffer>;
}

function validKey(key: string): void {
  if (!/^(staging|sealed|derivatives)\/[a-zA-Z0-9/-]+(?:\.[a-z0-9]+)?$/.test(key))
    throw new AppError("validation_failed");
}
function writable(key: string, immutable: boolean): void {
  validKey(key);
  if (key.startsWith("staging/") === immutable) throw new AppError("forbidden");
}

export class LocalFileStorage implements FileStorage {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    validKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new AppError("forbidden");
    return path;
  }
  async writeStaging(key: string, bytes: Uint8Array): Promise<void> {
    writable(key, false);
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const file = await open(path, "w", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async writeImmutable(key: string, bytes: Uint8Array): Promise<void> {
    writable(key, true);
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const file = await open(path, "wx", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (digestOf(await this.read(key)) !== digestOf(bytes)) throw new AppError("unavailable");
    }
  }
  async read(key: string, limit = MAX_IMAGE_BYTES): Promise<Buffer> {
    const path = this.path(key);
    try {
      if ((await stat(path)).size > limit) throw new AppError("validation_failed");
      const bytes = await readFile(path);
      if (bytes.length > limit) throw new AppError("validation_failed");
      return bytes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("unavailable", { cause: error });
    }
  }
}

/** EU jurisdiction is encoded in the endpoint, not merely a location hint. */
export class R2FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: `https://${config.accountId}.eu.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 2,
    });
  }
  async writeStaging(key: string, bytes: Uint8Array): Promise<void> {
    writable(key, false);
    await this.put(key, bytes, "application/octet-stream", false);
  }
  async writeImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    writable(key, true);
    try {
      await this.put(key, bytes, contentType, true);
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
        throw error;
      if (digestOf(await this.read(key)) !== digestOf(bytes)) throw new AppError("unavailable");
    }
  }
  private async put(key: string, bytes: Uint8Array, contentType: string, immutable: boolean) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "private, no-store",
        ...(immutable ? { IfNoneMatch: "*" } : {}),
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }
  async read(key: string, limit = MAX_IMAGE_BYTES): Promise<Buffer> {
    validKey(key);
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (!object.Body || (object.ContentLength ?? 0) > limit) throw new AppError("unavailable");
    const stream = object.Body.transformToWebStream();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > limit) throw new AppError("validation_failed");
        chunks.push(chunk.value);
      }
      return Buffer.concat(chunks);
    } finally {
      await reader.cancel();
    }
  }
}
