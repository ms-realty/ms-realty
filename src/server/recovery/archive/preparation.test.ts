import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generalDecrypt } from "jose";
import { afterEach, beforeAll, expect, it } from "vitest";
import { bytes } from "../../../../gateway/recovery-coordinator-contract";
import { type CrashStage, PreparationStore } from "./preparation";
import { type ArchiveFixture, archiveFixture } from "./testing";

let f: ArchiveFixture;
const directories: string[] = [];
beforeAll(async () => {
  f = await archiveFixture();
});
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "msr-r08-preparation-"));
  directories.push(dir);
  const content = Buffer.from(f.payload.canonicalBody);
  const scope = {
    contextDigest: f.contextDigest,
    purpose: "restrictive_payload" as const,
    logicalId: f.payload.digest,
    plaintext: bytes(content),
    encryptionProfileDigest: f.admission.context.encryptionProfileDigest,
  };
  return { dir, content, scope };
}
it("R08 D05/D06 uses standard JWE, durable selected bytes and one winner across concurrent/restarted preparation", async () => {
  const { dir, content, scope } = await setup();
  const [a, b] = await Promise.all([
    new PreparationStore(dir, 1048576).prepareOnce(scope, content, f.profile),
    new PreparationStore(dir, 1048576).prepareOnce(scope, content, f.profile),
  ]);
  expect(a).toEqual(b);
  const restarted = new PreparationStore(dir, 1048576),
    actual = await restarted.openPreparedExact(a);
  const decrypted = await generalDecrypt(JSON.parse(actual.toString()), f.decryptKey, {
    keyManagementAlgorithms: ["RSA-OAEP-256"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  expect(Buffer.from(decrypted.plaintext)).toEqual(content);
  expect(Buffer.from(decrypted.additionalAuthenticatedData ?? []).toString()).toBe(a.scopeDigest);
  expect(await restarted.prepareOnce(scope, content, f.profile)).toEqual(a);
  expect((await restarted.retainedArtifacts()).filter((p) => p.endsWith(".attempt"))).toHaveLength(
    2,
  );
  expect((await readFile(join(dir, `${a.ciphertext.sha256}.jwe`))).includes(content)).toBe(false);
});
for (const stage of [
  "before_ciphertext",
  "after_ciphertext_sync",
  "before_descriptor_install",
  "after_descriptor_sync",
] as CrashStage[])
  it(`R08 D05 retains crash artifacts at ${stage} without partial acknowledgement`, async () => {
    const { dir, content, scope } = await setup();
    await expect(
      new PreparationStore(dir, 1048576, (point) => {
        if (point === stage) throw new Error("process interrupted");
      }).prepareOnce(scope, content, f.profile),
    ).rejects.toThrow("interrupted");
    const store = new PreparationStore(dir, 1048576),
      artifacts = await store.retainedArtifacts();
    expect(artifacts.some((p) => p.endsWith(".attempt"))).toBe(true);
    const selected = await store.prepareOnce(scope, content, f.profile);
    expect(await store.openPreparedExact(selected)).toHaveLength(selected.ciphertext.size);
    expect((await store.retainedArtifacts()).length).toBeGreaterThanOrEqual(artifacts.length);
  });
for (const stage of [
  "before_ciphertext",
  "after_ciphertext_sync",
  "before_descriptor_install",
  "after_descriptor_sync",
] as CrashStage[])
  it(`R08 D05/D06 SIGKILL at ${stage} preserves only completed selected bytes across a new process`, async () => {
    const { dir, content, scope } = await setup();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `
      import { PreparationStore } from "./src/server/recovery/archive/preparation.ts";
      const x = JSON.parse(process.env.MSR_R08_TEST_CONFIG);
      await new PreparationStore(x.dir, 1048576, (stage) => {
        if (stage === x.stage) process.kill(process.pid, "SIGKILL");
      }).prepareOnce(x.scope, Buffer.from(x.content, "base64"), x.profile);
    `,
      ],
      {
        env: {
          ...process.env,
          MSR_R08_TEST_CONFIG: JSON.stringify({
            dir,
            content: content.toString("base64"),
            scope,
            profile: f.profile,
            stage,
          }),
        },
        stdio: "pipe",
      },
    );
    let diagnostic = "";
    child.stderr.on("data", (chunk) => {
      diagnostic += chunk;
    });
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
      },
    );
    expect(exit, diagnostic).toEqual({ code: null, signal: "SIGKILL" });
    const reopened = new PreparationStore(dir, 1048576);
    const before = await reopened.retainedArtifacts();
    expect(before.some((p) => p.endsWith(".json"))).toBe(stage === "after_descriptor_sync");
    const selected = await reopened.prepareOnce(scope, content, f.profile);
    expect(bytes(await reopened.openPreparedExact(selected))).toEqual(selected.ciphertext);
    if (stage === "after_descriptor_sync")
      expect(await reopened.retainedArtifacts()).toEqual(before);
    else
      for (const artifact of before) expect(await reopened.retainedArtifacts()).toContain(artifact);
  });
it("R08 D07 selected lost ciphertext cannot reencrypt or clear retained selection", async () => {
  const { dir, content, scope } = await setup(),
    store = new PreparationStore(dir, 1048576);
  const descriptor = await store.prepareOnce(scope, content, f.profile);
  await unlink(join(dir, `${descriptor.ciphertext.sha256}.jwe`));
  const before = await store.retainedArtifacts();
  await expect(store.prepareOnce(scope, content, f.profile)).rejects.toThrow();
  expect(await store.retainedArtifacts()).toEqual(before);
});
it("R08 D07 rejects a selected descriptor symlink without reading its target", async () => {
  const { dir, content, scope } = await setup();
  const store = new PreparationStore(dir, 1048576);
  const selected = await store.prepareOnce(scope, content, f.profile);
  const descriptor = join(dir, `${selected.scopeDigest}.json`);
  await unlink(descriptor);
  await symlink(join(dir, `${selected.ciphertext.sha256}.jwe`), descriptor);
  await expect(store.prepareOnce(scope, content, f.profile)).rejects.toThrow();
});
it("R08 D27 rejects a one-byte oversize and foreign profile before a preparation is selected", async () => {
  const { dir, content, scope } = await setup();
  await expect(
    new PreparationStore(dir, content.length - 1).prepareOnce(scope, content, f.profile),
  ).rejects.toThrow("bound");
  await expect(
    new PreparationStore(dir, 1048576).prepareOnce(
      { ...scope, encryptionProfileDigest: "f".repeat(64) },
      content,
      f.profile,
    ),
  ).rejects.toThrow("profile");
  expect(await new PreparationStore(dir, 1048576).retainedArtifacts()).toEqual([]);
});
