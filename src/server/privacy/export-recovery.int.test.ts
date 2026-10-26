// C18/O26 · AT45/UX23: an uncommitted command cannot become confirmed absence.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grants, operations, passkeys, privacyExports, privacyRequests } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient, createStaff } from "../testing";
import { preparePrivacyExport, privacyExportOperationStatus } from "./exports";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function operator() {
  const person = await createStaff(t.db, { grants: [{ capability: "privacy.manage" }] });
  await t.db.insert(passkeys).values({
    principalId: person.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}

describe("AT45 privacy export operation recovery", () => {
  it("keeps an uncommitted preparation unknown, then reconciles its exact key once with current actor authority", async () => {
    const staff = await operator(),
      other = await operator(),
      client = await createClient(t.db);
    const [request] = await t.db
      .insert(privacyRequests)
      .values({
        reference: `PX-${randomUUID()}`,
        kind: "export",
        state: "in_progress",
        partyId: client.partyId,
        responsibleId: staff.id,
        verifiedAt: new Date(),
        dueAt: new Date(Date.now() + 86400000),
        scope: {
          description: "Synthetic recovery fixture",
          policyReference: "Synthetic policy only",
        },
      })
      .returning();
    if (!request) throw new Error("Missing synthetic export request");
    const input = {
      operationId: randomUUID(),
      requestId: request.id,
      expectedVersion: request.version,
      recipientId: client.id,
      confirmed: true,
    };
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
    const committing = t.db.transaction(async (tx) => {
      const result = await preparePrivacyExport(tx, staff.session, input);
      acquired();
      await held;
      return result;
    });
    await ready;
    try {
      expect(
        await t.db
          .select()
          .from(operations)
          .where(eq(operations.idempotencyKey, input.operationId)),
      ).toEqual([]);
      expect(
        await privacyExportOperationStatus(t.db, staff.session, request.id, input.operationId),
      ).toBe("unknown");
      expect(
        await privacyExportOperationStatus(t.db, other.session, request.id, input.operationId),
      ).toBe("absent");
    } finally {
      release();
      await committing;
    }
    expect(
      await privacyExportOperationStatus(t.db, staff.session, request.id, input.operationId),
    ).toBe("succeeded");
    expect((await preparePrivacyExport(t.db, staff.session, input)).replayed).toBe(true);
    expect(
      await t.db.select().from(privacyExports).where(eq(privacyExports.requestId, request.id)),
    ).toHaveLength(1);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, staff.id));
    await expect(
      privacyExportOperationStatus(t.db, staff.session, request.id, input.operationId),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
