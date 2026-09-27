import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditEvents, invitations, principals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";

const run = promisify(execFile);
let database: TestDatabase;
let directory: string;
beforeAll(async () => {
  database = await createTestDatabase();
  directory = await mkdtemp(join(tmpdir(), "msr-bootstrap-test-"));
});
afterAll(async () => {
  await database?.drop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function bootstrap(output: string, extra: string[] = []) {
  return run(
    process.execPath,
    [
      "--conditions=react-server",
      "--import=tsx",
      resolve("scripts/bootstrap-staff.ts"),
      "--email",
      "bootstrap@example.test",
      "--name",
      "Synthetic operator",
      "--output",
      output,
      ...extra,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: database.url,
        PUBLIC_ORIGIN: "http://localhost:3000",
        CLIENT_ORIGIN: "http://my.localhost:3000",
        STAFF_ORIGIN: "http://app.localhost:3000",
      },
      timeout: 15_000,
    },
  );
}

it("bootstraps through a private file and requires explicit audited recovery for existing staff", async () => {
  const output = join(directory, "first.json");
  const first = await bootstrap(output);
  const invitation = JSON.parse(await readFile(output, "utf8")) as { url: string };
  const url = new URL(invitation.url);
  expect(url.origin).toBe("http://app.localhost:3000");
  expect(url.pathname).toBe("/bg/access/invitation");
  expect(url.searchParams.get("token")).toBeTruthy();
  expect((await stat(output)).mode & 0o777).toBe(0o600);
  expect(first.stdout + first.stderr).not.toContain(url.searchParams.get("token"));
  expect(await database.db.select().from(principals)).toHaveLength(1);
  expect(await database.db.select().from(invitations)).toHaveLength(1);

  await expect(bootstrap(output)).rejects.toThrow(/EEXIST/);
  await expect(bootstrap(join(directory, "refused.json"))).rejects.toThrow(/Staff already exists/);
  expect(await database.db.select().from(invitations)).toHaveLength(1);

  await bootstrap(join(directory, "recovery.json"), ["--break-glass"]);
  const events = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.action, "staff.bootstrap"));
  expect(events).toHaveLength(2);
  expect(
    events.map((event) => (event.payload as { breakGlass: boolean }).breakGlass).sort(),
  ).toEqual([false, true]);
  const issued = await database.db.select().from(invitations);
  expect(issued.filter((invitation) => invitation.revokedAt === null)).toHaveLength(1);
}, 30_000);
