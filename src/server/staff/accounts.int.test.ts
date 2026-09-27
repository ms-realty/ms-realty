import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, capabilityGrants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { can } from "../authz";
import type { AppError } from "../errors";
import { createStaffAccount, findActiveStaff, type StaffRole } from "./accounts";

// Staff bootstrap (spec §03, §23.3, AD5).
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const operator: Actor = { kind: "system", id: "cli.staff-create" };

describe("createStaffAccount", () => {
  it("creates an account with role-preset grants that authorize exactly those capabilities", async () => {
    const result = await createStaffAccount(t.db, {
      email: "publisher@example.test",
      displayName: "Test Publisher",
      roles: ["content_editor", "publishing_approver"],
      actor: operator,
    });
    expect(result).toMatchObject({
      created: true,
      addedRoles: ["content_editor", "publishing_approver"],
    });
    const staff = await findActiveStaff(t.db, "PUBLISHER@example.test");
    expect(staff?.id).toBe(result.staffAccountId);
    const actor = staff?.actor as Actor;
    expect(await can(t.db, actor, "publication.release")).toBe(true);
    expect(await can(t.db, actor, "listing.review_facts")).toBe(true);
    expect(await can(t.db, actor, "inquiry.assign")).toBe(false);
    const audit = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.recordId, result.staffAccountId));
    expect(audit.map((a) => a.action)).toEqual(["staff.create"]);
  });

  it("is idempotent by email and only adds roles not yet held", async () => {
    const input = {
      email: "broker@example.test",
      displayName: "Test Broker",
      roles: ["assigned_broker"] as StaffRole[],
      actor: operator,
    };
    const first = await createStaffAccount(t.db, input);
    const again = await createStaffAccount(t.db, { ...input, email: "Broker@Example.test" });
    expect(again).toMatchObject({
      staffAccountId: first.staffAccountId,
      created: false,
      addedRoles: [],
    });
    const more = await createStaffAccount(t.db, {
      ...input,
      roles: ["assigned_broker", "manager"],
    });
    expect(more).toMatchObject({ addedRoles: ["manager"], roles: ["assigned_broker", "manager"] });
    const grants = await t.db
      .select()
      .from(capabilityGrants)
      .where(eq(capabilityGrants.staffAccountId, first.staffAccountId));
    expect(grants.map((g) => g.role).sort()).toEqual(["assigned_broker", "manager"]);
  });

  it("rejects non-staff roles, bad input and non-human callers", async () => {
    const run = (overrides: Record<string, unknown>) =>
      createStaffAccount(t.db, {
        email: "x@example.test",
        displayName: "X",
        roles: ["manager"],
        actor: operator,
        ...overrides,
      } as Parameters<typeof createStaffAccount>[1]).then(
        () => null,
        (e: unknown) => e as AppError,
      );
    expect((await run({ roles: ["ai_service"] }))?.fieldErrors).toEqual({ roles: ["invalid"] });
    expect((await run({ email: "nope", displayName: " " }))?.fieldErrors).toEqual({
      email: ["invalid_email"],
      displayName: ["required"],
    });
    expect((await run({ actor: { kind: "ai_service", id: "hermes" } }))?.code).toBe("forbidden");
  });
});
