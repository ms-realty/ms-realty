// O24/F30: current owner identities stay reachable beyond a bounded directory page.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants, passkeys, principals, staffMemberships } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { emptyOperatingPolicy, operatingPolicyId } from "@/domain/operating-policy";
import { createSession } from "../auth/sessions";
import { createClient, createStaff } from "../testing";
import {
  listOperatingPolicyOwners,
  readOperatingPolicy,
  readOperatingPolicyOwnerChoices,
  saveOperatingPolicy,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function manager(scope: string = operatingPolicyId) {
  const person = await createStaff(t.db, {
    grants: [{ capability: "settings.manage", recordType: "settings", recordId: scope }],
  });
  await t.db.insert(passkeys).values({
    principalId: person.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}

it("pages stable name ties past 100, searches names literally and retains the exact saved owner outside page one", async () => {
  const actor = await manager(),
    marker = randomUUID();
  const earlier = [];
  for (let i = 0; i < 101; i++) {
    const row = await createStaff(t.db);
    await t.db
      .update(principals)
      .set({ displayName: `A ${marker}` })
      .where(eq(principals.id, row.id));
    earlier.push(row.id);
  }
  const owner = await createStaff(t.db);
  const name = `Z ${marker} %_`;
  await t.db.update(principals).set({ displayName: name }).where(eq(principals.id, owner.id));
  const pages = await Promise.all(
    [1, 2, 3, 4].map((page) =>
      listOperatingPolicyOwners(t.db, actor.session, { page, search: marker }),
    ),
  );
  expect(pages.map((page) => page.rows.length)).toEqual([30, 30, 30, 12]);
  expect(pages.map((page) => page.hasMore)).toEqual([true, true, true, false]);
  expect(pages.flatMap((page) => page.rows.map((row) => row.id))).toEqual([
    ...earlier.sort(),
    owner.id,
  ]);
  expect(pages[0]?.rows.some((row) => row.id === owner.id)).toBe(false);
  expect((await listOperatingPolicyOwners(t.db, actor.session, { search: "%_" })).rows).toEqual([
    { id: owner.id, displayName: name },
  ]);
  expect(await readOperatingPolicyOwnerChoices(t.db, actor.session, [owner.id])).toEqual([
    { id: owner.id, displayName: name },
  ]);
  const current = await readOperatingPolicy(t.db, actor.session);
  await saveOperatingPolicy(t.db, actor.session, {
    operationId: randomUUID(),
    expectedVersion: current.draft.version,
    document: {
      ...emptyOperatingPolicy,
      responsibilities: { ...emptyOperatingPolicy.responsibilities, service: owner.id },
    },
  });
  const saved = await readOperatingPolicy(t.db, actor.session);
  expect(saved.ownerDirectory.rows.some((row) => row.id === owner.id)).toBe(false);
  expect(saved.owners).toContainEqual({ id: owner.id, displayName: name });
});

it("excludes client, suspended and ended identities; current authority is required for pages and selected identities", async () => {
  const actor = await manager(),
    wrongScope = await manager(randomUUID());
  const ended = await createStaff(t.db, { membership: "ended" });
  const suspended = await createStaff(t.db, { status: "suspended" });
  const client = await createClient(t.db);
  const owner = await createStaff(t.db),
    marker = randomUUID();
  const ids = [ended.id, suspended.id, client.id, owner.id];
  for (const id of ids)
    await t.db.update(principals).set({ displayName: marker }).where(eq(principals.id, id));
  expect(
    (await listOperatingPolicyOwners(t.db, actor.session, { search: marker })).rows.map(
      (row) => row.id,
    ),
  ).toEqual([owner.id]);
  expect(
    (await readOperatingPolicyOwnerChoices(t.db, actor.session, ids)).map((row) => row.id),
  ).toEqual([owner.id]);
  await t.db
    .update(staffMemberships)
    .set({ state: "ended" })
    .where(eq(staffMemberships.principalId, owner.id));
  expect(await readOperatingPolicyOwnerChoices(t.db, actor.session, [owner.id])).toEqual([]);
  await expect(listOperatingPolicyOwners(t.db, wrongScope.session)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(
    readOperatingPolicyOwnerChoices(t.db, wrongScope.session, [actor.id]),
  ).rejects.toMatchObject({ code: "forbidden" });
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, actor.id));
  await expect(listOperatingPolicyOwners(t.db, actor.session)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(readOperatingPolicyOwnerChoices(t.db, actor.session, ids)).rejects.toMatchObject({
    code: "forbidden",
  });
});

it("bounds page/search/identity inputs instead of widening a malformed request", async () => {
  const actor = await manager();
  for (const page of [0, -1, 1.5, 10001, Number.NaN])
    await expect(listOperatingPolicyOwners(t.db, actor.session, { page })).rejects.toMatchObject({
      code: "validation_failed",
    });
  await expect(
    listOperatingPolicyOwners(t.db, actor.session, { search: "x".repeat(121) }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    readOperatingPolicyOwnerChoices(t.db, actor.session, ["not-a-principal"]),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    readOperatingPolicyOwnerChoices(
      t.db,
      actor.session,
      Array.from({ length: 61 }, () => randomUUID()),
    ),
  ).rejects.toMatchObject({ code: "validation_failed" });
});
