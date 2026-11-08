import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { approvals, contentPageVersions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { publishSyntheticScope } from "@/server/service-intake/testing";
import { readPublicContentPages } from "./public-pages";
import { createCmsIndexabilityFixture } from "./testing/cms-fixture";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
}, 60000);
afterAll(async () => {
  await t?.drop();
});

it("R09/AT27 derives native CMS paths from current exact approvals and generic services from live offerings", async () => {
  expect(await readPublicContentPages(t.db)).toEqual([]);
  const fixture = await createCmsIndexabilityFixture(t.db);
  const nativePaths = ["/contact", "/help/contact", "/let", "/sell"];
  const genericPath = `/services/${fixture.service.source.slug}`;
  const initial = await readPublicContentPages(t.db);
  expect(initial.map((page) => page.path).sort()).toEqual([...nativePaths, genericPath].sort());
  expect(initial.every((page) => page.locale === "bg")).toBe(true);

  const offered = fixture.service.document.decisions.find(
    (decision) => decision.state === "offered",
  );
  if (offered?.state !== "offered") throw new Error("Synthetic offering missing");
  for (const slug of ["sell", "let"]) {
    const native = fixture.native.find((page) => page.slug === slug);
    if (!native) throw new Error("Synthetic native CMS page missing");
    const source = {
      kind: "service" as const,
      slug,
      versionId: native.content.version.id,
      contentHash: native.content.version.contentHash,
    };
    await publishSyntheticScope(t.db, fixture.service.session, {
      kind: "bounded_service_scope_v1",
      decisions: [{ ...offered, publicSource: source, termsSource: source }],
    });
    expect((await readPublicContentPages(t.db)).map((page) => page.path).sort()).toEqual(
      [...nativePaths, `/services/${slug}`].sort(),
    );
  }

  const ids = fixture.native.map((page) => page.content.version.id);
  const exactVersions = await t.db
    .select()
    .from(contentPageVersions)
    .where(inArray(contentPageVersions.id, ids));
  await t.db
    .update(approvals)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(inArray(approvals.subjectId, ids));
  expect(await readPublicContentPages(t.db)).toEqual([]);
  expect(
    await t.db.select().from(contentPageVersions).where(inArray(contentPageVersions.id, ids)),
  ).toEqual(exactVersions);
});
