import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  documents,
  documentVersions,
  mediaAssets,
  propertyRelationships,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { loadPublishedListings } from "../publication/presentation";
import {
  createListingFixture,
  publicationFixtureStorage,
  publishForTest,
} from "../publication/testing";
import { createStaff } from "../testing";
import { publicMediaDownload } from "./download";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it.each([
  "instruction_expired",
  "authority_revoked",
  "authority_document_replaced",
  "agreement_document_replaced",
  "agreement_review_withdrawn",
  "media_permission_withdrawn",
] as const)("stops public bytes as well as listing reads when %s", async (change) => {
  const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  const fixture = await createListingFixture(t.db, { reviewerId: staff.id });
  await publishForTest(t.db, staff.actor, fixture);
  const [instruction] = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.listingId, fixture.listingId));
  const assetId = fixture.assetIds[0];
  if (!assetId) throw new Error("Missing image fixture");
  const [asset] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
  if (!instruction || !asset?.derivativeSha256) throw new Error("Missing consent fixture");
  const terms = instruction.commercialTerms as {
    authorityRelationshipId: string;
    agreement: { documentVersionId: string };
  };
  const digest = asset.derivativeSha256;
  const read = () => publicMediaDownload(t.db, publicationFixtureStorage, asset.id, digest);
  expect((await read()).bytes.byteLength).toBeGreaterThan(0);
  expect(await loadPublishedListings(t.db, { ids: [fixture.listingId] }, "bg")).toHaveLength(1);

  if (change === "instruction_expired") {
    await t.db
      .update(sellerInstructions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sellerInstructions.id, instruction.id));
  } else if (change === "authority_revoked") {
    await t.db
      .update(propertyRelationships)
      .set({ revokedAt: new Date() })
      .where(eq(propertyRelationships.id, terms.authorityRelationshipId));
  } else if (change === "authority_document_replaced") {
    const [authority] = await t.db
      .select()
      .from(propertyRelationships)
      .where(eq(propertyRelationships.id, terms.authorityRelationshipId));
    if (!authority) throw new Error("Missing authority relationship");
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(
        eq(
          documentVersions.id,
          (authority.scope as { documentVersionId: string }).documentVersionId,
        ),
      );
    if (!file) throw new Error("Missing authority file");
    await t.db
      .update(documents)
      .set({ currentVersionNumber: 2 })
      .where(eq(documents.id, file.documentId));
  } else if (change === "agreement_document_replaced") {
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, terms.agreement.documentVersionId));
    if (!file) throw new Error("Missing agreement file");
    await t.db
      .update(documents)
      .set({ currentVersionNumber: 2 })
      .where(eq(documents.id, file.documentId));
  } else if (change === "agreement_review_withdrawn") {
    await t.db
      .update(documentVersions)
      .set({ reviewType: "needs_replacement", state: "needs_replacement" })
      .where(eq(documentVersions.id, terms.agreement.documentVersionId));
  } else {
    await t.db
      .update(sellerInstructions)
      .set({ mediaUsageRights: { granted: false } })
      .where(eq(sellerInstructions.id, instruction.id));
  }
  await expect(read()).rejects.toMatchObject({ code: "not_found" });
  expect(await loadPublishedListings(t.db, { ids: [fixture.listingId] }, "bg")).toEqual([]);
});
