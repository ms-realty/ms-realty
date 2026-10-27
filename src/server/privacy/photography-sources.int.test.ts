// B10/O26 · AT45: exact photo purpose and scope, no ownership inference or raw snapshots.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appointments, appointmentVersions, propertyRelationships } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { LocalFileStorage } from "../files/storage";
import { createStaff } from "../testing";
import { collectExportInventory } from "./export-coverage";
import {
  coverageEnvelope,
  exportCoverageRow,
  issueCoverage,
  privacyExportCoverageFixture,
  resolveCoverage,
} from "./export-coverage-testing";
import { completePrivacyExport, privacyExportDownload } from "./exports";
import { syntheticPhotographySource } from "./photography-source-testing";
import { appointmentSourceRevision, collectPhotographySources } from "./photography-sources";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-photo-source-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture(linked = true) {
  let photography!: Awaited<ReturnType<typeof syntheticPhotographySource>>;
  const f = await privacyExportCoverageFixture(
    t.db,
    storage,
    "listed_categories",
    async (source) => {
      photography = await syntheticPhotographySource(
        t.db,
        source.staff.id,
        linked ? (source.client.partyId as string) : undefined,
      );
    },
  );
  return { ...f, photography };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const collected = (f: Fixture, actor = f.staff.actor) =>
  collectPhotographySources(t.db, actor, [f.client.partyId as string], [f.record.id]);
async function completion(f: Fixture) {
  const row = await exportCoverageRow(t.db, f.exportId);
  return { ...(await coverageEnvelope(f)), reviewDigest: row.reviewSha256, confirmed: true };
}
describe("B10/AT45 photography source classification", () => {
  it("accounts for an explicitly linked photo request through a reviewed redacted supplement, without disclosing logistics", async () => {
    const f = await fixture(),
      source = await collected(f);
    expect(source.blocked).toBe(false);
    expect(source.sources).toHaveLength(1);
    const inventory = await collectExportInventory(
      t.db,
      f.staff.actor,
      {
        partyId: f.client.partyId as string,
        recipientId: f.client.id,
        requestId: f.requestId,
        requestVersion: 3,
        scope: { exportScope: "listed_categories" },
      },
      "synthetic-own-source",
    );
    expect(
      inventory.categories
        .find((row) => row.category === "joint_records_and_received_communications")
        ?.sources.filter((row) => row.kind === "appointment_bundle"),
    ).toHaveLength(1);
    await resolveCoverage(f);
    await issueCoverage(f);
    await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
    const delivered = await privacyExportDownload(t.db, f.client.session, f.exportId);
    for (const value of [
      f.photography.appointment.photographyScope,
      f.photography.version?.id,
      f.photography.property,
      f.staff.id,
    ]) {
      expect(delivered.bytes.toString()).not.toContain(value);
      expect(JSON.stringify(source)).not.toContain(value);
    }
  });

  it("does not infer a customer source from a property relationship or the staff host", async () => {
    const f = await fixture(false);
    await t.db
      .insert(propertyRelationships)
      .values({ propertyId: f.photography.property, partyId: f.client.partyId, role: "seller" });
    const source = await collected(f);
    expect(source.blocked).toBe(false);
    expect(source.sources).toEqual([]);
    expect(JSON.stringify(source)).not.toContain(f.photography.appointment.id);
    const unlinked = await collectPhotographySources(t.db, f.staff.actor, [randomUUID()], []);
    expect(unlinked.sources).toEqual([]);
  });

  it.each(["scope", "purpose", "version"] as const)(
    "stales reviewed and frozen exports after an unversioned photo %s change",
    async (change) => {
      for (const issued of [false, true]) {
        const f = await fixture();
        await resolveCoverage(f);
        if (issued) await issueCoverage(f);
        if (change === "scope")
          await t.db
            .update(appointments)
            .set({
              photographyScope: "SYNTHETIC_CHANGED_PHOTOGRAPHY_SCOPE",
              updatedAt: f.photography.appointment.updatedAt,
            })
            .where(eq(appointments.id, f.photography.appointment.id));
        if (change === "purpose")
          await t.db
            .update(appointments)
            .set({ purpose: "viewing", updatedAt: f.photography.appointment.updatedAt })
            .where(eq(appointments.id, f.photography.appointment.id));
        if (change === "version")
          await t.db.insert(appointmentVersions).values({
            appointmentId: f.photography.appointment.id,
            versionNumber: 2,
            actorKind: "staff",
            actorId: f.staff.id,
            snapshot: {
              ...f.photography.snapshot,
              photographyScope: "SYNTHETIC_NEW_RETAINED_PHOTO_SCOPE",
            },
          });
        expect(
          (
            await t.db
              .select()
              .from(appointments)
              .where(eq(appointments.id, f.photography.appointment.id))
          )[0]?.version,
        ).toBe(f.photography.appointment.version);
        if (!issued)
          await expect(issueCoverage(f)).rejects.toMatchObject({ code: "version_conflict" });
        else {
          await expect(
            completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
          ).rejects.toMatchObject({ code: "version_conflict" });
          await expect(
            privacyExportDownload(t.db, f.client.session, f.exportId),
          ).rejects.toMatchObject({ code: "not_found" });
        }
      }
    },
  );

  it("holds an unknown historical purpose and preserves original property/appointment access", async () => {
    const f = await fixture(),
      noInventoryScope = await createStaff(t.db);
    expect(
      await appointmentSourceRevision(t.db, noInventoryScope.actor, f.photography.appointment.id),
    ).toBeNull();
    await t.db.insert(appointmentVersions).values({
      appointmentId: f.photography.appointment.id,
      versionNumber: 2,
      actorKind: "staff",
      actorId: f.staff.id,
      snapshot: { state: "requested", photographyScope: "SYNTHETIC_UNKNOWN_PHOTO_PURPOSE" },
    });
    const source = await collected(f);
    expect(source.blocked).toBe(true);
    expect(source.sources).toEqual([]);
    expect(JSON.stringify(source)).not.toContain(f.photography.appointment.id);
    const inventory = await collectExportInventory(
      t.db,
      f.staff.actor,
      {
        partyId: f.client.partyId as string,
        recipientId: f.client.id,
        requestId: f.requestId,
        requestVersion: 3,
        scope: { exportScope: "listed_categories" },
      },
      "synthetic-own-source",
    );
    expect(
      inventory.categories.find(
        (row) => row.category === "joint_records_and_received_communications",
      ),
    ).toMatchObject({ blocked: true, sources: [] });
  });
});
