import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runMigrations } from "@/db/migrate";
import { auditEvents, cases, externalActions, grants, recoveryControl, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { processAssistanceRun } from "../ai/assistance";
import { readSession } from "../auth/sessions";
import { dispatchCaseEmail } from "../cases/email-dispatch";
import { dispatchMessage, dispatchQueued } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import { dispatchSearchAlert } from "../subscriptions/alerts";
import { assertRecoveryOpen, quarantineRestoredDatabase } from "./quarantine";
import { recoveryFixture } from "./testing";

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t?.drop();
});
const identity = () => ({ restoreId: randomUUID(), snapshotDigest: "a".repeat(64) });

it("invalidates restored credentials once while retaining work, grants and unsent commitments", async () => {
  const f = await recoveryFixture(t.db);
  await assertRecoveryOpen(t.db);
  const work = await t.db.select().from(cases);
  const workTasks = await t.db.select().from(tasks);
  const access = await t.db.select().from(grants);
  const pending = await t.db.select().from(externalActions);
  const input = identity();
  const saved = await quarantineRestoredDatabase(t.db, input);
  expect(saved.invalidated).toEqual({ sessions: 2, emailLinks: 1, invitations: 1, challenges: 1 });
  expect(await quarantineRestoredDatabase(t.db, input)).toEqual(saved);
  expect(await readSession(t.db, f.client.token)).toBeNull();
  expect(await readSession(t.db, f.staff.token)).toBeNull();
  expect(await t.db.select().from(cases)).toEqual(work);
  expect(await t.db.select().from(tasks)).toEqual(workTasks);
  expect(await t.db.select().from(grants)).toEqual(access);
  expect(await t.db.select().from(externalActions)).toEqual(pending);
  expect(
    await t.db.select().from(auditEvents).where(eq(auditEvents.action, "recovery.quarantined")),
  ).toHaveLength(1);
  await expect(quarantineRestoredDatabase(t.db, identity())).rejects.toThrow("different restore");
  await runMigrations(t.url);
  await expect(assertRecoveryOpen(t.db)).rejects.toThrow("Recovery quarantine");
});

it("denies direct mail, case mail, digests, AI and the standalone worker before any provider work", async () => {
  const f = await recoveryFixture(t.db);
  const before = await t.db.select().from(externalActions);
  await quarantineRestoredDatabase(t.db, identity());
  const provider = new TestMessageProvider();
  const generate = vi.fn();
  for (const call of [
    () => dispatchMessage(t.db, provider, f.queued.id),
    () => dispatchQueued(t.db, provider),
    () => dispatchCaseEmail(t.db, provider, f.queued.id),
    () => dispatchSearchAlert(t.db, provider, f.queued.id),
    () => processAssistanceRun(t.db, randomUUID(), { generate }),
  ])
    await expect(call()).rejects.toThrow("Recovery quarantine");
  expect(provider.sent).toHaveLength(0);
  expect(generate).not.toHaveBeenCalled();
  const result = await promisify(execFile)(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"],
    {
      timeout: 15000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: t.url,
        ENABLE_TEST_OUTBOX: "1",
        PUBLIC_ORIGIN: "http://localhost:3195",
        APP_ORIGIN: "http://localhost:3195",
        CLIENT_ORIGIN: "http://my.localhost:3195",
        STAFF_ORIGIN: "http://app.localhost:3195",
        CASE_INBOUND_ENABLED: "0",
        WORKER_HEARTBEAT_URL: "",
        BUTLER_ENABLED: "0",
      },
    },
  ).then(
    () => {
      throw new Error("Worker wrongly started");
    },
    (error) => error,
  );
  expect(result.code).toBe(1);
  expect(result.stdout).not.toContain("worker started");
  expect(result.stderr).toContain("queue worker failed");
  expect(
    await t.sql`select schema_name from information_schema.schemata where schema_name = 'pgboss'`,
  ).toHaveLength(0);
  expect(await t.db.select().from(externalActions)).toEqual(before);
}, 20000);

it("rolls quarantine and credential invalidation back together", async () => {
  const f = await recoveryFixture(t.db);
  await expect(
    t.db.transaction(async (tx) => {
      await quarantineRestoredDatabase(tx, identity());
      throw new Error("synthetic transaction failure");
    }),
  ).rejects.toThrow("synthetic transaction failure");
  await assertRecoveryOpen(t.db);
  expect(await readSession(t.db, f.client.token)).not.toBeNull();
  expect(
    await t.db.select().from(auditEvents).where(eq(auditEvents.action, "recovery.quarantined")),
  ).toHaveLength(0);
});

it("fails closed for a missing control row or schema, and refuses incomplete quarantine evidence", async () => {
  await expect(
    t.sql`update recovery_control set state = 'quarantined', restore_id = ${randomUUID()}, quarantined_at = now(), invalidated = '{}'::jsonb`,
  ).rejects.toMatchObject({ code: "23514" });
  await t.db.delete(recoveryControl);
  await expect(assertRecoveryOpen(t.db)).rejects.toThrow("Recovery quarantine");
  await expect(quarantineRestoredDatabase(t.db, identity())).rejects.toThrow("missing");
  await t.sql`drop table recovery_control`;
  await expect(assertRecoveryOpen(t.db)).rejects.toThrow("Recovery quarantine");
});
