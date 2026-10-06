import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { firstPartyIssuers } from "../domain/records";
import * as s from "./schema";
import { createTestDatabase, type TestDatabase } from "./test-utils";

// Architecture §4 records on provider-pinned PostgreSQL 16.14. All data here is fictional; the only phone number
// allowed in the repository is the brand line.
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
    if (field === "during" && typeof value === "string") {
      // tstzrange text uses the server timezone; equal instants need not have equal
      // offset strings. Test the stored interval itself in either UTC or local time.
      const [comparison] = await t.sql<{ same: boolean }[]>`
        select ${String((rows[0] as Record<string, unknown>)[field])}::tstzrange = ${value}::tstzrange as same`;
      expect(comparison?.same, field).toBe(true);
      continue;
    }
    expect((rows[0] as Record<string, unknown>)[field], field).toEqual(value);
  }
  return inserted as T["$inferSelect"];
}

const at = new Date("2026-09-24T09:00:00.000Z");
const later = new Date("2026-10-24T09:00:00.000Z");

/** Shared fixture: a staff principal, a property with a fact revision and a listing. */
async function inventory(reference: string) {
  const [party] = await t.db
    .insert(s.parties)
    .values({ kind: "person", displayName: `Broker ${reference}` })
    .returning();
  const [broker] = await t.db
    .insert(s.principals)
    .values({
      kind: "staff",
      issuer: firstPartyIssuers.staff,
      subject: `broker-${reference}`,
      partyId: party?.id as string,
      email: `broker-${reference.toLowerCase()}@example.test`,
      displayName: "Test Broker",
    })
    .returning();
  const [property] = await t.db
    .insert(s.properties)
    .values({
      reference: `PR-2026-${reference.slice(-6)}`,
      propertyType: "house",
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Melnik",
    })
    .returning();
  const [listing] = await t.db
    .insert(s.listings)
    .values({ reference, propertyId: property?.id as string, purpose: "sale" })
    .returning();
  if (!broker || !property || !listing) throw new Error("fixture insert failed");
  return { broker, property, listing };
}

