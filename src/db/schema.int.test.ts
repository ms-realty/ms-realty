import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "./schema";
import { createTestDatabase, type TestDatabase } from "./test-utils";

// All data here is fictional. The only phone number allowed in the repository is the brand line.
let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await t?.drop();
});

/** Inserts one row, reads it back by its key and checks every supplied value survived. */
async function roundTrip<T extends PgTable>(
  table: T,
  values: T["$inferInsert"],
  keyColumn = "id",
): Promise<T["$inferSelect"]> {
  const [inserted] = (await t.db
    .insert(table)
    .values(values as never)
    .returning()) as T["$inferSelect"][];
  expect(inserted).toBeDefined();
  const column = getTableColumns(table)[keyColumn];
  if (!column) throw new Error(`No column ${keyColumn}`);
  const key = (inserted as Record<string, unknown>)[keyColumn];
  const rows = (await t.db
    .select()
    .from(table as PgTable)
    .where(eq(column, key))) as T["$inferSelect"][];
  expect(rows).toEqual([inserted]);
  for (const [field, value] of Object.entries(values as Record<string, unknown>)) {
    expect((rows[0] as Record<string, unknown>)[field], field).toEqual(value);
  }
  return inserted as T["$inferSelect"];
}

const at = new Date("2026-09-24T09:00:00.000Z");
const later = new Date("2026-10-24T09:00:00.000Z");

