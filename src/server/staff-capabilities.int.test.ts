import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can, type Resource, staffWhoCan } from "./authz";
import { createClient, createStaff } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("matches individual live checks across membership, revocation, expiry and parent/locale scopes", async () => {
  const now = new Date(),
    taskId = randomUUID(),
    caseId = randomUUID(),
    propertyId = randomUUID();
  const people = await Promise.all([
    createStaff(t.db, { roles: ["assigned_broker"] }),
    createStaff(t.db, {
      grants: [{ capability: "task.manage", recordType: "task", recordId: taskId }],
    }),
    createStaff(t.db, {
      grants: [{ capability: "task.manage", recordType: "case", recordId: caseId }],
    }),
    createStaff(t.db, {
      grants: [{ capability: "task.manage", recordType: "case", recordId: randomUUID() }],
    }),
    createStaff(t.db, {
      grants: [{ capability: "task.manage", recordType: "property", recordId: propertyId }],
    }),
    createStaff(t.db, { grants: [{ capability: "task.manage", locales: ["bg"] }] }),
    createStaff(t.db, {
      grants: [{ capability: "task.manage", expiresAt: new Date(now.getTime() - 1) }],
    }),
    createStaff(t.db, { roles: ["assigned_broker"], status: "suspended" }),
    createStaff(t.db, { roles: ["assigned_broker"], membership: "ended" }),
    createStaff(t.db),
  ]);
  const revoked = await createStaff(t.db, { roles: ["assigned_broker"] });
  await t.db.update(grants).set({ revokedAt: now }).where(eq(grants.principalId, revoked.id));
  const client = await createClient(t.db);
  const ids = [...people.map((p) => p.id), revoked.id, client.id, randomUUID()];
  for (const locale of ["bg", "en", undefined] as const) {
    const resource: Resource = {
      type: "task",
      id: taskId,
      caseId,
      propertyId,
      locale,
      audience: "internal",
    };
    const expected = new Set<string>();
    for (const id of ids)
      if (await can(t.db, { kind: "staff", id }, "task.manage", resource, now)) expected.add(id);
    const result = await staffWhoCan(t.db, ids, ["task.manage"], resource, now);
    expect(result).toEqual(expected);
    expect(result.size).toBe(locale === "bg" ? 4 : 3);
  }
  expect(await staffWhoCan(t.db, [], ["task.manage"])).toEqual(new Set());
});

it("requires every capability on the same record and does not reuse a prior read", async () => {
  const id = randomUUID(),
    other = randomUUID();
  const onlyTransition = await createStaff(t.db, {
    grants: [{ capability: "case.transition", recordType: "case", recordId: id }],
  });
  const split = await createStaff(t.db, {
    grants: [
      { capability: "case.transition", recordType: "case", recordId: id },
      { capability: "case.read_internal", recordType: "case", recordId: other },
    ],
  });
  const both = await createStaff(t.db, {
    grants: [
      { capability: "case.transition", recordType: "case", recordId: id },
      { capability: "case.read_internal", recordType: "case", recordId: id },
    ],
  });
  const ids = [onlyTransition.id, split.id, both.id],
    required = ["case.transition", "case.read_internal"] as const;
  const resource = { type: "case", id, audience: "internal" } as const;
  expect(await staffWhoCan(t.db, ids, required, resource)).toEqual(new Set([both.id]));
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, both.id));
  expect(await staffWhoCan(t.db, ids, required, resource)).toEqual(new Set());
});
