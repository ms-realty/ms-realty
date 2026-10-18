import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { chatgptOauthHosts, chatgptOauthRegistrations } from "@/db/schema/chatgpt";
import type { Executor } from "../../db";
import {
  assertRegistrationId,
  type ChatGptCredential,
  type ChatGptCredentialStore,
  ChatGptError,
  credentialSchema,
  type LockedRegistration,
  registrationId,
} from "./types";

function checkRecord(id: string, value: unknown): ChatGptCredential {
  const record = credentialSchema.parse(value);
  if (registrationId(record) !== id)
    throw new ChatGptError("chatgpt_registration_mismatch", "configuration");
  return record;
}
async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new ChatGptError("chatgpt_store_permissions", "configuration");
}
async function privateRead(path: string): Promise<unknown | null> {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size > 131_072 ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new ChatGptError("chatgpt_store_permissions", "configuration");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}
async function privateWrite(path: string, value: unknown) {
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new ChatGptError("chatgpt_store_symlink", "configuration");
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(
    temp,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  } finally {
    await file.close();
  }
  await rename(temp, path);
  const parent = await open(dirname(path), constants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

/** Operator bootstrap storage; never selected as a production Container fallback. */
export class FileChatGptStore implements ChatGptCredentialStore {
  readonly root: string;
  constructor(path: string) {
    this.root = resolve(path);
  }
  async #locked<T>(name: string, action: () => Promise<T>): Promise<T> {
    await privateDirectory(this.root);
    const path = join(this.root, `${name}.lock`),
      ownership = randomUUID();
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        lock = await open(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        );
        await lock.writeFile(JSON.stringify({ pid: process.pid, ownership }));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // Never guess that an old lock has expired: an operator may inspect a crashed process.
        await new Promise((done) => setTimeout(done, 50));
      }
    }
    if (!lock) throw new ChatGptError("chatgpt_store_busy", "later");
    try {
      return await action();
    } finally {
      await lock.close();
      const saved = (await privateRead(path)) as { ownership?: string } | null;
      if (saved?.ownership === ownership) await unlink(path);
    }
  }
  async hostId(): Promise<string> {
    return this.#hostId();
  }
  async initializeHost(hostId: string): Promise<string> {
    if (!/^urn:uuid:[a-f0-9-]{36}$/.test(hostId))
      throw new ChatGptError("chatgpt_host_invalid", "configuration");
    return this.#hostId(hostId);
  }
  async #hostId(initial?: string): Promise<string> {
    return this.#locked("host", async () => {
      const path = join(this.root, "host.json"),
        existing = (await privateRead(path)) as { hostId?: unknown } | null;
      if (existing) {
        if (
          typeof existing.hostId !== "string" ||
          !/^urn:uuid:[a-f0-9-]{36}$/.test(existing.hostId)
        )
          throw new ChatGptError("chatgpt_host_invalid");
        if (initial && initial !== existing.hostId)
          throw new ChatGptError("chatgpt_host_mismatch", "configuration");
        return existing.hostId;
      }
      const hostId = initial ?? `urn:uuid:${randomUUID()}`;
      await privateWrite(path, { hostId });
      return hostId;
    });
  }
  async list() {
    await privateDirectory(this.root);
    const result: Array<{ id: string; label: string; connected: boolean }> = [];
    for (const name of (await readdir(this.root))
      .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
      .sort()) {
      const id = name.slice(0, -5);
      await this.withRegistration(id, async (session) => {
        const record = await session.load();
        if (record) result.push({ id, label: record.label, connected: record.tokens !== null });
      });
    }
    return result;
  }
  async pendingClient(): Promise<string | undefined> {
    return this.#locked("registration", async () => {
      const value = (await privateRead(join(this.root, "registration.json"))) as {
        clientId?: unknown;
      } | null;
      if (value?.clientId === null || value === null) return undefined;
      if (
        typeof value.clientId !== "string" ||
        value.clientId === "dynamic_agent_client" ||
        value.clientId.length > 512 ||
        !value.clientId
      )
        throw new ChatGptError("chatgpt_client_invalid", "configuration");
      return value.clientId;
    });
  }
  async savePendingClient(clientId: string | null): Promise<void> {
    await this.#locked("registration", async () => {
      if (
        clientId !== null &&
        (!clientId || clientId === "dynamic_agent_client" || clientId.length > 512)
      )
        throw new ChatGptError("chatgpt_client_invalid", "configuration");
      await privateWrite(join(this.root, "registration.json"), { clientId });
    });
  }
  async withRegistration<T>(
    id: string,
    action: (session: LockedRegistration) => Promise<T>,
  ): Promise<T> {
    assertRegistrationId(id);
    return this.#locked(id, () =>
      action({
        load: async () => {
          const value = await privateRead(join(this.root, `${id}.json`));
          return value === null ? null : checkRecord(id, value);
        },
        save: async (value) => {
          await privateWrite(join(this.root, `${id}.json`), checkRecord(id, value));
        },
      }),
    );
  }
}