describe("database schema (AD2)", () => {
  it("migrates a fresh database with the search extensions", async () => {
    const extensions = await t.sql<
      { extname: string }[]
    >`select extname from pg_extension order by extname`;
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(["btree_gist", "pg_trgm", "unaccent"]),
    );
    const [tables] = await t.sql<{ count: number }[]>`
      select count(*)::int as count from information_schema.tables where table_schema = 'public'`;
    expect(tables?.count).toBeGreaterThanOrEqual(60);
  });

  it("round-trips one row per aggregate", async () => {
    const person = await roundTrip(s.persons, {
      displayName: "Test Person",
      preferredLocale: "en",
    });
    const staffPerson = await roundTrip(s.persons, { displayName: "Test Broker" });
    const organization = await roundTrip(s.organizations, {
      name: "Example Services Ltd",
      country: "BG",
    });
    const staff = await roundTrip(s.staffAccounts, {
      personId: staffPerson.id,
      email: "broker@example.test",
      displayName: "Test Broker",
      staffLocale: "bg",
    });
    const client = await roundTrip(s.clientAccounts, {
      personId: person.id,
      email: "client@example.test",
      preferredLocale: "en",
    });
    await roundTrip(s.sessions, {
      tokenHash: "session-hash",
      accountKind: "staff",
      staffAccountId: staff.id,
      expiresAt: later,
    });
    await roundTrip(s.passkeys, {
      staffAccountId: staff.id,
      credentialId: "credential-1",
      publicKey: new Uint8Array([1, 2, 3]),
      signCount: 0,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
    });
    await roundTrip(s.emailSignInTokens, {
      tokenHash: "token-hash",
      purpose: "invitation",
      accountKind: "client",
      email: "client@example.test",
      invitation: { caseRef: "CS-2026-000001" },
      expiresAt: later,
    });
    await roundTrip(s.capabilityGrants, {
      staffAccountId: staff.id,
      capability: "translation.review",
      locales: ["de", "nl"],
      reason: "German and Dutch reviewer",
    });
    const email = await roundTrip(s.contactMethods, {
      personId: person.id,
      kind: "email",
      value: "client@example.test",
      normalizedValue: "client@example.test",
      verification: "verified",
      verifiedAt: at,
    });
    await roundTrip(s.contactMethods, {
      organizationId: organization.id,
      kind: "phone",
      value: "+359879696870",
      normalizedValue: "+359879696870",
    });
    await roundTrip(s.contactConsents, {
      contactMethodId: email.id,
      purpose: "search_alerts",
      state: "granted",
      source: "saved-search form v1",
    });

    const bulgaria = await roundTrip(s.geographyPlaces, {
      level: "country",
      countryCode: "BG",
      slug: "bulgaria",
      nameNative: "България",
      nameLatin: "Bulgaria",
    });
    const sandanski = await roundTrip(s.geographyPlaces, {
      level: "settlement",
      parentId: bulgaria.id,
      countryCode: "BG",
      slug: "sandanski",
      nameNative: "Сандански",
      nameLatin: "Sandanski",
      latitude: "41.566700",
      longitude: "23.283300",
    });
    const alias = await roundTrip(s.geographyPlaceAliases, {
      placeId: sandanski.id,
      kind: "transliteration",
      locale: "en",
      name: "Sándanski",
    });
    expect(alias.normalizedName).toBe("sandanski");

    const property = await roundTrip(s.properties, {
      reference: "PR-2026-000001",
      propertyType: "apartment",
      placeId: sandanski.id,
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
      publicPrecision: "settlement",
    });
    const listing = await roundTrip(s.listings, {
      reference: "MS-00100",
      propertyId: property.id,
      purpose: "sale",
      commercialState: "available",
      freshnessState: "current",
      responsibleStaffId: staff.id,
    });
    const listingVersion = await roundTrip(s.listingVersions, {
      listingId: listing.id,
      versionNumber: 1,
      contentHash: "sha256-listing-v1",
      snapshot: { price: { amountMinor: 9_500_000, currency: "EUR", period: "total" } },
      createdByStaffId: staff.id,
    });
    await roundTrip(s.facts, {
      propertyId: property.id,
      fieldKey: "feature.lift",
      state: "known",
      value: false,
      sourceClass: "agency_observed",
      observedAt: at,
    });
    await roundTrip(s.facts, {
      listingId: listing.id,
      fieldKey: "price",
      state: "withheld",
      sourceClass: "owner_confirmed",
    });
    await roundTrip(
      s.listingSearchDocuments,
      {
        listingId: listing.id,
        reference: "MS-00100",
        purpose: "sale",
        propertyType: "apartment",
        commercialState: "available",
        placeIds: [bulgaria.id, sandanski.id],
        priceState: "known",
        priceAmountMinor: 9_500_000,
        priceCurrency: "EUR",
        pricePeriod: "total",
        priceBasis: "asking",
        bedroomsState: "known",
        bedrooms: 2,
        roomsState: "known",
        rooms: 3,
        livingAreaState: "known",
        livingArea: "68.00",
        builtAreaState: "unknown",
        totalAreaState: "unknown",
        landAreaState: "not_applicable",
        features: { lift: "false" },
        searchText: "MS-00100 Сандански Sandanski апартамент",
      },
      "listingId",
    );
    const media = await roundTrip(s.mediaAssets, {
      propertyId: property.id,
      listingId: listing.id,
      r2Key: "staging/pr-2026-000001/photo-1.jpg",
      kind: "photo",
      contentType: "image/jpeg",
      byteSize: 123_456,
      sha256: "sha256-photo",
    });
    await roundTrip(
      s.listingVersionMedia,
      { listingVersionId: listingVersion.id, mediaAssetId: media.id, position: 0 },
      "listingVersionId",
    );

    const approval = await roundTrip(s.approvals, {
      kind: "owner_instruction",
      state: "approved",
      subjectType: "listing_version",
      subjectId: listingVersion.id,
      subjectVersion: 1,
      subjectHash: "sha256-listing-v1",
      requestedByKind: "staff",
      requestedById: staff.id,
      decidedByKind: "client",
      decidedById: client.id,
      decidedWithCapability: "portal.listing.approve",
      decidedAt: at,
    });

    const buyerCase = await roundTrip(s.cases, {
      reference: "CS-2026-000001",
      kind: "buyer",
      stage: "needs_agreed",
      title: "Two-bedroom apartment in Sandanski",
      ownerStaffId: staff.id,
    });
    await roundTrip(s.caseStageHistory, {
      caseId: buyerCase.id,
      toStage: "needs_agreed",
      evidence: { acknowledgedBriefId: "brief" },
      actorKind: "staff",
      actorId: staff.id,
      operationId: "op-case-1",
    });
    await roundTrip(s.partyRelationships, {
      personId: person.id,
      role: "buyer",
      caseId: buyerCase.id,
      authority: "self_declared",
      scope: { shortlist: true },
    });
    const inquiry = await roundTrip(s.inquiries, {
      reference: "RQ-2026-000001",
      state: "case_linked",
      purpose: "viewing_help",
      source: "website",
      submissionId: "submission-1",
      listingId: listing.id,
      context: { page: "P05", listingReference: "MS-00100" },
      preferredName: "Test",
      contactMethodId: email.id,
      ownerStaffId: staff.id,
      caseId: buyerCase.id,
    });
    const brief = await roundTrip(s.requirementBriefs, {
      caseId: buyerCase.id,
      criteria: { purpose: "sale", bedrooms: { min: 2 } },
      acknowledgedByStaffId: staff.id,
      acknowledgedAt: at,
    });
    await roundTrip(s.requirementBriefItems, {
      briefId: brief.id,
      kind: "hard_constraint",
      origin: "client_stated",
      text: "Step-free access",
    });
    await roundTrip(s.matches, {
      caseId: buyerCase.id,
      listingId: listing.id,
      listingVersionId: listingVersion.id,
      group: "exact",
      fitReasons: [{ criterion: "bedrooms", result: "match" }],
    });
    await roundTrip(s.tasks, {
      title: "Confirm lift access",
      type: "fact_verification",
      commitment: "client_promise",
      state: "waiting",
      ownerStaffId: staff.id,
      waitingOn: "Building manager",
      followUpAt: later,
      caseId: buyerCase.id,
      inquiryId: inquiry.id,
    });

    const shortlist = await roundTrip(s.shortlists, {
      ownerClientId: client.id,
      caseId: buyerCase.id,
      name: "Sandanski",
    });
    const item = await roundTrip(s.shortlistItems, {
      shortlistId: shortlist.id,
      listingId: listing.id,
    });
    await roundTrip(s.shortlistParticipants, {
      shortlistId: shortlist.id,
      clientAccountId: client.id,
      role: "owner",
    });
    await roundTrip(s.shortlistOpinions, {
      itemId: item.id,
      clientAccountId: client.id,
      opinion: "question",
      reason: "Is there a lift?",
    });
    await roundTrip(s.shortlistShareLinks, {
      shortlistId: shortlist.id,
      tokenHash: "share-hash",
      createdByClientId: client.id,
    });
    const savedSearch = await roundTrip(s.savedSearches, {
      clientAccountId: client.id,
      name: "Sandanski apartments",
      criteria: { purpose: "sale", placeIds: [sandanski.id] },
      criteriaSummary: "Apartments for sale in Sandanski",
    });
    await roundTrip(s.alertSubscriptions, {
      savedSearchId: savedSearch.id,
      contactMethodId: email.id,
      timezone: "Europe/Sofia",
      unsubscribeTokenHash: "unsubscribe-hash",
    });

    const appointment = await roundTrip(s.appointments, {
      reference: "AP-2026-000001",
      state: "confirmed",
      format: "in_person",
      caseId: buyerCase.id,
      listingId: listing.id,
      timezone: "Europe/Sofia",
      confirmedStartsAt: at,
      confirmedEndsAt: later,
      hostStaffId: staff.id,
      propertyAccess: "confirmed",
    });
    await roundTrip(s.appointmentVersions, {
      appointmentId: appointment.id,
      versionNumber: 1,
      snapshot: { state: "confirmed" },
      actorKind: "staff",
      actorId: staff.id,
    });
    await roundTrip(s.appointmentParticipants, {
      appointmentId: appointment.id,
      personId: person.id,
      role: "buyer",
    });
    const message = await roundTrip(s.messages, {
      kind: "external",
      direction: "outbound",
      channel: "email",
      state: "provider_accepted",
      caseId: buyerCase.id,
      authorKind: "staff",
      authorId: staff.id,
      body: "Your viewing is confirmed for 2 October.",
      recipients: ["client@example.test"],
      contentHash: "sha256-message",
      approvalId: approval.id,
      approvedContentHash: "sha256-message",
    });
    await roundTrip(s.messageDeliveries, {
      messageId: message.id,
      attempt: 1,
      recipient: "client@example.test",
      provider: "email-provider",
      idempotencyKey: "delivery-1",
      state: "provider_accepted",
      acceptedAt: at,
    });
    const document = await roundTrip(s.documents, {
      reference: "DC-2026-000001",
      caseId: buyerCase.id,
      purpose: "Proof of funds",
      classification: "financial",
      audience: "case_participants",
    });
    await roundTrip(s.documentVersions, {
      documentId: document.id,
      versionNumber: 1,
      state: "ready_for_review",
      fileName: "funds.pdf",
      contentType: "application/pdf",
      uploadedByKind: "client",
      uploadedById: client.id,
      scan: "clean",
    });
    const proposal = await roundTrip(s.proposals, {
      reference: "PP-2026-000001",
      caseId: buyerCase.id,
      listingId: listing.id,
    });
    await roundTrip(s.proposalVersions, {
      proposalId: proposal.id,
      versionNumber: 1,
      state: "draft",
      amountMinor: 9_000_000,
      currency: "EUR",
      paymentBasis: "Bank transfer at notary deed",
      parties: [person.id],
      deadlineAt: later,
      deadlineTimezone: "Europe/Sofia",
      termsHash: "sha256-terms",
    });

    const page = await roundTrip(s.contentPages, {
      kind: "area",
      slug: "sandanski",
      placeId: sandanski.id,
    });
    await roundTrip(s.contentPageVersions, {
      contentPageId: page.id,
      versionNumber: 1,
      contentHash: "sha256-page",
      body: { title: "Сандански" },
    });
    const translation = await roundTrip(s.translations, {
      subjectType: "listing",
      subjectId: listing.id,
      locale: "en",
      sourceVersion: 1,
      state: "draft",
      title: "Two-bedroom apartment",
      draftedByAi: true,
    });
    const release = await roundTrip(s.publicationReleases, {
      reference: "RL-2026-000001",
      kind: "publish",
      subjectType: "listing",
      subjectId: listing.id,
      subjectVersionNumber: 1,
      locales: ["bg"],
      confirmedByStaffId: staff.id,
      approvalId: approval.id,
      translationIds: { en: translation.id },
    });
    await roundTrip(s.publicationDestinationOutcomes, {
      releaseId: release.id,
      destination: "website",
      locale: "bg",
      state: "verified",
      verifiedAt: at,
    });

    await roundTrip(s.activityEvents, {
      recordType: "case",
      recordId: buyerCase.id,
      reference: "CS-2026-000001",
      messageKey: "activity.case.needs_agreed",
      summary: "Case CS-2026-000001 moved to Needs agreed.",
      actorKind: "staff",
      actorId: staff.id,
    });
    await roundTrip(s.auditLog, {
      action: "case.transition",
      operationId: "op-case-1",
      actorKind: "staff",
      actorId: staff.id,
      recordType: "case",
      recordId: buyerCase.id,
      payload: { from: null, to: "needs_agreed" },
    });
    await roundTrip(s.operationReceipts, {
      actorKind: "visitor",
      actorId: "submission-1",
      operationType: "inquiry.submit",
      idempotencyKey: "submission-1",
      requestHash: "sha256-request",
      status: "succeeded",
      resultType: "inquiry",
      resultId: inquiry.id,
    });

    const agreement = await roundTrip(s.serviceAgreements, {
      reference: "SA-2026-000001",
      propertyId: property.id,
      scope: { services: ["management"] },
      authority: { spendingLimitMinor: 0 },
      documentId: document.id,
    });
    const serviceRequest = await roundTrip(s.serviceRequests, {
      reference: "SR-2026-000001",
      serviceAgreementId: agreement.id,
      urgency: "soon",
      description: "Leaking tap in the kitchen",
    });
    const statement = await roundTrip(s.statements, {
      serviceAgreementId: agreement.id,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      currency: "EUR",
    });
    await roundTrip(s.statementLines, {
      statementId: statement.id,
      description: "Plumber call-out",
      state: "invoiced",
      amountMinor: 6_000,
      serviceRequestId: serviceRequest.id,
    });
    const quote = await roundTrip(s.reservationQuotes, {
      listingId: listing.id,
      versionNumber: 1,
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      guests: 2,
      currency: "EUR",
      totalMinor: 32_000,
      items: [{ label: "4 nights", amountMinor: 32_000 }],
      cancellationTerms: "Free cancellation until 7 days before arrival.",
      availabilityCheckedAt: at,
      expiresAt: later,
    });
    await roundTrip(s.reservations, {
      reference: "RS-2026-000001",
      listingId: listing.id,
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      guests: 2,
      quoteId: quote.id,
    });

    await roundTrip(s.legacyUrlDecisions, {
      domain: "makler-realty.com",
      sourcePath: "/example-listing/",
      decision: "redirect_301",
      statusCode: 301,
      targetPath: "/bg/properties/MS-00100",
      listingId: listing.id,
      listingReference: "MS-00100",
      reason: "Listing redirect approved",
      evidence: { crawlRecordId: "url-0001" },
    });
    const batch = await roundTrip(s.importBatches, {
      reference: "IM-2026-000001",
      source: "data/legacy/listings.json",
      scope: "listings",
      mode: "dry_run",
    });
    await roundTrip(s.importRows, {
      batchId: batch.id,
      rowNumber: 1,
      sourceKey: "MS-00100",
      classification: "update_proposal",
      targetType: "listing",
      targetId: listing.id,
      diff: { price: { original: null, incoming: 9_500_000 } },
    });

    const indexApproval = await roundTrip(s.approvals, {
      kind: "locale_indexability",
      state: "approved",
      subjectType: "locale",
      subjectId: listing.id,
      subjectVersion: 1,
      subjectHash: "sha256-locale-en",
      requestedByKind: "staff",
      requestedById: staff.id,
      decidedByKind: "staff",
      decidedById: staff.id,
      decidedAt: at,
    });
    await roundTrip(
      s.localeSettings,
      { locale: "en", enabled: true, indexable: true, indexableApprovalId: indexApproval.id },
      "locale",
    );
    await roundTrip(s.servicePolicies, {
      effectiveFrom: at,
      timezone: "Europe/Sofia",
      serviceHours: { mon: ["09:00", "18:00"] },
      coverage: { settlements: ["Sandanski"] },
      responsePolicy: { acknowledge: "next_business_period" },
    });
    await roundTrip(
      s.rateLimitBuckets,
      { key: "inquiry:hash", tokens: 5, expiresAt: later },
      "key",
    );
    await roundTrip(s.referenceSequences, { kind: "inquiry", year: 2026, lastValue: 1 }, "kind");
    await roundTrip(s.personAliases, {
      personId: person.id,
      formerPersonId: organization.id,
      reason: "Duplicate merged",
    });
  });

  it("optimistic concurrency: an update with a stale version affects no rows", async () => {
    const [property] = await t.db
      .insert(s.properties)
      .values({
        reference: "PR-2026-000099",
        propertyType: "house",
        country: "BG",
        region: "Blagoevgrad",
        settlement: "Melnik",
      })
      .returning();
    if (!property) throw new Error("insert failed");
    const [listing] = await t.db
      .insert(s.listings)
      .values({ reference: "MS-00199", propertyId: property.id, purpose: "sale" })
      .returning();
    if (!listing) throw new Error("insert failed");
    expect(listing.version).toBe(1);

    const update = (expectedVersion: number, state: "available" | "withdrawn") =>
      t.db
        .update(s.listings)
        .set({ commercialState: state, version: sql`${s.listings.version} + 1` })
        .where(and(eq(s.listings.id, listing.id), eq(s.listings.version, expectedVersion)))
        .returning({ version: s.listings.version });

    expect(await update(1, "available")).toEqual([{ version: 2 }]);
    // A second tab still holding version 1 loses, instead of overwriting.
    expect(await update(1, "withdrawn")).toEqual([]);
    const [current] = await t.db.select().from(s.listings).where(eq(s.listings.id, listing.id));
    expect(current?.commercialState).toBe("available");
    expect(current?.version).toBe(2);
    expect(current && current.updatedAt >= listing.updatedAt).toBe(true);
  });

  it("A18/A72: one idempotency key per actor and operation type yields one receipt", async () => {
    const receipt = {
      actorKind: "staff" as const,
      actorId: "staff-x",
      operationType: "message.send",
      idempotencyKey: "key-1",
      requestHash: "h1",
    };
    await t.db.insert(s.operationReceipts).values(receipt);
    await expect(t.db.insert(s.operationReceipts).values(receipt)).rejects.toMatchObject({
      cause: { code: "23505", constraint_name: "operation_receipts_key_idx" },
    });
    // Replays use the stored receipt instead of executing again.
    const replay = await t.db
      .insert(s.operationReceipts)
      .values(receipt)
      .onConflictDoNothing()
      .returning();
    expect(replay).toEqual([]);
    // The same key is independent for another actor or another operation type.
    await t.db.insert(s.operationReceipts).values({ ...receipt, actorId: "staff-y" });
    await t.db.insert(s.operationReceipts).values({ ...receipt, operationType: "proposal.submit" });
  });

  it("rejects updates to immutable listing versions", async () => {
    await expect(
      t.sql`update listing_versions set content_hash = 'tampered'`,
    ).rejects.toMatchObject({
      code: "23001",
    });
  });

  it("A66: a service principal cannot be granted a consequential capability", async () => {
    await expect(
      t.db.insert(s.capabilityGrants).values({
        serviceName: "hermes",
        capability: "publication.release",
        reason: "should fail",
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "capability_grants_service_drafts_only" },
    });
    await t.db
      .insert(s.capabilityGrants)
      .values({ serviceName: "hermes", role: "ai_service", reason: "Draft service" });
  });

  it("A62: overlapping capacity-holding reservations are rejected", async () => {
    const [listing] = await t.db
      .select()
      .from(s.listings)
      .where(eq(s.listings.reference, "MS-00100"));
    if (!listing) throw new Error("fixture missing");
    const base = { listingId: listing.id, guests: 2, payment: "not_required" as const };
    await t.db.insert(s.reservations).values({
      ...base,
      reference: "RS-2026-000010",
      state: "confirmed",
      checkIn: "2026-11-01",
      checkOut: "2026-11-05",
    });
    await t.db.insert(s.reservations).values({
      ...base,
      reference: "RS-2026-000011",
      state: "confirmed",
      checkIn: "2026-11-05",
      checkOut: "2026-11-07",
    });
    await expect(
      t.db.insert(s.reservations).values({
        ...base,
        reference: "RS-2026-000012",
        state: "confirmed",
        checkIn: "2026-11-04",
        checkOut: "2026-11-06",
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: "reservations_no_overlap" } });
  });

  it("state columns only accept domain state names", async () => {
    await expect(
      t.sql`insert into cases (reference, kind, stage, title) values ('CS-2026-000777', 'rental', 'needs_agreed', 'x')`,
    ).rejects.toMatchObject({ constraint_name: "cases_stage_matches_kind" });
    await expect(t.sql`update inquiries set state = 'new'`).rejects.toMatchObject({
      code: "22P02",
    });
  });
});
