// Readiness is permissioned operational detail (architecture §19.3 "Operations"; AT40, AT67).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createClient, createStaff } from "../testing";
import { readReadiness } from "./readiness";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const input = { buildSha: null, snapshot: null };

describe("readiness authorization", () => {
  it("answers staff holding report.read", async () => {
    const manager = await createStaff(t.db, { roles: ["manager"] });
    const status = await readReadiness(t.db, manager.actor, input);
    expect(status.verdict).toBe("blocked");
  });

  it("refuses staff without report.read, suspended memberships, clients and anonymous", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await expect(readReadiness(t.db, broker.actor, input)).rejects.toMatchObject({
      code: "forbidden",
    });
    const suspended = await createStaff(t.db, { roles: ["manager"], membership: "suspended" });
    await expect(readReadiness(t.db, suspended.actor, input)).rejects.toMatchObject({
      code: "forbidden",
    });
    const client = await createClient(t.db);
    await expect(readReadiness(t.db, client.actor, input)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(readReadiness(t.db, null, input)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
