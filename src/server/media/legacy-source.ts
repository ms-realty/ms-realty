// Where the old website's photos are read from for the carry-over (ADR 0016). The legacy media
// manifest (data/legacy/media-manifest.json) addresses each object by its legacy R2 key,
// `<legacy host>/wp-content/uploads/<WordPress upload path>`; the import stored that key as the
// asset's `original_key`. Either source reads exactly those keys and only reads: neither class
// has a write, copy or delete path, so the legacy bucket and its local mirror stay untouched.
import "server-only";
import { open } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { GetObjectCommand, type GetObjectCommandOutput, S3Client } from "@aws-sdk/client-s3";
import { legacyDomains } from "@/config/tenant";
import { MAX_IMAGE_BYTES } from "../files/storage";

export type LegacyRead =
  | { readonly state: "found"; readonly bytes: Buffer }
  | { readonly state: "missing" }
  | { readonly state: "too_large"; readonly byteSize: number };

export interface LegacyMediaSource {
  /** For reports: the kind of source, never a credential. */
  readonly label: string;
  /** Throws only when the source itself is unreachable; a missing object is a result. */
  read(key: string): Promise<LegacyRead>;
}

const hosts = legacyDomains.map((d) => d.replace(/\./g, "\\.")).join("|");
const legacyKeyShape = new RegExp(`^(?:${hosts})/wp-content/uploads/[^\\\\\\0]+$`, "u");

/** A key the legacy manifest could have produced; anything else is never read. */
export function isLegacyMediaKey(key: string): boolean {
  return (
    legacyKeyShape.test(key) &&
    !key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  );
}

/** A read-only directory laid out like the bucket, e.g. a local mirror of it. */
export class DirectoryLegacyMediaSource implements LegacyMediaSource {
  readonly label = "directory";
  private readonly root: string;
  constructor(
    root: string,
    private readonly limit = MAX_IMAGE_BYTES,
  ) {
    if (!isAbsolute(root)) throw new Error("The legacy media directory must be an absolute path.");
    this.root = resolve(root);
  }
  async read(key: string): Promise<LegacyRead> {
    if (!isLegacyMediaKey(key)) return { state: "missing" };
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) return { state: "missing" };
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(path, "r");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return { state: "missing" };
      throw error;
    }
    try {
      const { size } = await file.stat();
      if (size > this.limit) return { state: "too_large", byteSize: size };
      const bytes = await file.readFile();
      if (bytes.length > this.limit) return { state: "too_large", byteSize: bytes.length };
      return { state: "found", bytes };
    } finally {
      await file.close();
    }
  }
}

/** The legacy R2 bucket, read with GetObject only. */
export class R2LegacyMediaSource implements LegacyMediaSource {
  readonly label = "r2";
  private readonly client: S3Client;
  constructor(
    private readonly config: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      jurisdiction: "eu" | "default";
    },
    private readonly limit = MAX_IMAGE_BYTES,
  ) {
    this.client = new S3Client({
      endpoint: `https://${config.accountId}${config.jurisdiction === "eu" ? ".eu" : ""}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 3,
    });
  }
  async read(key: string): Promise<LegacyRead> {
    if (!isLegacyMediaKey(key)) return { state: "missing" };
    let object: GetObjectCommandOutput;
    try {
      object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404 || (error as { name?: string }).name === "NoSuchKey")
        return { state: "missing" };
      throw error;
    }
    if (!object.Body) return { state: "missing" };
    if ((object.ContentLength ?? 0) > this.limit)
      return { state: "too_large", byteSize: object.ContentLength ?? 0 };
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.length > this.limit) return { state: "too_large", byteSize: bytes.length };
    return { state: "found", bytes };
  }
}

/**
 * The configured source, or null when none is configured.
 *
 * - `LEGACY_MEDIA_SOURCE=directory` with an absolute `LEGACY_MEDIA_DIR`;
 * - `LEGACY_MEDIA_SOURCE=r2` with `LEGACY_MEDIA_BUCKET` (default: the manifest's bucket name),
 *   `LEGACY_MEDIA_R2_JURISDICTION` (`default` or `eu`; default `default`, where the old site's
 *   bucket was created) and credentials from `LEGACY_MEDIA_R2_ACCOUNT_ID`,
 *   `LEGACY_MEDIA_R2_ACCESS_KEY_ID` and `LEGACY_MEDIA_R2_SECRET_ACCESS_KEY`, each falling back to
 *   the application's `R2_*` value. A read-only token for the legacy bucket is the safe choice.
 */
export function legacyMediaSource(
  source: Record<string, string | undefined> = process.env,
  defaultBucket = "ms-realty-media",
): LegacyMediaSource | null {
  const value = (name: string) => source[name]?.trim() || undefined;
  const kind = value("LEGACY_MEDIA_SOURCE");
  if (!kind) return null;
  if (kind === "directory") {
    const dir = value("LEGACY_MEDIA_DIR");
    if (!dir || !isAbsolute(dir))
      throw new Error("LEGACY_MEDIA_SOURCE=directory needs an absolute LEGACY_MEDIA_DIR.");
    return new DirectoryLegacyMediaSource(dir);
  }
  if (kind === "r2") {
    const accountId = value("LEGACY_MEDIA_R2_ACCOUNT_ID") ?? value("R2_ACCOUNT_ID");
    const accessKeyId = value("LEGACY_MEDIA_R2_ACCESS_KEY_ID") ?? value("R2_ACCESS_KEY_ID");
    const secretAccessKey =
      value("LEGACY_MEDIA_R2_SECRET_ACCESS_KEY") ?? value("R2_SECRET_ACCESS_KEY");
    const jurisdiction = value("LEGACY_MEDIA_R2_JURISDICTION") ?? "default";
    if (!accountId || !accessKeyId || !secretAccessKey)
      throw new Error("LEGACY_MEDIA_SOURCE=r2 needs an account id and an access key pair.");
    if (jurisdiction !== "default" && jurisdiction !== "eu")
      throw new Error("LEGACY_MEDIA_R2_JURISDICTION must be default or eu.");
    const bucket = value("LEGACY_MEDIA_BUCKET") ?? defaultBucket;
    if (bucket === value("R2_BUCKET"))
      throw new Error("The legacy media bucket must not be the application's own bucket.");
    return new R2LegacyMediaSource({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      jurisdiction,
    });
  }
  throw new Error("LEGACY_MEDIA_SOURCE must be directory or r2.");
}
