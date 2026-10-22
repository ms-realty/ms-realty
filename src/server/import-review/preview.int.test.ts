import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grants, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "@/server/auth/sessions";
import { staffFixture } from "@/server/cases/testing";
import { sha256Hex } from "@/server/crypto";
import { emptyMapping } from "./csv";
import { checkImportPreview, startImportPreview } from "./preview";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const mapping = { ...emptyMapping(), reference: 0, title: 1, price: 2, currency: 3 };
async function reviewer() {
  const person = await staffFixture(t.db);
  await t.db.insert(grants).values({
    principalId: person.id,
    capability: "import.run",
    reason: "Synthetic bounded preview authority",
  });
  return person;
}
async function untouchedSnapshot() {
  return t.db.execute(
    sql`select 'listings' as source, count(*)::int as n from listings union all select 'properties',count(*)::int from properties union all select 'approvals',count(*)::int from approvals union all select 'import_batches',count(*)::int from import_batches union all select 'import_rows',count(*)::int from import_rows union all select 'publication_manifests',count(*)::int from publication_manifests union all select 'operations',count(*)::int from operations`,
  );
}
describe("W12-T1 current staff CSV review", () => {
  it("shows source problems without domain, staging, operation or publication writes", async () => {
    const person = await reviewer(),
      source =
        '\uFEFFreference,title,price,currency\r\nMS-X,"  Exact source  ",unknown,EUR\r\nMS-X,=1+1,100,EUR\r\n';
    const before = await untouchedSnapshot();
    const { preview, checked } = await t.db.transaction(async (tx) => {
      // PostgreSQL independently rejects any attempted write, including approval metadata.
      await tx.execute(sql`set transaction read only`);
      const preview = await startImportPreview(
        tx,
        person.session,
        new File([source], "C:\\fakepath\\listings.csv"),
        ",",
      );
      const checked = await checkImportPreview(tx, person.session, preview.token, mapping);
      return { preview, checked };
    });
    expect(preview.filename).toBe("listings.csv");
    expect(preview.digest).toBe(sha256Hex(source));
    expect(checked.rows[0]?.values.title).toBe("  Exact source  ");
    expect(checked.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        { code: "number", field: "price" },
        { code: "duplicate", field: "reference" },
      ]),
    );
    expect(checked.rows[1]?.values.title).toBe("=1+1");
    expect(await untouchedSnapshot()).toEqual(before);
  });
  it("rejects changed source tokens, duplicate mappings and a different principal or session", async () => {
    const person = await reviewer();
    const preview = await startImportPreview(
      t.db,
      person.session,
      new File(["reference,title,price,currency\nMS-Y,Text,100,EUR"], "listings.csv"),
      ",",
    );
    const other = await reviewer();
    const successor = await createSession(t.db, { kind: "staff", id: person.id });
    for (const session of [other.session, successor.session])
      await expect(checkImportPreview(t.db, session, preview.token, mapping)).rejects.toMatchObject(
        { code: "validation_failed" },
      );
    await expect(
      checkImportPreview(
        t.db,
        person.session,
        `${preview.token[0] === "a" ? "b" : "a"}${preview.token.slice(1)}`,
        mapping,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      checkImportPreview(t.db, person.session, preview.token, { ...mapping, title: 0 }),
    ).rejects.toMatchObject({ reason: "format" });
  });
  it("rechecks capability and session revocation on each step and refuses unsupported/invalid exports", async () => {
    const unprivileged = await staffFixture(t.db);
    const file = new File(["reference,title\nMS-Y,Text"], "listings.csv");
    await expect(startImportPreview(t.db, unprivileged.session, file, ",")).rejects.toMatchObject({
      code: "forbidden",
    });
    const person = await reviewer(),
      preview = await startImportPreview(t.db, person.session, file, ",");
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, person.id));
    await expect(
      checkImportPreview(t.db, person.session, preview.token, {
        ...emptyMapping(),
        reference: 0,
        title: 1,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const revoked = await reviewer();
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, revoked.session.id));
    await expect(startImportPreview(t.db, revoked.session, file, ",")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    const allowed = await reviewer();
    await expect(
      startImportPreview(
        t.db,
        allowed.session,
        new File(["not an xlsx parser"], "listings.xlsx"),
        ",",
      ),
    ).rejects.toMatchObject({ reason: "format" });
    await expect(
      startImportPreview(
        t.db,
        allowed.session,
        new File([new Uint8Array([0xff, 0xfe, 0xff])], "invalid.csv"),
        ",",
      ),
    ).rejects.toMatchObject({ reason: "format" });
    await expect(
      checkImportPreview(t.db, allowed.session, randomUUID(), mapping),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});
