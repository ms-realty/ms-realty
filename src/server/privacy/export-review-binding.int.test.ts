// C18/O26 · AT45: the private review and its digest are an inseparable database binding.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { privacyExports, privacyRequests } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createClient, createStaff } from "../testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("AT45 private export review binding", () => {
  it("rejects incomplete or malformed private review bindings while allowing an absent or complete pair", async () => {
    const client = await createClient(t.db),
      staff = await createStaff(t.db);
    const [request] = await t.db
      .insert(privacyRequests)
      .values({ reference: `PX-${randomUUID()}`, kind: "export", partyId: client.partyId })
      .returning();
    if (!request) throw new Error("Missing synthetic export request");
    const binding = {
      requestId: request.id,
      requestVersion: request.version,
      partyId: client.partyId,
      recipientId: client.id,
      preparedById: staff.id,
      encryptedPayload: "synthetic-encrypted-payload",
      sha256: "a".repeat(64),
      byteSize: 1,
    };
    for (const review of [
      { encryptedReview: "synthetic-encrypted-review", reviewSha256: null },
      { encryptedReview: null, reviewSha256: "b".repeat(64) },
      { encryptedReview: "synthetic-encrypted-review", reviewSha256: "invalid-digest" },
    ])
      await expect(
        t.db.insert(privacyExports).values({ ...binding, ...review }),
      ).rejects.toMatchObject({
        cause: { code: "23514", constraint_name: "privacy_exports_review_binding" },
      });
    for (const review of [
      { encryptedReview: null, reviewSha256: null },
      { encryptedReview: "synthetic-encrypted-review", reviewSha256: "b".repeat(64) },
    ]) {
      const rows = await t.db
        .insert(privacyExports)
        .values({ ...binding, ...review })
        .returning({ id: privacyExports.id });
      expect(rows).toHaveLength(1);
    }
  });
});