describe("database schema (architecture §4)", () => {
  it("migrates a fresh database with the search and exclusion extensions", async () => {
    const extensions = await t.sql<
      { extname: string }[]
    >`select extname from pg_extension order by extname`;
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(["btree_gist", "pg_trgm", "unaccent"]),
    );
    const [version] = await t.sql<{ major: number }[]>`
      select current_setting('server_version_num')::int / 10000 as major`;
    expect(version?.major).toBe(16);
  });

  it("has no retired scope: reservations, statements, service dispatch, short stays, partner feed", async () => {
    const tables = await t.sql<{ name: string }[]>`
      select table_name as name from information_schema.tables where table_schema = 'public'`;
    const names = tables.map((r) => r.name);
    for (const retired of [
      "reservations",
      "reservation_quotes",
      "statements",
      "statement_lines",
      "service_requests",
      "shortlists",
      "matches",
    ]) {
      expect(names).not.toContain(retired);
    }
    // docs/plan.md §7 reintroduces service_agreements for the agency/client signed
    // contract and withdrawal evidence. It is independent of retired service dispatch.
    const labels = async (type: string) =>
      (
        await t.sql<{ label: string }[]>`
          select e.enumlabel as label from pg_enum e join pg_type ty on ty.oid = e.enumtypid
          where ty.typname = ${type} order by e.enumsortorder`
      ).map((r) => r.label);
    expect(await labels("listing_purpose")).toEqual(["sale", "long_term_rent"]);
    expect(await labels("price_period")).toEqual(["total", "month"]);
    expect(await labels("publication_destination")).toEqual(["website", "manual_portal"]);
    expect(await labels("capability")).not.toContain("spending.approve");
    expect(await labels("approval_kind")).not.toContain("spending");
  });

  it("round-trips one row per record", async () => {
    // Identity.
    const person = await roundTrip(s.parties, {
      kind: "person",
      displayName: "Test Person",
      preferredLocale: "en",
      contactPreferences: { channel: "email" },
      matchingAliases: ["T. Person"],
    });
    const organization = await roundTrip(s.parties, {
      kind: "organization",
      displayName: "Example Services Ltd",
      legalName: "Example Services Ltd",
      country: "BG",
    });
    const staffParty = await roundTrip(s.parties, { kind: "person", displayName: "Test Broker" });
    const staff = await roundTrip(s.principals, {
      kind: "staff",
      issuer: firstPartyIssuers.staff,
      subject: "staff-subject-1",
      partyId: staffParty.id,
      email: "broker@example.test",
      displayName: "Test Broker",
    });
    await roundTrip(s.staffMemberships, { principalId: staff.id, staffLocale: "bg" });
    const client = await roundTrip(s.principals, {
      kind: "client",
      issuer: firstPartyIssuers.client,
      subject: "client-subject-1",
      partyId: person.id,
      email: "client@example.test",
      displayName: "Test Person",
      preferredLocale: "en",
    });
    await roundTrip(s.grants, {
      principalId: staff.id,
      capability: "translation.review",
      locales: ["de", "nl"],
      reason: "German and Dutch reviewer",
    });
    await roundTrip(s.sessions, {
      tokenHash: "session-hash",
      principalKind: "staff",
      principalId: staff.id,
      expiresAt: later,
    });
    await roundTrip(s.passkeys, {
      principalId: staff.id,
      credentialId: "credential-1",
      publicKey: new Uint8Array([1, 2, 3]),
      signCount: 0,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
    });
    await roundTrip(s.webauthnChallenges, {
      challenge: "challenge-1",
      purpose: "registration",
      principalId: staff.id,
      expiresAt: later,
    });
    await roundTrip(s.emailSignInTokens, {
      tokenHash: "token-hash",
      purpose: "invitation",
      principalKind: "client",
      email: "client@example.test",
      invitation: { caseRef: "CS-2026-000001" },
      expiresAt: later,
    });

    // Contact eligibility.
    const email = await roundTrip(s.contactMethods, {
      partyId: person.id,
      kind: "email",
      value: "client@example.test",
      normalizedValue: "client@example.test",
      verification: "verified",
      verifiedAt: at,
    });
    await roundTrip(s.contactMethods, {
      partyId: organization.id,
      kind: "phone",
      value: "+359879696870",
      normalizedValue: "+359879696870",
    });
    const subscription = await roundTrip(s.subscriptions, {
      partyId: person.id,
      contactMethodId: email.id,
      purpose: "search_alerts",
      state: "active",
      verifiedAt: at,
      criteria: { purpose: "sale", placeIds: [] },
      criteriaSummary: "Apartments for sale in Sandanski",
      frequency: "daily",
      timezone: "Europe/Sofia",
      policyVersion: "privacy-2026-09",
      templateVersion: "alerts-v1",
      unsubscribeTokenHash: "unsubscribe-hash",
    });
    await roundTrip(s.consentEvents, {
      subscriptionId: subscription.id,
      kind: "opted_in",
      policyVersion: "privacy-2026-09",
      source: "saved-search form v1",
      actorKind: "client",
      actorId: client.id,
    });

    // Geography and inventory.
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
    const factRevision = await roundTrip(s.propertyFactRevisions, {
      propertyId: property.id,
      revisionNumber: 1,
      contentDigest: "sha256-facts-r1",
      materialChange: "initial",
      createdByKind: "staff",
      createdById: staff.id,
    });
    await roundTrip(s.propertyFacts, {
      factRevisionId: factRevision.id,
      fieldKey: "feature.lift",
      state: "known",
      value: false,
      sourceClass: "agency_observed",
      observedAt: at,
      reviewScope: "site visit",
      reviewedById: staff.id,
      reviewedAt: at,
    });
    await roundTrip(s.propertyFacts, {
      factRevisionId: factRevision.id,
      fieldKey: "bedrooms",
      state: "conflicting",
      value: [2, 3],
      sourceClass: "source_supplied",
      sourceLanguage: "bg",
    });
    await roundTrip(s.propertyRelationships, {
      partyId: person.id,
      propertyId: property.id,
      role: "seller",
      authority: "self_declared",
    });
    const listing = await roundTrip(s.listings, {
      reference: "MS-00100",
      propertyId: property.id,
      purpose: "sale",
      commercialState: "available",
      availabilityConfirmedAt: at,
      availabilityConfirmedById: staff.id,
      freshnessState: "current_under_policy",
      reviewDueAt: later,
      responsibleBrokerId: staff.id,
      latestRevisionNumber: 1,
    });
    const revision = await roundTrip(s.listingRevisions, {
      listingId: listing.id,
      revisionNumber: 1,
      factRevisionId: factRevision.id,
      terms: {
        facts: {
          price: {
            state: "known",
            value: { amountMinor: 9_500_000, currency: "EUR", period: "total" },
          },
        },
      },
      sourceCopy: { locale: "bg", title: "Двустаен апартамент" },
      disclosure: { publicPrecision: "settlement" },
      contentDigest: "sha256-listing-r1",
      createdByKind: "staff",
      createdById: staff.id,
    });
    const media = await roundTrip(s.mediaAssets, {
      propertyId: property.id,
      purpose: "listing_gallery",
      kind: "photo",
      originalKey: "staging/pr-2026-000001/photo-1.jpg",
      sealedKey: "sealed/0f3a",
      sha256: "sha256-photo",
      contentType: "image/jpeg",
      byteSize: 123_456,
      scan: "clean",
      processing: "ready",
      rights: "cleared",
      audience: "public_candidate",
      review: "approved",
      reviewedById: staff.id,
    });
    const relation = await roundTrip(s.mediaRelations, {
      listingId: listing.id,
      mediaAssetId: media.id,
      position: 0,
    });
    await roundTrip(
      s.listingRevisionMedia,
      {
        listingRevisionId: revision.id,
        mediaRelationId: relation.id,
        mediaAssetId: media.id,
        position: 0,
      },
      "listingRevisionId",
    );
    // Approvals, localized copy and publication.
    const editorial = await roundTrip(s.approvals, {
      kind: "editorial",
      state: "approved",
      subjectType: "listing_revision",
      subjectId: revision.id,
      subjectVersion: 1,
      subjectHash: "sha256-listing-r1",
      evidence: { preview: "exact revision" },
      requestedByKind: "staff",
      requestedById: staff.id,
      decidedByKind: "staff",
      decidedById: staff.id,
      decidedWithCapability: "listing.review_facts",
      decidedAt: at,
    });
    const language = await roundTrip(s.approvals, {
      kind: "language",
      state: "approved",
      subjectType: "localized_revision",
      subjectId: revision.id,
      subjectVersion: 1,
      subjectHash: "sha256-en-r1",
      requestedByKind: "staff",
      requestedById: staff.id,
      decidedByKind: "staff",
      decidedById: staff.id,
      decidedWithCapability: "translation.review",
      decidedAt: at,
    });
    const localized = await roundTrip(s.localizedRevisions, {
      listingId: listing.id,
      sourceRevisionId: revision.id,
      locale: "en",
      state: "approved_for_source",
      title: "Two-bedroom apartment",
      body: { description: "Apartment in Sandanski, an inland town." },
      reviewedFacts: { price: true, area: true, reference: true },
      reviewedById: staff.id,
      reviewedAt: at,
      approvalId: language.id,
    });
    const manifest = await roundTrip(s.publicationManifests, {
      listingId: listing.id,
      locale: "en",
      destination: "website",
      generation: 0,
      listingRevisionId: revision.id,
      factRevisionId: factRevision.id,
      localizedRevisionId: localized.id,
      media: [{ relationId: relation.id, assetId: media.id, position: 0 }],
      disclosure: { publicPrecision: "settlement" },
      availabilityBasis: { state: "available", confirmedAt: at.toISOString() },
      policyRevision: "policy-1",
      decisions: { editorial: editorial.id, language: language.id },
      contentDigest: "sha256-manifest",
      createdById: staff.id,
    });
    await roundTrip(s.currentPublications, {
      listingId: listing.id,
      locale: "en",
      destination: "website",
      manifestId: manifest.id,
      state: "active",
      generation: 0,
      activatedAt: at,
      activatedById: staff.id,
    });
    await roundTrip(
      s.listingSearchDocuments,
      {
        listingId: listing.id,
        locale: "en",
        manifestId: manifest.id,
        reference: "MS-00100",
        purpose: "sale",
        propertyType: "apartment",
        placeIds: [bulgaria.id, sandanski.id],
        priceState: "known",
        priceAmountMinor: 9_500_000,
        priceCurrency: "EUR",
        pricePeriod: "total",
        priceBasis: "asking",
        bedroomsState: "conflicting",
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

    const operation = await roundTrip(s.operations, {
      actorKind: "staff",
      actorId: staff.id,
      operationType: "publication.activate",
      idempotencyKey: "op-publish-1",
      requestHash: "h-publish",
      expectedRevision: 1,
      status: "succeeded",
    });
    const outbox = await roundTrip(s.outboxEvents, {
      eventType: "publication.activated",
      subjectType: "listing",
      subjectId: listing.id,
      sourceGeneration: 0,
      operationId: operation.id,
      state: "dispatched",
      dispatchJobId: "job-1",
    });
    const action = await roundTrip(s.externalActions, {
      kind: "destination_publish",
      effectKey: `publish:${manifest.id}`,
      subjectType: "publication_manifest",
      subjectId: manifest.id,
      sourceGeneration: 0,
      outboxEventId: outbox.id,
      payload: { manifestId: manifest.id },
      payloadDigest: "sha256-payload",
      state: "acknowledged",
      attempts: 1,
      provider: "website",
      firstAttemptAt: at,
      acknowledgedAt: at,
    });
    await roundTrip(s.destinationDeliveries, {
      manifestId: manifest.id,
      listingId: listing.id,
      locale: "en",
      destination: "website",
      kind: "publish",
      generation: 0,
      state: "verified",
      externalActionId: action.id,
      acknowledgedAt: at,
      verifiedAt: at,
    });
    await roundTrip(s.inboxEvents, {
      provider: "resend",
      eventId: "evt_1",
      eventType: "email.delivered",
      signatureVerified: true,
      payload: { type: "email.delivered" },
      state: "processed",
      processedAt: at,
    });
    // An active share is bound to its creator (public_shares_creator_scope): synthetic values.
    await roundTrip(s.publicShares, {
      tokenHash: "share-hash",
      viewToken: "synthetic-view-token",
      creatorSessionHash: "synthetic-creator-session-hash",
      listingReferences: ["MS-00100"],
      expiresAt: later,
    });
    const page = await roundTrip(s.contentPages, {
      kind: "guide",
      slug: "buying-in-bulgaria",
      editorialState: "approved_revision",
      currentVersionNumber: 1,
    });
    await roundTrip(s.contentPageVersions, {
      contentPageId: page.id,
      versionNumber: 1,
      contentHash: "sha256-guide",
      body: { title: "Buying in Bulgaria" },
      jurisdiction: "BG",
      reviewScope: "Process overview reviewed by a notary",
      reviewedAt: at,
      createdById: staff.id,
    });

    // Agency work.
    const buyerCase = await roundTrip(s.cases, {
      reference: "CS-2026-000001",
      kind: "buyer",
      stage: "needs_agreed",
      title: "Two-bedroom apartment in Sandanski",
      ownerId: staff.id,
      nextAction: "Send three options",
      nextActionDueAt: later,
    });
    await roundTrip(s.cases, {
      reference: "CS-2026-000002",
      kind: "service_intake",
      stage: "request_received",
      serviceTopic: "short_stay_consultation",
      title: "Short-stay consultation request",
      ownerId: staff.id,
      waitingOn: "owner availability",
      reviewAt: later,
    });
    await roundTrip(s.caseStageHistory, {
      caseId: buyerCase.id,
      toStage: "needs_agreed",
      actorKind: "staff",
      actorId: staff.id,
      operationId: "op-1",
    });
    await roundTrip(s.caseParticipants, {
      caseId: buyerCase.id,
      partyId: person.id,
      role: "buyer",
      scope: { capabilities: ["portal.case.read"] },
    });
    const brief = await roundTrip(s.briefRevisions, {
      caseId: buyerCase.id,
      revisionNumber: 1,
      items: [{ kind: "hard_constraint", origin: "client_stated", text: "Two bedrooms" }],
      criteria: { purpose: "sale", bedrooms: { min: 2 } },
      authorKind: "staff",
      authorId: staff.id,
      clientAcknowledgedAt: at,
      clientAcknowledgedById: client.id,
    });
    const inquiry = await roundTrip(s.inquiries, {
      reference: "RQ-2026-000001",
      purpose: "viewing_request",
      source: "website",
      submissionKey: "submission-abc",
      payloadDigest: "sha256-inquiry",
      receiptSessionHash: "receipt-session-hash",
      listingId: listing.id,
      listingRevisionId: revision.id,
      context: { page: "property", reference: "MS-00100" },
      contactMethodId: email.id,
      partyId: person.id,
      preferredLocale: "en",
      coverageQueue: "duty",
    });
    const interest = await roundTrip(s.interests, {
      caseId: buyerCase.id,
      listingId: listing.id,
      state: "shortlisted",
      fitExplanation: [{ criterion: "bedrooms", result: "unknown" }],
      listingRevisionId: revision.id,
    });
    await roundTrip(s.interestFeedback, {
      interestId: interest.id,
      revisionNumber: 1,
      feedback: "Likes the balcony",
      listingRevisionId: revision.id,
      authorKind: "client",
      authorId: client.id,
    });
    await roundTrip(s.tasks, {
      title: "Call back about the viewing",
      type: "follow_up",
      ownerId: staff.id,
      dueAt: later,
      dueTimezone: "Europe/Sofia",
      promisedToClient: true,
      caseId: buyerCase.id,
      inquiryId: inquiry.id,
    });
    await roundTrip(s.sellerInstructions, {
      reference: "SI-2026-000001",
      propertyId: property.id,
      listingId: listing.id,
      revisionNumber: 1,
      state: "agreed",
      commercialTerms: { price: { amountMinor: 9_500_000, currency: "EUR", period: "total" } },
      disclosure: { publicPrecision: "settlement" },
      mediaUsageRights: { granted: true },
      representationScope: "sale",
      exclusivity: "exclusive",
      commissionTerms: "3% as signed",
      publicationPermission: true,
      contentDigest: "sha256-instruction",
      evidenceDocumentIds: ["doc-1"],
      agreedAt: at,
      recordedById: staff.id,
    });

    // Scheduling, proposals, messages and documents.
    const appointment = await roundTrip(s.appointments, {
      reference: "AP-2026-000001",
      state: "confirmed",
      format: "in_person",
      caseId: buyerCase.id,
      interestId: interest.id,
      listingId: listing.id,
      propertyId: property.id,
      hostId: staff.id,
      timezone: "Europe/Sofia",
      confirmedStartsAt: at,
      confirmedEndsAt: new Date("2026-09-24T10:00:00.000Z"),
      propertyAccess: "confirmed",
      externalBusyCheckedAt: at,
      externalBusyCheckedById: staff.id,
      icsUid: "ap-2026-000001@makler-realty.com",
      icsSequence: 1,
    });
    await roundTrip(s.appointmentResources, {
      appointmentId: appointment.id,
      kind: "broker",
      resourceId: staff.id,
      during: '["2026-09-24 08:30:00+00","2026-09-24 10:30:00+00")',
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
      partyId: person.id,
      role: "buyer",
      notifiedSequence: 1,
    });
    const proposal = await roundTrip(s.proposals, {
      reference: "PP-2026-000001",
      caseId: buyerCase.id,
      interestId: interest.id,
      listingId: listing.id,
    });
    await roundTrip(s.proposalRevisions, {
      proposalId: proposal.id,
      revisionNumber: 1,
      amountMinor: 9_000_000,
      currency: "EUR",
      period: "total",
      paymentBasis: "Bank transfer at notary deed",
      parties: [{ partyId: person.id }],
      deadlineAt: later,
      deadlineTimezone: "Europe/Sofia",
      sourceListingRevisionId: revision.id,
      termsHash: "sha256-terms",
    });
    const message = await roundTrip(s.messages, {
      kind: "case_message",
      direction: "outbound",
      channel: "email",
      audience: "case_participants",
      state: "provider_accepted",
      caseId: buyerCase.id,
      authorKind: "staff",
      authorId: staff.id,
      body: "Your viewing is confirmed.",
      recipients: ["client@example.test"],
      payloadDigest: "sha256-message",
      approvalId: editorial.id,
      approvedDigest: "sha256-message",
      logicalSendId: "send-1",
    });
    await roundTrip(s.messageAttempts, {
      messageId: message.id,
      attemptNumber: 1,
      recipient: "client@example.test",
      externalActionId: action.id,
      provider: "resend",
      providerIdempotencyKey: "send-1",
      providerReference: "re_123",
      state: "provider_accepted",
      acceptedAt: at,
    });
    const document = await roundTrip(s.documents, {
      reference: "DC-2026-000001",
      caseId: buyerCase.id,
      purpose: "Proof of funds",
      classification: "financial",
      audience: "internal",
    });
    await roundTrip(s.documentVersions, {
      documentId: document.id,
      versionNumber: 1,
      state: "ready_for_review",
      stagingKey: "staging/dc-1.pdf",
      sealedKey: "sealed/dc-1",
      sha256: "sha256-doc",
      fileName: "funds.pdf",
      contentType: "application/pdf",
      uploadedByKind: "client",
      uploadedById: client.id,
      scan: "clean",
      scannedAt: at,
    });

    // Operations, privacy, evidence, legacy and settings.
    await roundTrip(s.activityEvents, {
      recordType: "case",
      recordId: buyerCase.id,
      messageKey: "activity.case.created",
      summary: "Case opened.",
      actorKind: "staff",
      actorId: staff.id,
    });
    await roundTrip(s.auditEvents, {
      action: "case.transition",
      actorKind: "staff",
      actorId: staff.id,
      payload: { toState: "needs_agreed" },
    });
    await roundTrip(s.privacyRequests, {
      reference: "PQ-2026-000001",
      kind: "export",
      state: "in_progress",
      partyId: person.id,
      contactMethodId: email.id,
      verifiedAt: at,
      verificationMethod: "email link",
      responsibleId: staff.id,
      dueAt: later,
    });
    await roundTrip(s.releaseEvidence, {
      schemaVersion: 1,
      environment: "ci",
      releaseSha: "abc123",
      digests: { web: "sha256:1" },
      policyRevision: "policy-1",
      gate: "R01",
      observedAt: at,
      source: "vitest",
      assertions: [{ id: "AT30", passed: true }],
      redactionStatus: "no_personal_data",
    });
    await roundTrip(s.legacyUrlDecisions, {
      domain: "makler-realty.com",
      sourcePath: "/property/100",
      decision: "redirect_301",
      statusCode: 301,
      targetPath: "/bg/properties/MS-00100",
      listingId: listing.id,
      listingReference: "MS-00100",
      reason: "Equivalent listing",
      evidence: { crawl: "record-1" },
    });
    const batch = await roundTrip(s.importBatches, {
      reference: "IM-2026-000001",
      source: "test",
      scope: "listings",
      mode: "dry_run",
      createdById: staff.id,
    });
    await roundTrip(s.importRows, {
      batchId: batch.id,
      rowNumber: 1,
      sourceKey: "listing:MS-00100",
      classification: "no_change",
    });
    await roundTrip(s.mergeRecords, {
      subject: "party",
      survivorId: person.id,
      mergedId: organization.id,
      reason: "Duplicate intake",
      review: { access: "no widening" },
      decidedById: staff.id,
    });
    await roundTrip(
      s.localeSettings,
      { locale: "en", enabled: true, reviewerId: staff.id },
      "locale",
    );
    const policy = await roundTrip(s.servicePolicies, {
      effectiveFrom: at,
      timezone: "Europe/Sofia",
      serviceHours: { mon: ["09:00", "18:00"] },
      coverage: { settlements: ["Sandanski"] },
      responsePolicy: { acknowledge: "next_business_period" },
      approvedById: staff.id,
    });
    // §7.1 defaults: 14 days for sale, 7 for long-term rent.
    expect(policy.availabilityReviewDays).toEqual({ sale: 14, long_term_rent: 7 });
    await roundTrip(
      s.rateLimitBuckets,
      { key: "inquiry:hash", tokens: 5, expiresAt: later },
      "key",
    );
    await roundTrip(s.referenceSequences, { kind: "inquiry", year: 2026, lastValue: 1 }, "kind");
    expect(brief.revisionNumber).toBe(1);
  });

  it("AT19: an update with a stale revision affects no rows", async () => {
    const { listing } = await inventory("MS-00199");
    expect(listing.version).toBe(1);
    const update = (expectedVersion: number, state: "negotiating" | "withdrawn") =>
      t.db
        .update(s.listings)
        .set({
          commercialState: state,
          availabilityBasis: "test",
          version: sql`${s.listings.version} + 1`,
        })
        .where(and(eq(s.listings.id, listing.id), eq(s.listings.version, expectedVersion)))
        .returning({ version: s.listings.version });

    expect(await update(1, "negotiating")).toEqual([{ version: 2 }]);
    // A second tab still holding revision 1 loses, instead of overwriting.
    expect(await update(1, "withdrawn")).toEqual([]);
    const [current] = await t.db.select().from(s.listings).where(eq(s.listings.id, listing.id));
    expect(current?.commercialState).toBe("negotiating");
    expect(current?.version).toBe(2);
  });

  it("published is not available: a listing is available only with a human confirmation", async () => {
    const { listing } = await inventory("MS-00198");
    await expect(
      t.db
        .update(s.listings)
        .set({ commercialState: "available" })
        .where(eq(s.listings.id, listing.id)),
    ).rejects.toMatchObject({ cause: { constraint_name: "listings_available_confirmed" } });
  });

  it("AT10: one idempotency key per actor and command type yields one operation", async () => {
    const operation = {
      actorKind: "staff" as const,
      actorId: "staff-x",
      operationType: "message.send",
      idempotencyKey: "key-1",
      requestHash: "h1",
    };
    await t.db.insert(s.operations).values(operation);
    await expect(t.db.insert(s.operations).values(operation)).rejects.toMatchObject({
      cause: { code: "23505", constraint_name: "operations_key_idx" },
    });
    await t.db.insert(s.operations).values({ ...operation, actorId: "staff-y" });
    await t.db.insert(s.operations).values({ ...operation, operationType: "proposal.submit" });
  });

  it("revisions, manifests and history are immutable", async () => {
    for (const table of [
      "listing_revisions",
      "property_fact_revisions",
      "property_facts",
      "publication_manifests",
      "audit_events",
      "consent_events",
      "release_evidence",
    ]) {
      await expect(t.sql.unsafe(`update ${table} set id = id`)).rejects.toMatchObject({
        code: "23001",
      });
    }
  });

  it("CurrentPublication: exactly one pointer per listing, locale and destination", async () => {
    const [pointer] = await t.db.select().from(s.currentPublications);
    if (!pointer) throw new Error("fixture missing");
    const { id: _id, version: _v, createdAt: _c, updatedAt: _u, ...copy } = pointer;
    await expect(t.db.insert(s.currentPublications).values(copy)).rejects.toMatchObject({
      cause: { constraint_name: "current_publications_pointer_idx" },
    });
    // A restriction must say why.
    await expect(
      t.db
        .update(s.currentPublications)
        .set({ state: "restricted" })
        .where(eq(s.currentPublications.id, pointer.id)),
    ).rejects.toMatchObject({ cause: { constraint_name: "current_publications_reason" } });
  });

  it("AT30: concurrent confirmations cannot overlap the same exclusive resource", async () => {
    const { broker, property } = await inventory("MS-00197");
    let n = 0;
    const appointment = async () => {
      n += 1;
      const [row] = await t.db
        .insert(s.appointments)
        .values({
          reference: `AP-2026-9${String(n).padStart(5, "0")}`,
          format: "in_person",
          timezone: "Europe/Sofia",
          propertyId: property.id,
          icsUid: `ap-at30-${n}@example.test`,
        })
        .returning();
      return row?.id as string;
    };
    const occupy = (
      appointmentId: string,
      during: string,
      kind: "broker" | "property_access" = "broker",
    ) =>
      t.db.insert(s.appointmentResources).values({
        appointmentId,
        kind,
        resourceId: kind === "broker" ? broker.id : property.id,
        during,
      });

    // Two confirmations race for overlapping intervals of the same broker: exactly one wins.
    const [a, b] = [await appointment(), await appointment()];
    const results = await Promise.allSettled([
      t.db.transaction((tx) =>
        tx.insert(s.appointmentResources).values({
          appointmentId: a,
          kind: "broker",
          resourceId: broker.id,
          during: '["2026-10-02 08:00+00","2026-10-02 09:30+00")',
        }),
      ),
      t.db.transaction((tx) =>
        tx.insert(s.appointmentResources).values({
          appointmentId: b,
          kind: "broker",
          resourceId: broker.id,
          during: '["2026-10-02 09:00+00","2026-10-02 10:00+00")',
        }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      cause: { constraint_name: "appointment_resources_no_overlap" },
    });

    // Back-to-back intervals, another resource kind, and a released interval do not conflict.
    const c = await appointment();
    await occupy(c, '["2026-10-02 10:00+00","2026-10-02 11:00+00")');
    await occupy(c, '["2026-10-02 08:00+00","2026-10-02 09:30+00")', "property_access");
    await t.db
      .update(s.appointmentResources)
      .set({ active: false, releasedAt: new Date() })
      .where(eq(s.appointmentResources.appointmentId, c));
    const d = await appointment();
    await occupy(d, '["2026-10-02 10:30+00","2026-10-02 11:30+00")');
  });

  it("AT52: a service principal cannot be granted a consequential capability", async () => {
    await expect(
      t.db.insert(s.grants).values({
        serviceName: "hermes",
        capability: "publication.release",
        reason: "should fail",
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: "grants_service_drafts_only" } });
    await t.db
      .insert(s.grants)
      .values({ serviceName: "hermes", role: "ai_service", reason: "Draft service" });
  });

  it("owns every inquiry and case: coverage queue or broker, next action or dated wait", async () => {
    await expect(
      t.sql`insert into inquiries (reference, purpose, source, submission_key, payload_digest)
            values ('RQ-2026-000777', 'question', 'website', 'k-777', 'd')`,
    ).rejects.toMatchObject({ constraint_name: "inquiries_owned" });
    const { broker } = await inventory("MS-00196");
    await expect(
      t.db.insert(s.cases).values({
        reference: "CS-2026-000778",
        kind: "buyer",
        stage: "needs_agreed",
        title: "Unowned next step",
        ownerId: broker.id,
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: "cases_active_owned" } });
  });

  it("state columns only accept the kind's pipeline and domain state names", async () => {
    await expect(
      t.sql`insert into cases (reference, kind, stage, title, disposition, disposition_reason, closure_outcome, commitment_dispositions)
            values ('CS-2026-000777', 'tenant', 'marketing', 'x', 'closed', 'r', 'o', '{}')`,
    ).rejects.toMatchObject({ constraint_name: "cases_stage_matches_kind" });
    await expect(
      t.sql`insert into cases (reference, kind, stage, title, disposition, disposition_reason, closure_outcome, commitment_dispositions)
            values ('CS-2026-000779', 'service_intake', 'request_received', 'x', 'closed', 'r', 'o', '{}')`,
    ).rejects.toMatchObject({ constraint_name: "cases_service_topic" });
    await expect(t.sql`update inquiries set state = 'new'`).rejects.toMatchObject({
      code: "22P02",
    });
  });
});