export function decodeEncryptionKey(raw: string | undefined): Buffer {
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw new ChatGptError("chatgpt_encryption_key_missing", "configuration");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.byteLength !== 32 || bytes.toString("base64") !== raw)
    throw new ChatGptError("chatgpt_encryption_key_invalid", "configuration");
  return bytes;
}
function aad(
  hostKey: string,
  record: Pick<ChatGptCredential, "issuer" | "clientId" | "subject">,
): Buffer {
  return Buffer.from(
    JSON.stringify(["msr-chatgpt-v1", hostKey, record.issuer, record.clientId, record.subject]),
  );
}
export function encryptCredential(
  key: Uint8Array,
  hostKey: string,
  record: ChatGptCredential,
): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(hostKey, record));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptCredential(
  key: Uint8Array,
  hostKey: string,
  identity: Pick<ChatGptCredential, "issuer" | "clientId" | "subject">,
  value: string,
): ChatGptCredential {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new ChatGptError("chatgpt_ciphertext_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(hostKey, identity));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]);
  return credentialSchema.parse(JSON.parse(plain.toString("utf8")));
}

/** Persistent encrypted registrations; advisory transaction lock serializes rotating refresh across replicas. */
export class PostgresChatGptStore implements ChatGptCredentialStore {
  constructor(
    readonly db: Executor,
    readonly key: Uint8Array,
    readonly hostKey: string,
    readonly role: "runtime" | "operator" = "runtime",
  ) {
    if (key.byteLength !== 32 || !/^[a-zA-Z0-9_-]{1,80}$/.test(hostKey))
      throw new ChatGptError("chatgpt_store_configuration", "configuration");
  }
  async hostId(): Promise<string> {
    return this.#hostId();
  }
  async initializeHost(hostId: string): Promise<string> {
    if (this.role !== "operator")
      throw new ChatGptError("chatgpt_operator_required", "configuration");
    if (!/^urn:uuid:[a-f0-9-]{36}$/.test(hostId))
      throw new ChatGptError("chatgpt_host_invalid", "configuration");
    return this.#hostId(hostId);
  }
  async #hostId(initial?: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`chatgpt:host:${this.hostKey}`}, 0))`,
      );
      const [host] = await tx
        .select()
        .from(chatgptOauthHosts)
        .where(eq(chatgptOauthHosts.key, this.hostKey));
      if (host) {
        if (initial && initial !== host.hostId)
          throw new ChatGptError("chatgpt_host_mismatch", "configuration");
        return host.hostId;
      }
      if (this.role !== "operator")
        throw new ChatGptError("chatgpt_host_not_initialized", "configuration");
      const hostId = initial ?? `urn:uuid:${randomUUID()}`;
      await tx.insert(chatgptOauthHosts).values({ key: this.hostKey, hostId });
      return hostId;
    });
  }
  async list() {
    if (this.role !== "operator")
      throw new ChatGptError("chatgpt_operator_required", "configuration");
    return this.db
      .select({
        id: chatgptOauthRegistrations.id,
        label: chatgptOauthRegistrations.label,
        connected: chatgptOauthRegistrations.connected,
      })
      .from(chatgptOauthRegistrations)
      .where(eq(chatgptOauthRegistrations.hostKey, this.hostKey));
  }
  async withRegistration<T>(
    id: string,
    action: (session: LockedRegistration) => Promise<T>,
  ): Promise<T> {
    assertRegistrationId(id);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('lock_timeout','15s',true), set_config('statement_timeout','30s',true)`,
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`chatgpt:registration:${this.hostKey}:${id}`}, 0))`,
      );
      const [host] = await tx
        .select()
        .from(chatgptOauthHosts)
        .where(eq(chatgptOauthHosts.key, this.hostKey));
      if (!host) throw new ChatGptError("chatgpt_host_not_initialized", "configuration");
      const where = and(
        eq(chatgptOauthRegistrations.hostKey, this.hostKey),
        eq(chatgptOauthRegistrations.id, id),
      );
      let [row] = await tx.select().from(chatgptOauthRegistrations).where(where).for("update");
      return action({
        load: async () => {
          if (!row) return null;
          const record = checkRecord(
            id,
            decryptCredential(this.key, this.hostKey, row, row.encryptedCredential),
          );
          if (record.hostId !== host.hostId)
            throw new ChatGptError("chatgpt_host_mismatch", "configuration");
          return record;
        },
        save: async (value) => {
          const record = checkRecord(id, value);
          if (record.hostId !== host.hostId)
            throw new ChatGptError("chatgpt_host_mismatch", "configuration");
          if (!row && this.role !== "operator")
            throw new ChatGptError("chatgpt_operator_required", "configuration");
          if (
            row &&
            (row.issuer !== record.issuer ||
              row.clientId !== record.clientId ||
              row.subject !== record.subject)
          )
            throw new ChatGptError("chatgpt_registration_mismatch", "configuration");
          if (row && this.role === "runtime" && row.label !== record.label)
            throw new ChatGptError("chatgpt_operator_required", "configuration");
          const encryptedCredential = encryptCredential(this.key, this.hostKey, record);
          if (row) {
            await tx
              .update(chatgptOauthRegistrations)
              .set({
                encryptedCredential,
                connected: record.tokens !== null,
                ...(this.role === "operator" ? { label: record.label } : {}),
                version: row.version + 1,
                updatedAt: new Date(),
              })
              .where(where);
          } else {
            await tx.insert(chatgptOauthRegistrations).values({
              id,
              hostKey: this.hostKey,
              issuer: record.issuer,
              clientId: record.clientId,
              subject: record.subject,
              label: record.label,
              encryptedCredential,
              connected: record.tokens !== null,
            });
          }
          [row] = await tx.select().from(chatgptOauthRegistrations).where(where);
        },
      });
    });
  }
}
