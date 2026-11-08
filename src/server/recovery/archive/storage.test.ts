import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  bytes,
  copyEvidence,
  type Prepared,
  type Signer,
  scopeDigest,
  verifyEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import {
  type ImmutableTransport,
  PrivateDirectoryArchive,
  PrivateEuR2Archive,
  type PutOutcome,
  putEncryptedIfAbsent,
} from "./storage";
import { type ArchiveFixture, archiveFixture } from "./testing";

let f: ArchiveFixture;
const directories: string[] = [];
beforeAll(async () => {
  f = await archiveFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
function fixture() {
  const content = Buffer.from("synthetic encrypted bytes");
  const scope = {
    contextDigest: f.contextDigest,
    purpose: "restrictive_payload" as const,
    logicalId: f.payload.digest,
    plaintext: bytes("plaintext"),
    encryptionProfileDigest: f.admission.context.encryptionProfileDigest,
  };
  const descriptor: Prepared = {
    scope,
    scopeDigest: scopeDigest(scope),
    ciphertext: bytes(content),
  };
  const events: { state: string; raw?: string }[] = [];
  const retain = async (e: { state: string; raw?: string }) => {
    events.push(e);
  };
  const run = (transport: ImmutableTransport) =>
    putEncryptedIfAbsent(
      f.admission,
      "euR2",
      transport,
      descriptor,
      content,
      f.signers.euR2 as Signer,
      retain,
    );
  return { descriptor, content, events, run };
}
function transport(content: Buffer | null, outcome: PutOutcome = "created"): ImmutableTransport {
  return {
    destinationId: f.admission.context.euR2,
    put: async () => outcome,
    get: async () =>
      content === null
        ? null
        : (async function* () {
            yield content.subarray(0, 5);
            yield content.subarray(5);
          })(),
  };
}
for (const outcome of ["created", "precondition_412", "locked_409", "uncertain"] as const)
  it(`R08 D08/D09/D11 authenticates actual readback after ${outcome}`, async () => {
    const x = fixture(),
      result = await x.run(transport(x.content, outcome));
    expect(result.state).toBe("verified");
    const create = await verifyEvidence(
      result.create,
      "recovery-copy",
      f.admission.context.euR2,
      f.roots,
      copyEvidence,
    );
    const read = await verifyEvidence(
      result.readback as string,
      "recovery-copy",
      f.admission.context.euR2,
      f.roots,
      copyEvidence,
    );
    expect(create.outcome).toBe(outcome);
    expect(read.outcome).toBe("present_identical");
    expect(read.ciphertext).toEqual(bytes(x.content));
    expect(x.events[0]?.state).toBe("uncertain_before_put");
    expect(JSON.parse(x.events[0]?.raw as string)).toMatchObject({
      scopeDigest: x.descriptor.scopeDigest,
      ciphertext: bytes(x.content),
    });
  });
it("R08 D11 timeout plus racing 404 stays unknown until the same immutable bytes appear", async () => {
  const x = fixture(),
    t = transport(null, "uncertain");
  const puts: Uint8Array[] = [];
  t.put = async (_key, body) => {
    puts.push(body);
    return puts.length === 1 ? "uncertain" : "precondition_412";
  };
  expect(await x.run(t)).toMatchObject({ state: "unknown", readback: null });
  t.get = async () =>
    (async function* () {
      yield x.content;
    })();
  expect(await x.run(t)).toMatchObject({ state: "verified" });
  expect(puts).toEqual([x.content, x.content]);
});
it("R08 D27 refuses a symlink before creating anything beneath an outside namespace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "msr-r08-copy-symlink-"));
  directories.push(dir);
  await mkdir(join(dir, "outside"), { mode: 0o700 });
  await mkdir(join(dir, "foreign"), { mode: 0o700 });
  await symlink(join(dir, "foreign"), join(dir, "outside", "synthetic-archive"));
  const adapter = new PrivateDirectoryArchive(
    "synthetic-outside",
    join(dir, "outside"),
    "synthetic-archive",
    1024,
  );
  await expect(
    adapter.put(`synthetic-archive/sha256/${"a".repeat(64)}`, Buffer.from("data")),
  ).rejects.toThrow("private real directory");
  expect(await readdir(join(dir, "foreign"))).toEqual([]);
});
it("R08 D27 allows the exact single-PUT byte bound and retains SDK retry/transport pins", async () => {
  const adapter = new PrivateEuR2Archive(
    "synthetic-eu",
    "synthetic-archive",
    "synthetic-bucket",
    "a".repeat(32),
    { accessKeyId: "synthetic", secretAccessKey: "synthetic" },
    1024,
  );
  const mock = vi.spyOn(S3Client.prototype, "send").mockResolvedValue(undefined);
  expect(await adapter.put(`synthetic-archive/sha256/${"b".repeat(64)}`, Buffer.alloc(1024))).toBe(
    "created",
  );
  expect(mock).toHaveBeenCalledTimes(1);
  await expect(
    adapter.put(`synthetic-archive/sha256/${"b".repeat(64)}`, Buffer.alloc(1025)),
  ).rejects.toThrow("oversized");
  expect(mock).toHaveBeenCalledTimes(1);
});
it("R08 D10/D12 rejects wrong, truncated, extra or failing actual bodies regardless of metadata", async () => {
  for (const body of [
    Buffer.from("different"),
    Buffer.from("synthetic encrypted byte"),
    Buffer.from("synthetic encrypted bytes!"),
  ]) {
    const x = fixture();
    await expect(x.run(transport(body))).rejects.toThrow("readback");
    expect(x.events.some((e) => e.state === "present_identical")).toBe(false);
  }
  const x = fixture(),
    t = transport(x.content);
  t.get = async () =>
    (async function* () {
      yield x.content.subarray(0, 5);
      throw new Error("stream interrupted");
    })();
  await expect(x.run(t)).rejects.toThrow("stream interrupted");
});
it("R08 D09/D10 maps only exact R2 locked conflict or 412 and never arbitrary 409/redirect", async () => {
  const adapter = new PrivateEuR2Archive(
    "synthetic-eu",
    "synthetic-archive",
    "synthetic-bucket",
    "a".repeat(32),
    { accessKeyId: "synthetic", secretAccessKey: "synthetic" },
    1024,
  );
  const mock = vi.spyOn(S3Client.prototype, "send");
  const objectKey = `synthetic-archive/sha256/${"b".repeat(64)}`;
  for (const [status, name, outcome] of [
    [412, "PreconditionFailed", "precondition_412"],
    [409, "ObjectLockedByBucketPolicy", "locked_409"],
  ] as const) {
    mock.mockRejectedValueOnce({ name, $metadata: { httpStatusCode: status } });
    expect(await adapter.put(objectKey, Buffer.from("abc"))).toBe(outcome);
  }
  for (const error of [
    { name: "Conflict", $metadata: { httpStatusCode: 409 } },
    { $metadata: { httpStatusCode: 409 } },
    { $metadata: { httpStatusCode: 302 } },
  ]) {
    mock.mockRejectedValueOnce(error);
    await expect(adapter.put(objectKey, Buffer.from("abc"))).rejects.toThrow("rejected storage");
  }
  const command = mock.mock.calls[0]?.[0] as { input: { IfNoneMatch: string; Bucket: string } };
  expect(command.input.IfNoneMatch).toBe("*");
  expect(command.input.Bucket).toBe("synthetic-bucket");
  await expect(adapter.put("../sha256/x", Buffer.from("abc"))).rejects.toThrow("key");
  await expect(adapter.put(objectKey, Buffer.alloc(1025))).rejects.toThrow("oversized");
});
it("R08 D14 distinct explicit persistent directory copies survive reopen with conditional no-clobber", async () => {
  const dir = await mkdtemp(join(tmpdir(), "msr-r08-copy-"));
  directories.push(dir);
  const x = fixture(),
    objectKey = `synthetic-archive/sha256/${x.descriptor.ciphertext.sha256}`;
  const a = new PrivateDirectoryArchive("synthetic-outside", dir, "synthetic-archive", 1024);
  expect(await a.put(objectKey, x.content)).toBe("created");
  const restarted = new PrivateDirectoryArchive(
    "synthetic-outside",
    dir,
    "synthetic-archive",
    1024,
  );
  expect(await restarted.put(objectKey, Buffer.from("cannot replace"))).toBe("precondition_412");
  const chunks = [];
  for await (const c of (await restarted.get(objectKey)) ?? []) chunks.push(c);
  expect(Buffer.concat(chunks)).toEqual(x.content);
  await expect(x.run(restarted)).rejects.toThrow("destination");
});
