import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor, Capability } from "@/domain/capabilities";
import { assertCanRead, can, grantsFor } from "./authz";
import {
  createCase,
  createClient,
  createProperty,
  createStaff,
  grantService,
  relate,
} from "./testing";

// Spec §03 role matrix, enforced on the server (AD5). A66: the AI service drafts only.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const expectCan = async (actor: Actor, capability: Capability, resource = {}) =>
  expect(await can(t.db, actor, capability, { type: "case", ...resource })).toBe(true);
const expectCannot = async (actor: Actor, capability: Capability, resource = {}) =>
  expect(await can(t.db, actor, capability, { type: "case", ...resource })).toBe(false);

describe("§03 roles", () => {
  it("visitor: submits own inquiry, reads nothing private", async () => {
    const visitor: Actor = { kind: "visitor", id: "submission-1" };
    expect(await can(t.db, visitor, "inquiry.submit")).toBe(true);
    await expectCannot(visitor, "portal.case.read");
    await expectCannot(visitor, "case.read");
    await expectCannot(visitor, "document.read_restricted");
  });

  it("verified client: their invited cases only, never internal notes", async () => {
    const client = await createClient(t.db);
    const own = await createCase(t.db);
    const other = await createCase(t.db);
    await relate(t.db, { personId: client.personId, role: "buyer", caseId: own });
    await expectCan(client.actor, "portal.case.read", { id: own });
    await expectCan(client.actor, "portal.message.write", { id: own });
    // A document inside the case is covered through its parent case.
    expect(
      await can(t.db, client.actor, "portal.case.read", { type: "document", id: own, caseId: own }),
    ).toBe(true);
    await expectCannot(client.actor, "portal.case.read", { id: other });
    await expectCannot(client.actor, "case.read_internal", { id: own });
    await expectCannot(client.actor, "document.read_restricted", { id: own });
    // A buyer never approves a listing preview.
    await expectCannot(client.actor, "portal.listing.approve", { id: own });
  });

  it("verified client: an unauthorized private read behaves as not found", async () => {
    const client = await createClient(t.db);
    const other = await createCase(t.db);
    await expect(
      assertCanRead(t.db, client.actor, "portal.case.read", { type: "case", id: other }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("seller: listing approval only with reviewed authority (A29)", async () => {
    const reviewer = await createStaff(t.db, { roles: ["assigned_broker"] });
    const declared = await createClient(t.db);
    const reviewed = await createClient(t.db);
    const property = await createProperty(t.db);
    await relate(t.db, {
      personId: declared.personId,
      role: "seller",
      propertyId: property,
      authority: "self_declared",
    });
    await relate(t.db, {
      personId: reviewed.personId,
      role: "seller",
      propertyId: property,
      authority: "reviewed",
      reviewedBy: reviewer.id,
    });
    const listingOfProperty = { type: "listing", id: property, propertyId: property };
    expect(await can(t.db, declared.actor, "portal.listing.approve", listingOfProperty)).toBe(
      false,
    );
    expect(await can(t.db, reviewed.actor, "portal.listing.approve", listingOfProperty)).toBe(true);
  });

  it("property relationships reach the property and its listing, never other parties' records", async () => {
    const tenant = await createClient(t.db);
    const seller = await createClient(t.db);
    const property = await createProperty(t.db);
    const landlordCase = await createCase(t.db);
    const buyerCase = await createCase(t.db);
    await relate(t.db, { personId: tenant.personId, role: "tenant", propertyId: property });
    await relate(t.db, { personId: seller.personId, role: "seller", propertyId: property });
    expect(
      await can(t.db, tenant.actor, "portal.case.read", {
        type: "listing",
        id: crypto.randomUUID(),
        propertyId: property,
      }),
    ).toBe(true);
    // Cases and documents that merely name the property belong to their own parties (§03).
    for (const actor of [tenant.actor, seller.actor]) {
      for (const capability of ["portal.case.read", "portal.proposal.respond"] as const) {
        expect(
          await can(t.db, actor, capability, { type: "case", id: buyerCase, propertyId: property }),
        ).toBe(false);
      }
      expect(
        await can(t.db, actor, "portal.document.upload", {
          type: "document",
          id: crypto.randomUUID(),
          caseId: landlordCase,
          propertyId: property,
        }),
      ).toBe(false);
    }
  });

  it("internal records stay closed to clients inside their own case", async () => {
    const client = await createClient(t.db);
    const caseId = await createCase(t.db);
    await relate(t.db, { personId: client.personId, role: "buyer", caseId });
    const document = { type: "document", id: crypto.randomUUID(), caseId };
    expect(await can(t.db, client.actor, "portal.case.read", document)).toBe(true);
    expect(
      await can(t.db, client.actor, "portal.case.read", { ...document, audience: "internal" }),
    ).toBe(false);
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    expect(
      await can(t.db, broker.actor, "case.read_internal", { ...document, audience: "internal" }),
    ).toBe(true);
  });

  it("an adviser or guest gets the invitation, not the principal's authority (§01, §03)", async () => {
    const caseId = await createCase(t.db);
    for (const role of ["adviser", "guest"] as const) {
      const party = await createClient(t.db);
      await relate(t.db, {
        personId: party.personId,
        role,
        caseId,
        // An invitation cannot hand over the principal's proposal response.
        scope: { capabilities: ["portal.proposal.respond", "portal.message.write"] },
      });
      await expectCan(party.actor, "portal.case.read", { id: caseId });
      await expectCan(party.actor, "portal.message.write", { id: caseId });
      await expectCannot(party.actor, "portal.proposal.respond", { id: caseId });
      await expectCannot(party.actor, "portal.document.upload", { id: caseId });
    }
    // A co-buyer is a principal in their own right.
    const coBuyer = await createClient(t.db);
    await relate(t.db, { personId: coBuyer.personId, role: "co_buyer", caseId });
    await expectCan(coBuyer.actor, "portal.proposal.respond", { id: caseId });
  });

  it("revoked and expired relationships grant nothing; suspended clients get nothing", async () => {
    const client = await createClient(t.db);
    const revokedCase = await createCase(t.db);
    const expiredCase = await createCase(t.db);
    await relate(t.db, {
      personId: client.personId,
      role: "buyer",
      caseId: revokedCase,
      revokedAt: new Date(),
    });
    await relate(t.db, {
      personId: client.personId,
      role: "buyer",
      caseId: expiredCase,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expectCannot(client.actor, "portal.case.read", { id: revokedCase });
    await expectCannot(client.actor, "portal.case.read", { id: expiredCase });

    const suspended = await createClient(t.db, { status: "suspended" });
    const caseId = await createCase(t.db);
    await relate(t.db, { personId: suspended.personId, role: "buyer", caseId });
    await expectCannot(suspended.actor, "portal.case.read", { id: caseId });
  });

  it("invited collaborator: exactly the invited resources and portal actions", async () => {
    const collaborator = await createClient(t.db);
    const caseId = await createCase(t.db);
    const shortlistId = crypto.randomUUID();
    await relate(t.db, {
      personId: collaborator.personId,
      role: "collaborator",
      caseId,
      scope: {
        resources: [{ type: "shortlist", id: shortlistId }],
        // Non-portal capabilities in an invitation are ignored.
        capabilities: ["portal.message.write", "document.read_restricted", "access.grant"],
      },
    });
    const shortlist = { type: "shortlist", id: shortlistId };
    expect(await can(t.db, collaborator.actor, "portal.shortlist.manage", shortlist)).toBe(true);
    expect(await can(t.db, collaborator.actor, "portal.message.write", shortlist)).toBe(true);
    expect(await can(t.db, collaborator.actor, "document.read_restricted", shortlist)).toBe(false);
    expect(await can(t.db, collaborator.actor, "access.grant", shortlist)).toBe(false);
    // Not the whole household: the case itself and its documents stay closed.
    await expectCannot(collaborator.actor, "portal.case.read", { id: caseId });
    await expectCannot(collaborator.actor, "portal.document.upload", { id: caseId });
  });

  it("external specialist: time-limited, shared case only", async () => {
    const specialist = await createClient(t.db);
    const shared = await createCase(t.db);
    const unlimited = await createCase(t.db);
    await relate(t.db, {
      personId: specialist.personId,
      role: "specialist",
      caseId: shared,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // Specialist access without an expiry is not honoured.
    await relate(t.db, { personId: specialist.personId, role: "specialist", caseId: unlimited });
    await expectCan(specialist.actor, "portal.document.upload", { id: shared });
    await expectCannot(specialist.actor, "portal.message.write", { id: shared });
    await expectCannot(specialist.actor, "portal.case.read", { id: unlimited });
    await expectCannot(specialist.actor, "portal.case.read", { id: await createCase(t.db) });
  });

  it("assigned broker: works cases but cannot publish, review legal claims or grant access", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await expectCan(broker.actor, "case.transition");
    await expectCan(broker.actor, "message.send_external");
    await expectCan(broker.actor, "document.read_restricted");
    await expectCannot(broker.actor, "publication.release");
    await expectCannot(broker.actor, "claim.approve");
    await expectCannot(broker.actor, "access.grant");
    await expectCannot(broker.actor, "spending.approve");
  });

  it("assigned broker narrowed to one case by a record-scoped role grant", async () => {
    const caseId = await createCase(t.db);
    const broker = await createStaff(t.db, {
      grants: [{ role: "assigned_broker", recordType: "case", recordId: caseId }],
    });
    await expectCan(broker.actor, "case.read", { id: caseId });
    await expectCannot(broker.actor, "case.read", { id: await createCase(t.db) });
  });

  it("coordinator: schedules without reading confidential documents", async () => {
    const coordinator = await createStaff(t.db, { roles: ["coordinator"] });
    await expectCan(coordinator.actor, "appointment.manage");
    await expectCannot(coordinator.actor, "document.read_restricted");
    await expectCannot(coordinator.actor, "case.read_internal");
    await expectCannot(coordinator.actor, "message.send_external");
  });

  it("content editor: edits and drafts, cannot release publication", async () => {
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    await expectCan(editor.actor, "listing.edit");
    await expectCan(editor.actor, "translation.draft");
    await expectCannot(editor.actor, "publication.release");
    await expectCannot(editor.actor, "translation.review");
  });

  it("translation reviewer: reviews only the assigned locale, never commercial facts", async () => {
    const reviewer = await createStaff(t.db, {
      grants: [
        { capability: "translation.review", locales: ["de"] },
        { capability: "listing.read" },
      ],
    });
    const translation = (locale: "de" | "ru") => ({ type: "translation", id: "t", locale });
    expect(await can(t.db, reviewer.actor, "translation.review", translation("de"))).toBe(true);
    expect(await can(t.db, reviewer.actor, "translation.review", translation("ru"))).toBe(false);
    expect(await can(t.db, reviewer.actor, "listing.edit", translation("de"))).toBe(false);
    expect(await can(t.db, reviewer.actor, "claim.approve", translation("de"))).toBe(false);
  });

  it("publishing approver: releases, but language approval is not factual approval", async () => {
    const approver = await createStaff(t.db, { roles: ["publishing_approver"] });
    await expectCan(approver.actor, "publication.release");
    await expectCan(approver.actor, "listing.review_facts");
    await expectCannot(approver.actor, "translation.review");
    await expectCannot(approver.actor, "claim.approve");
  });

  it("manager: allocates, reports, grants access; no publishing without the capability", async () => {
    const manager = await createStaff(t.db, { roles: ["manager"] });
    await expectCan(manager.actor, "inquiry.assign");
    await expectCan(manager.actor, "report.read");
    await expectCan(manager.actor, "access.grant");
    await expectCan(manager.actor, "audit.read");
    await expectCannot(manager.actor, "publication.release");
    await expectCannot(manager.actor, "claim.approve");
  });

  it("staff grants lapse on expiry, revocation or suspension", async () => {
    const expired = await createStaff(t.db, {
      grants: [{ role: "manager", expiresAt: new Date(Date.now() - 1000) }],
    });
    await expectCannot(expired.actor, "report.read");
    const suspended = await createStaff(t.db, { roles: ["manager"], status: "suspended" });
    await expectCannot(suspended.actor, "report.read");
  });

  it("claim.approve comes only from an individual grant, never a preset", async () => {
    const qualified = await createStaff(t.db, { grants: [{ capability: "claim.approve" }] });
    await expectCan(qualified.actor, "claim.approve");
  });
});

describe("system jobs", () => {
  it("hold only their own job's capabilities; unknown jobs hold nothing", async () => {
    const release: Actor = { kind: "system", id: "publication-release" };
    await expectCan(release, "publication.release", { type: "listing" });
    await expectCannot(release, "listing.edit", { type: "listing" });
    await expectCannot({ kind: "system", id: "legacy-import" }, "publication.release", {
      type: "listing",
    });
  });
});

describe("ai_service (A66)", () => {
  it("drafts, and never publishes, indexes, sends or approves", async () => {
    await grantService(t.db, "hermes", { role: "ai_service" });
    const hermes: Actor = { kind: "ai_service", id: "hermes" };
    for (const capability of ["ai.draft", "translation.draft", "message.draft"] as const) {
      await expectCan(hermes, capability);
    }
    for (const capability of [
      "publication.release",
      "translation.review",
      "message.send_external",
      "claim.approve",
      "access.grant",
      "listing.edit",
      "case.transition",
    ] as const) {
      await expectCannot(hermes, capability);
    }
  });

  it("the database refuses a consequential grant to a service principal", async () => {
    await expect(
      grantService(t.db, "hermes", { capability: "publication.release" }),
    ).rejects.toThrow();
    await expect(grantService(t.db, "hermes", { role: "manager" })).rejects.toThrow();
  });

  it("presented grants cannot confer authority on the AI service", async () => {
    const hermes: Actor = { kind: "ai_service", id: "hermes" };
    const grants = await grantsFor(t.db, hermes, { type: "listing", id: "x" });
    expect(grants.map((g) => g.capability).sort()).toEqual(
      ["ai.draft", "message.draft", "translation.draft"].sort(),
    );
  });
});
