// C18/O26 · AT43/AT45/UX23. Disposable database, synthetic people and no real files/providers.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withRequestDatabase } from "@/db/request-scope";
import {
  auditEvents,
  contactMethods,
  grants,
  inquiries,
  messages,
  operations,
  parties,
  passkeys,
  principals,
  privacyExports,
  privacyRequests,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { sessionCookieName } from "../auth/cookies";
import { createSession } from "../auth/sessions";
import { getEnv } from "../config/env";
import { sha256Hex } from "../crypto";
import { createClient, createStaff } from "../testing";
import { privacyExportGet } from "./export-route";
import {
  clientPrivacyExports,
  issuePrivacyExport,
  preparePrivacyExport,
  privacyExportDownload,
  privacyExportOperationStatus,
  redactPrivacyExport,
  revokePrivacyExport,
  staffPrivacyExports,
} from "./exports";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

let t: TestDatabase;
let operator: Awaited<ReturnType<typeof staff>>;
async function staff() {
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
async function client() {
  const person = await createClient(t.db);
  return { ...person, ...(await createSession(t.db, { kind: "client", id: person.id })) };
}
function review(id: string, expectedVersion: number, to: string) {
  return {
    operationId: randomUUID(),
    id,
    expectedVersion,
    to,
    responsibleId: operator.id,
    policyReference: "Synthetic policy reference, disposable tests only",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    identityReviewed: true,
    legalHoldReason: "Synthetic hold disposition only",
    legalHoldDisposition: "Reviewed synthetic retention boundary",
    holdResolved: true,
    completionEvidence: "Free text alone must not complete exports",
    rejectionReason: "Synthetic test rejection",
    confirmed: true,
  };
}
async function fixture() {
  const person = await client();
  const submitted = await submitPrivacyRequest(t.db, person.session, {
    operationId: randomUUID(),
    kind: "export",
    description: "Synthetic request for my own data; full review remains open",
    confirmed: true,
  });
  const requestId = submitted.outcome.id;
  await reviewPrivacyRequest(t.db, operator.session, review(requestId, 1, "verifying"));
  await reviewPrivacyRequest(t.db, operator.session, review(requestId, 2, "in_progress"));
  const prepare = {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    recipientId: person.id,
    confirmed: true,
  };
  return { person, requestId, prepare };
}
async function prepared(input?: Awaited<ReturnType<typeof fixture>>) {
  const f = input ?? (await fixture());
  const result = await preparePrivacyExport(t.db, operator.session, f.prepare);
  const issue = {
    operationId: randomUUID(),
    requestId: f.requestId,
    expectedVersion: 3,
    exportId: result.outcome.id,
    exportVersion: 1,
    digest: result.outcome.sha256,
    expiresMinutes: 60,
    omitTexts: [],
    reviewed: true,
    partialAcknowledged: true,
  };
  return { ...f, result, issue };
}
async function issued(input?: Awaited<ReturnType<typeof prepared>>) {
  const f = input ?? (await prepared());
  const delivery = await issuePrivacyExport(t.db, operator.session, f.issue);
  return { ...f, delivery };
}
async function read(
  f: Awaited<ReturnType<typeof issued>>,
  token = f.person.token,
  range?: string,
  context: "client" | "public" | "staff" = "client",
) {
  const env = getEnv(),
    host = new URL(env.hosts[context]).host;
  return withRequestDatabase(t.db, () =>
    privacyExportGet(
      new Request(`${env.hosts[context]}/bg/privacy/exports/${f.result.outcome.id}`, {
        headers: {
          host,
          cookie: `${sessionCookieName(env, "client")}=${token}`,
          ...(range ? { range } : {}),
        },
      }),
      { params: Promise.resolve({ locale: "bg", id: f.result.outcome.id }) },
    ),
  );
}
beforeAll(async () => {
  t = await createTestDatabase();
  operator = await staff();
});
afterAll(async () => {
  await t?.drop();
});

describe("AT45 actual scoped privacy dossier and exact review", () => {
  it("collects genuine own activity, excludes other-party joins/secrets, redacts selected own text and keeps fulfilment partial", async () => {
    const f = await fixture(),
      other = await client();
    const [contact] = await t.db
      .insert(contactMethods)
      .values({
        partyId: f.person.partyId,
        kind: "email",
        value: f.person.email,
        normalizedValue: f.person.email,
      })
      .returning();
    expect(contact).toBeDefined();
    await t.db.insert(inquiries).values([
      {
        reference: `RQ-${randomUUID()}`,
        purpose: "question",
        source: "website",
        coverageQueue: "synthetic-test-queue",
        submissionKey: randomUUID(),
        payloadDigest: "fixture",
        partyId: f.person.partyId,
        message: "Own submitted request text",
      },
      {
        reference: `RQ-${randomUUID()}`,
        purpose: "question",
        source: "website",
        coverageQueue: "synthetic-test-queue",
        submissionKey: randomUUID(),
        payloadDigest: "fixture",
        partyId: other.partyId,
        message: "OTHER-PARTY-PRIVATE-CANARY",
      },
    ]);
    const [message] = await t.db
      .insert(messages)
      .values({
        kind: "case_message",
        direction: "inbound",
        channel: "in_app",
        audience: "case_participants",
        authorKind: "client",
        authorId: f.person.id,
        body: "Own message with text selected for disclosure redaction",
        payloadDigest: "fixture",
        recipients: [{ private: "OTHER-PARTY-PRIVATE-CANARY" }],
        attachments: [{ private: "OTHER-PARTY-PRIVATE-CANARY" }],
      })
      .returning();
    await t.db.insert(messages).values({
      kind: "case_message",
      direction: "inbound",
      channel: "in_app",
      audience: "case_participants",
      authorKind: "client",
      authorId: other.id,
      body: "OTHER-PARTY-PRIVATE-CANARY",
      payloadDigest: "fixture",
    });
    const p = await prepared(f),
      work = await staffPrivacyExports(t.db, operator.session, f.requestId);
    const draft = JSON.stringify(work.exports[0]?.dossier);
    expect(draft).toContain("Own submitted request text");
    expect(draft).toContain("Own message with text");
    expect(draft).not.toContain("OTHER-PARTY-PRIVATE-CANARY");
    expect(draft).not.toContain(f.person.token);
    expect(draft).not.toContain("receiptSessionHash");
    const removal = {
      ...p.issue,
      operationId: randomUUID(),
      omitTexts: [{ section: "messages", id: message?.id }],
    };
    const saved = await redactPrivacyExport(t.db, operator.session, removal);
    expect((await redactPrivacyExport(t.db, operator.session, removal)).replayed).toBe(true);
    expect(saved.outcome.sha256).not.toBe(p.issue.digest);
    await expect(issuePrivacyExport(t.db, operator.session, p.issue)).rejects.toMatchObject({
      code: "version_conflict",
    });
    const input = {
      ...p.issue,
      operationId: randomUUID(),
      exportVersion: 2,
      digest: saved.outcome.sha256,
    };
    await expect(
      issuePrivacyExport(t.db, operator.session, { ...input, expiresMinutes: 0 }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    const current = await staffPrivacyExports(t.db, operator.session, f.requestId);
    expect(current.exports[0]?.dossier?.data.messages[0]?.text).toContain("[redacted");
    expect(current.exports[0]?.sha256).toBe(saved.outcome.sha256);
    const delivery = await issuePrivacyExport(t.db, operator.session, input);
    expect(delivery.outcome.sha256).toBe(saved.outcome.sha256);
    const replay = await issuePrivacyExport(t.db, operator.session, input);
    expect(replay.replayed).toBe(true);
    expect(replay.outcome).toEqual(delivery.outcome);
    const bytes = await privacyExportDownload(t.db, f.person.session, p.result.outcome.id);
    const dossier = JSON.parse(bytes.bytes.toString());
    expect(dossier.data.messages[0].text).toContain("[redacted");
    expect(sha256Hex(bytes.bytes.toString("utf8"))).toBe(saved.outcome.sha256);
    expect(dossier.data.inquiries[0].text).toBe("Own submitted request text");
    expect(dossier.fulfilment).toBe("partial");
    expect(dossier.omissions.map((x: { category: string }) => x.category)).toContain(
      "private_files",
    );
    const [row] = await t.db
      .select()
      .from(privacyExports)
      .where(eq(privacyExports.id, p.result.outcome.id));
    expect(row?.encryptedPayload).not.toContain(f.person.email);
    expect(row?.encryptedPayload).not.toContain("Own submitted request");
    const [request] = await t.db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, f.requestId));
    expect(request?.state).toBe("in_progress");
    await expect(
      reviewPrivacyRequest(t.db, operator.session, review(f.requestId, 3, "completed")),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const receipts = await t.db
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.operationType, "privacy.export.issue"),
          eq(operations.idempotencyKey, input.operationId),
        ),
      );
    expect(receipts).toHaveLength(1);
    expect(JSON.stringify(receipts)).not.toContain("Own submitted request text");
    const audits = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.operationId, delivery.operationId));
    expect(JSON.stringify(audits)).not.toContain("Own submitted request text");
    expect(
      await privacyExportOperationStatus(t.db, operator.session, f.requestId, input.operationId),
    ).toBe("succeeded");
  });

  it("requires verified in-progress requests, current grants and exact source/revision/recipient", async () => {
    const f = await fixture(),
      other = await client(),
      noGrant = await createStaff(t.db),
      noGrantSession = await createSession(t.db, { kind: "staff", id: noGrant.id });
    await expect(
      preparePrivacyExport(t.db, noGrantSession.session, f.prepare),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      preparePrivacyExport(t.db, operator.session, {
        ...f.prepare,
        operationId: randomUUID(),
        recipientId: other.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      preparePrivacyExport(t.db, operator.session, {
        ...f.prepare,
        operationId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const p = await prepared(f);
    await t.db
      .update(parties)
      .set({ displayName: "Changed own fixture name" })
      .where(eq(parties.id, f.person.partyId));
    await expect(issuePrivacyExport(t.db, operator.session, p.issue)).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(await clientPrivacyExports(t.db, f.person.session, f.requestId)).toEqual([]);
    await expect(
      issuePrivacyExport(t.db, operator.session, {
        ...p.issue,
        operationId: randomUUID(),
        digest: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("replays preparation exactly once and refuses keys reused for a different scope", async () => {
    const f = await fixture(),
      first = await preparePrivacyExport(t.db, operator.session, f.prepare);
    expect((await preparePrivacyExport(t.db, operator.session, f.prepare)).outcome).toEqual(
      first.outcome,
    );
    expect(
      await t.db.select().from(privacyExports).where(eq(privacyExports.requestId, f.requestId)),
    ).toHaveLength(1);
    await expect(
      preparePrivacyExport(t.db, operator.session, { ...f.prepare, expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
});

describe("AT43 fresh private full and range delivery", () => {
  it("returns authenticated no-store full/range bytes, blocks other hosts and wrong people before range parsing", async () => {
    const f = await issued(),
      other = await client();
    const full = await read(f);
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    expect(full.headers.get("content-disposition")).toContain("attachment");
    const text = await full.text();
    const range = await read(f, f.person.token, "bytes=0-11");
    expect(range.status).toBe(206);
    expect(await range.text()).toBe(text.slice(0, 12));
    expect((await read(f, f.person.token, "bytes=9999999-")).status).toBe(416);
    const wrong = await read(f, other.token, "bytes=0-0");
    expect(wrong.status).toBe(404);
    expect(wrong.headers.has("content-range")).toBe(false);
    expect((await read(f, f.person.token, undefined, "public")).status).toBe(404);
    expect((await read(f, f.person.token, undefined, "staff")).status).toBe(404);
    await expect(clientPrivacyExports(t.db, other.session, f.requestId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("denies stale/revoked sessions and a different account even for the same party", async () => {
    const f = await issued(),
      second = await client();
    await t.db
      .update(principals)
      .set({ partyId: f.person.partyId })
      .where(eq(principals.id, second.id));
    expect((await read(f, second.token, "bytes=0-0")).status).toBe(404);
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600000) })
      .where(eq(sessions.id, f.person.session.id));
    expect((await read(f)).status).toBe(401);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, f.person.session.id));
    expect((await read(f)).status).toBe(401);
  });

  it("denies expired/revoked deliveries and current legal hold or changed request, without restricted identities", async () => {
    const expired = await issued();
    await t.db
      .update(privacyExports)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(privacyExports.id, expired.result.outcome.id));
    expect((await read(expired, expired.person.token, "bytes=0-0")).status).toBe(404);
    const revoked = await issued();
    const command = {
      operationId: randomUUID(),
      requestId: revoked.requestId,
      exportId: revoked.result.outcome.id,
      exportVersion: 2,
      confirmed: true,
    };
    await revokePrivacyExport(t.db, operator.session, command);
    expect((await revokePrivacyExport(t.db, operator.session, command)).replayed).toBe(true);
    expect((await read(revoked, revoked.person.token, "bytes=0-0")).status).toBe(404);
    const held = await issued();
    await reviewPrivacyRequest(t.db, operator.session, review(held.requestId, 3, "on_legal_hold"));
    const denial = await read(held);
    expect(denial.status).toBe(404);
    expect(await denial.text()).not.toContain("Synthetic hold disposition");
    await reviewPrivacyRequest(t.db, operator.session, review(held.requestId, 4, "in_progress"));
    expect((await read(held)).status).toBe(404);
  });

  it("refuses issue after operator grant revocation and ciphertext substitution", async () => {
    const ownOperator = await staff(),
      f = await fixture();
    const preparedResult = await preparePrivacyExport(t.db, ownOperator.session, f.prepare);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, ownOperator.id));
    await expect(
      issuePrivacyExport(t.db, ownOperator.session, {
        operationId: randomUUID(),
        requestId: f.requestId,
        expectedVersion: 3,
        exportId: preparedResult.outcome.id,
        exportVersion: 1,
        digest: preparedResult.outcome.sha256,
        expiresMinutes: 60,
        reviewed: true,
        partialAcknowledged: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const a = await issued(),
      b = await issued();
    const [otherPayload] = await t.db
      .select()
      .from(privacyExports)
      .where(eq(privacyExports.id, b.result.outcome.id));
    await t.db
      .update(privacyExports)
      .set({ encryptedPayload: otherPayload?.encryptedPayload })
      .where(eq(privacyExports.id, a.result.outcome.id));
    expect((await read(a)).status).toBe(404);
  });
});
