import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { passkeys, principals, privacyRequests } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient, createStaff } from "../testing";
import { listStaffPrivacyRequests, privacyQueuePageSize } from "./requests";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function staff(authorized = true) {
  const person = await createStaff(t.db, {
    grants: authorized ? [{ capability: "privacy.manage" }] : [],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice" as const,
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}

it("reaches every request beyond 100, preserves timestamp ties including microseconds, and reverses a native cursor page", async () => {
  const operator = await staff();
  const ids = Array.from(
    { length: 107 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  await t.db.insert(privacyRequests).values(
    ids.map((id, i) => ({
      id,
      reference: `PR-QUEUE-${i}`,
      kind: "correction" as const,
      responsibleId: operator.id,
      scope: { description: `Synthetic unresolved request ${i}` },
      // Boundary precision is deliberately beyond the JS Date millisecond precision.
      createdAt: sql`'2026-09-30T10:00:00.123456Z'::timestamptz`,
    })),
  );
  const seen: string[] = [];
  let page = await listStaffPrivacyRequests(t.db, operator.session);
  const firstPageIds = page.rows.map(({ record }) => record.id);
  expect(page.previous).toBeNull();
  expect(page.next).not.toBeNull();
  while (true) {
    expect(page.rows.length).toBeLessThanOrEqual(privacyQueuePageSize);
    seen.push(...page.rows.map(({ record }) => record.id));
    if (!page.next) break;
    page = await listStaffPrivacyRequests(t.db, operator.session, { after: page.next });
  }
  expect(seen).toEqual([...ids].reverse());
  expect(new Set(seen).size).toBe(107);
  expect(page.rows.at(-1)?.record.scope).toEqual({ description: "Synthetic unresolved request 0" });
  while (page.previous)
    page = await listStaffPrivacyRequests(t.db, operator.session, { before: page.previous });
  expect(page.rows.map(({ record }) => record.id)).toEqual(firstPageIds);

  // An update ahead of an already-issued position must not offset or skip its remaining rows.
  const first = await listStaffPrivacyRequests(t.db, operator.session);
  const updatedId = ids.at(-1);
  if (!updatedId || !first.next) throw new Error("Missing boundary fixture");
  await t.db
    .update(privacyRequests)
    .set({ updatedAt: new Date() })
    .where(eq(privacyRequests.id, updatedId));
  const samePage = await listStaffPrivacyRequests(t.db, operator.session);
  expect(samePage.rows.map(({ record }) => record.id)).toEqual(firstPageIds);
  const next = await listStaffPrivacyRequests(t.db, operator.session, { after: first.next });
  expect(next.rows.map(({ record }) => record.id)).toEqual([...ids].reverse().slice(25, 50));
});

it("checks current authority before either cursor parsing or later-page reads", async () => {
  const denied = await staff(false),
    operator = await staff();
  const person = await createClient(t.db);
  const client = await createSession(t.db, { kind: "client", id: person.id });
  await expect(
    listStaffPrivacyRequests(t.db, denied.session, { after: "malformed" }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    listStaffPrivacyRequests(t.db, client.session, { after: "malformed" }),
  ).rejects.toMatchObject({ code: "not_found" });
  await t.db.insert(privacyRequests).values(
    Array.from({ length: privacyQueuePageSize + 1 }, () => ({
      reference: `PR-AUTH-${randomUUID()}`,
      kind: "access" as const,
      responsibleId: operator.id,
      scope: { description: "Synthetic paging authorization fixture" },
    })),
  );
  const first = await listStaffPrivacyRequests(t.db, operator.session);
  if (!first.next) throw new Error("Missing later-page fixture");
  await t.db.update(principals).set({ status: "suspended" }).where(eq(principals.id, operator.id));
  await expect(
    listStaffPrivacyRequests(t.db, operator.session, { after: first.next }),
  ).rejects.toBeDefined();
});
