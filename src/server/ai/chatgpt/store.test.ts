import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decodeEncryptionKey,
  decryptCredential,
  encryptCredential,
  FileChatGptStore,
} from "./store";
import { type ChatGptCredential, chatGptIssuer, directScope, registrationId } from "./types";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const record = (): ChatGptCredential => ({
  issuer: chatGptIssuer,
  subject: "synthetic-subject",
  clientId: "oaiapp_synthetic",
  label: "Synthetic operator",
  hostId: "urn:uuid:synthetic-host",
  email: null,
  tokens: {
    accessToken: "test-access",
    refreshToken: "test-refresh",
    idToken: "test-id",
    scopes: [directScope],
    expiresAt: Date.now() + 3_600_000,
  },
  savedAt: Date.now(),
});
describe("protected OAuth credential stores", () => {
  it("binds ciphertext authentication to host, issuer, issued client and verified subject", () => {
    const key = randomBytes(32),
      value = record(),
      encrypted = encryptCredential(key, "production", value);
    expect(encrypted).not.toContain("test-access");
    expect(decryptCredential(key, "production", value, encrypted)).toEqual(value);
    expect(() => decryptCredential(key, "other-host", value, encrypted)).toThrow();
    expect(() =>
      decryptCredential(key, "production", { ...value, subject: "other-subject" }, encrypted),
    ).toThrow();
    expect(() =>
      decryptCredential(key, "production", { ...value, clientId: "other-client" }, encrypted),
    ).toThrow();
    expect(() => decryptCredential(randomBytes(32), "production", value, encrypted)).toThrow();
    expect(() => decryptCredential(key, "production", value, encrypted.slice(0, -8))).toThrow();
  });
  it("requires a separate exact-size encryption key", () => {
    expect(decodeEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    for (const bad of [undefined, "", "AUTH_SECRET", randomBytes(31).toString("base64")])
      expect(() => decodeEncryptionKey(bad)).toThrow();
  });
  it("writes owner-only files atomically and retains stable host and separate registrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "msr-chatgpt-store-"));
    roots.push(root);
    const store = new FileChatGptStore(root),
      value = record(),
      id = registrationId(value);
    const host = await store.hostId();
    expect(await new FileChatGptStore(root).hostId()).toBe(host);
    expect(await store.initializeHost(host)).toBe(host);
    await expect(
      store.initializeHost("urn:uuid:00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow("chatgpt_host_mismatch");
    await store.withRegistration(id, async (session) => {
      await session.save(value);
    });
    const path = join(root, `${id}.json`);
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(value);
    const other = { ...value, clientId: "oaiapp_separate" },
      otherId = registrationId(other);
    await store.withRegistration(otherId, async (session) => {
      await session.save(other);
    });
    expect((await store.list()).map((x) => x.id).sort()).toEqual([id, otherId].sort());
    await expect(
      store.withRegistration(id, async (session) => {
        await session.save(other);
      }),
    ).rejects.toThrow("chatgpt_registration_mismatch");
  });
  it("adopts the durable installation host only into an empty bootstrap directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "msr-chatgpt-store-"));
    roots.push(root);
    const hostId = "urn:uuid:00000000-0000-4000-8000-000000000000";
    const store = new FileChatGptStore(root);
    expect(await store.initializeHost(hostId)).toBe(hostId);
    expect(await new FileChatGptStore(root).hostId()).toBe(hostId);
    await store.savePendingClient("oaiapp_pending");
    expect(await store.pendingClient()).toBe("oaiapp_pending");
    await store.savePendingClient(null);
    expect(await store.pendingClient()).toBeUndefined();
  });
  it("rejects insecure permissions and symlink destinations", async () => {
    const root = await mkdtemp(join(tmpdir(), "msr-chatgpt-store-"));
    roots.push(root);
    const store = new FileChatGptStore(root),
      value = record(),
      id = registrationId(value),
      path = join(root, `${id}.json`);
    await store.withRegistration(id, async (session) => {
      await session.save(value);
    });
    await chmod(path, 0o644);
    await expect(store.withRegistration(id, (session) => session.load())).rejects.toThrow(
      "chatgpt_store_permissions",
    );
    const link = join(root, "link");
    await symlink(root, link);
    await expect(new FileChatGptStore(link).hostId()).rejects.toThrow("chatgpt_store_permissions");
  });
});
