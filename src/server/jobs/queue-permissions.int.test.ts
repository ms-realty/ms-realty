import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, it, vi } from "vitest";
import { createTestDatabase } from "@/db/test-utils";
import { JobQueue } from "./queue";

it("starts and completes queue work in its precreated schema without database CREATE", async () => {
  const fixture = await createTestDatabase();
  const database = new URL(fixture.url).pathname.slice(1);
  expect(database).toMatch(/^test_[a-f0-9]{32}$/);
  const role = `msr_queue_${randomUUID().replaceAll("-", "")}`;
  const password = randomUUID();
  const admin = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  let queue: JobQueue | undefined;
  let client: postgres.Sql | undefined;
  try {
    await admin.unsafe(`create role "${role}" login password '${password}'`);
    await fixture.sql.unsafe(`revoke create on database "${database}" from public`);
    await fixture.sql.unsafe(`create schema pgboss authorization "${role}"`);
    const url = new URL(fixture.url);
    url.username = role;
    url.password = password;
    const roleClient = postgres(url.toString(), { max: 1, onnotice: () => {} });
    client = roleClient;
    const privilege = async () =>
      (
        await roleClient`select has_database_privilege(current_user, current_database(), 'CREATE') as allowed`
      )[0]?.allowed;
    expect(await privilege()).toBe(false);
    vi.stubEnv("JOB_QUEUE_SCHEMA_PRECREATED", "true");
    queue = new JobQueue(url.toString());
    await queue.start();
    let completed = 0;
    await queue.work("worker.heartbeat", async () => {
      completed++;
    });
    expect(await queue.send("worker.heartbeat", {})).toBeTypeOf("string");
    await vi.waitFor(() => expect(completed).toBe(1), { timeout: 10_000 });
    expect(await privilege()).toBe(false);
    await expect(client.unsafe("create schema forbidden_queue_test")).rejects.toMatchObject({
      code: "42501",
    });
  } finally {
    vi.unstubAllEnvs();
    await queue?.stop().catch(() => {});
    await client?.end({ timeout: 1 });
    await fixture.drop();
    await admin.unsafe(`drop role if exists "${role}"`);
    await admin.end();
  }
}, 30_000);
