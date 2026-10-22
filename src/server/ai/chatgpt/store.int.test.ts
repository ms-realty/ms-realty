import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chatgptOauthRegistrations } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { accessToken, saveRegistration } from "./oauth";
import { PostgresChatGptStore } from "./store";
import { type ChatGptCredential, chatGptIssuer, directScope, registrationId } from "./types";

let t: TestDatabase;
const key = randomBytes(32);
let operator: PostgresChatGptStore, runtime: PostgresChatGptStore;
beforeAll(async () => {
  t = await createTestDatabase();
  operator = new PostgresChatGptStore(t.db, key, "synthetic", "operator");
  runtime = new PostgresChatGptStore(t.db, key, "synthetic", "runtime");
  await operator.hostId();
}, 60_000);
afterAll(async () => {
  await t?.drop();
});
async function credential(): Promise<ChatGptCredential> {
  return {
    issuer: chatGptIssuer,
    clientId: "oaiapp_synthetic",
    subject: randomUUID(),
    label: "Synthetic operator",
    email: null,
    hostId: await operator.hostId(),
    savedAt: Date.now(),
    tokens: {
      accessToken: "test-access",
      refreshToken: "test-refresh",
      idToken: "test-id",
      scopes: [directScope],
      expiresAt: Date.now() - 1000,
    },
  };
}
describe("durable ChatGPT credential and refresh adapter", () => {
  it("persists ciphertext and the destination host without a Container filesystem dependency", async () => {
    const record = await credential(),
      id = await saveRegistration(operator, record);
    const [row] = await t.db
      .select()
      .from(chatgptOauthRegistrations)
      .where(
        and(
          eq(chatgptOauthRegistrations.hostKey, "synthetic"),
          eq(chatgptOauthRegistrations.id, id),
        ),
      );
    expect(row?.encryptedCredential).not.toContain("test-access");
    expect(await runtime.withRegistration(id, (session) => session.load())).toEqual(record);
    expect(await runtime.hostId()).toBe(record.hostId);
    const wrongHost = { ...record, hostId: "laptop-host" };
    await expect(saveRegistration(operator, wrongHost)).rejects.toThrow("chatgpt_host_mismatch");
    const grants = await t.db.execute<{ count: string }>(
      sql`select count(*)::text as count from information_schema.role_table_grants where grantee='PUBLIC' and table_name in ('chatgpt_oauth_hosts','chatgpt_oauth_registrations')`,
    );
    expect(grants[0]?.count).toBe("0");
    expect(await operator.initializeHost(record.hostId)).toBe(record.hostId);
    await expect(operator.initializeHost(`urn:uuid:${randomUUID()}`)).rejects.toThrow(
      "chatgpt_host_mismatch",
    );
    await expect(runtime.initializeHost(record.hostId)).rejects.toThrow(
      "chatgpt_operator_required",
    );
  });
  it("preserves the bootstrap installation host during an explicit first import", async () => {
    const destination = new PostgresChatGptStore(t.db, key, "separate-installation", "operator");
    const hostId = `urn:uuid:${randomUUID()}`;
    expect(await destination.initializeHost(hostId)).toBe(hostId);
    expect(
      await new PostgresChatGptStore(t.db, key, "separate-installation", "runtime").hostId(),
    ).toBe(hostId);
  });
  it("serializes refreshes from separate adapter instances through PostgreSQL", async () => {
    const value = await credential(),
      id = await saveRegistration(operator, value);
    const transport = vi.fn<typeof fetch>(async () => {
      await new Promise((done) => setTimeout(done, 25));
      return Response.json({
        access_token: "replacement",
        refresh_token: randomUUID(),
        token_type: "Bearer",
        expires_in: 3600,
      });
    });
    const other = new PostgresChatGptStore(t.db, key, "synthetic", "runtime");
    expect(
      await Promise.all([
        accessToken(runtime, id, { fetch: transport }),
        accessToken(other, id, { fetch: transport }),
      ]),
    ).toEqual(["replacement", "replacement"]);
    expect(transport).toHaveBeenCalledTimes(1);
    const saved = await runtime.withRegistration(id, (session) => session.load());
    expect(saved?.tokens?.refreshToken).not.toBe("test-refresh");
    expect(saved?.tokens?.expiresAt).toBeGreaterThan(Date.now());
  });
  it("enforces runtime/operator capabilities and rejects identity/AAD tampering", async () => {
    await expect(runtime.list()).rejects.toThrow("chatgpt_operator_required");
    const value = await credential(),
      id = registrationId(value);
    await expect(saveRegistration(runtime, value)).rejects.toThrow("chatgpt_operator_required");
    await saveRegistration(operator, value);
    await t.db
      .update(chatgptOauthRegistrations)
      .set({ subject: randomUUID() })
      .where(eq(chatgptOauthRegistrations.id, id));
    await expect(runtime.withRegistration(id, (session) => session.load())).rejects.toThrow();
  });
  it("refreshes with a constrained SQL role that cannot create registrations or alter identities", async () => {
    const value = await credential(),
      id = await saveRegistration(operator, value);
    const role = `msr_oauth_test_${randomUUID().replaceAll("-", "")}`;
    const rollback = new Error("rollback_synthetic_role");
    await expect(
      t.db.transaction(async (connection) => {
        // This role and its grants exist only inside this rolled-back test transaction.
        await connection.execute(sql.raw(`create role "${role}" nologin`));
        await connection.execute(sql.raw(`grant usage on schema public to "${role}"`));
        await connection.execute(
          sql.raw(`grant select on chatgpt_oauth_hosts, chatgpt_oauth_registrations to "${role}"`),
        );
        await connection.execute(
          sql.raw(
            `grant update (encrypted_credential, connected, version, updated_at) on chatgpt_oauth_registrations to "${role}"`,
          ),
        );
        await connection.execute(sql.raw(`set local role "${role}"`));
        const scoped = new PostgresChatGptStore(connection, key, "synthetic", "runtime");
        expect(
          await accessToken(scoped, id, {
            fetch: async () =>
              Response.json({
                access_token: "replacement",
                refresh_token: randomUUID(),
                token_type: "Bearer",
                expires_in: 3600,
              }),
          }),
        ).toBe("replacement");
        await expect(
          connection.transaction(async (transaction) => {
            await transaction.execute(
              sql`update chatgpt_oauth_registrations set subject = 'changed' where id = ${id}`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: "42501" } });
        await expect(
          connection.transaction(async (transaction) => {
            await transaction.execute(
              sql`insert into chatgpt_oauth_hosts (key, host_id) values ('forbidden', 'forbidden')`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: "42501" } });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
