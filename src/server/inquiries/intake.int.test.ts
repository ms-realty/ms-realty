import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  auditLog,
  contactConsents,
  contactMethods,
  inquiries,
  outboxMessages,
  persons,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { POST } from "../../../app/api/inquiries/route";
import { AppError } from "../errors";
import { createListingFixture, defaultConfirm, publishForTest } from "../listings/testing";
import { createStaff } from "../testing";
import { getInquiryReceipt, type InquiryInput, submitInquiry } from "./intake";

// P11/P12 inquiry intake and receipt (spec F06, §19.4, A16-A19).
let t: TestDatabase;
let live: string;
let unpublished: string;
let broker: { id: string; email: string };
beforeAll(async () => {
  t = await createTestDatabase();
  const publisher = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  broker = await createStaff(t.db, { roles: ["assigned_broker"] });
  await createStaff(t.db, { roles: ["assigned_broker"], status: "suspended" });
  const fixture = await createListingFixture(t.db);
  await publishForTest(t.db, publisher.actor, fixture.reference, defaultConfirm);
  live = fixture.reference;
  unpublished = (await createListingFixture(t.db)).reference;
});
afterAll(async () => {
  // The route handler opened the app pool on this test database; dropping it ends those
  // connections, and the next getDb() must not reuse the pool.
  delete (globalThis as { __msRealtyDb?: unknown }).__msRealtyDb;
  await t?.drop();
});

let counter = 0;
const operationId = () => `op-${Date.now()}-${String(++counter).padStart(6, "0")}`;
let ipCounter = 0;
const ip = () => `198.51.100.${++ipCounter}`;

const question = (overrides: Partial<InquiryInput> = {}): InquiryInput => ({
  operationId: operationId(),
  topic: "question",
  name: "Test Visitor",
  contact: { route: "email", value: "Visitor.One@Example.test" },
  message: "Is there a lift?",
  responseLocale: "en",
  listingReference: live,
  factKey: "feature.lift",
  consent: { privacyNotice: true },
  ...overrides,
});

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("submitInquiry", () => {
  it("accepts a question and returns a durable receipt with its reference and next steps", async () => {
    const receipt = await submitInquiry(t.db, question(), { ip: ip() });
    expect(receipt).toMatchObject({
      topic: "question",
      status: "received",
      listing: { reference: live, slug: live.toLowerCase(), titleLocale: "bg" },
      factKey: "feature.lift",
      contact: { route: "email", masked: "v•••@example.test" },
      responseLocale: "en",
      nextSteps: ["team_reviews_request", "reply_by_email", "keep_reference"],
      replayed: false,
    });
    expect(receipt.reference).toMatch(/^RQ-\d{4}-\d{6}$/);
    expect(receipt.receiptToken).toMatch(/^[0-9a-f]{64}$/);

    const [row] = await t.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.reference, receipt.reference));
    expect(row).toMatchObject({
      state: "received",
      purpose: "question",
      source: "website",
      preferredName: "Test Visitor",
      marketingOptIn: false,
      ownerStaffId: null,
    });
    const consents = await t.db
      .select()
      .from(contactConsents)
      .where(eq(contactConsents.contactMethodId, row?.contactMethodId ?? ""));
    expect(consents.map((c) => [c.purpose, c.state])).toEqual([["service_updates", "granted"]]);
    const activity = await t.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.recordId, row?.id ?? ""));
    expect(activity).toHaveLength(1);
    expect(activity[0]?.summary).not.toContain("Visitor");
    const audit = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.recordId, row?.id ?? ""));
    expect(JSON.stringify(audit)).not.toContain("example.test");

    // One staff notification per active inquiry owner, without the visitor's details.
    const notes = await t.db
      .select()
      .from(outboxMessages)
      .where(eq(outboxMessages.template, "staff.inquiry_received"));
    const forThis = notes.filter(
      (n) => (n.params as { inquiryReference?: string }).inquiryReference === receipt.reference,
    );
    expect(forThis.map((n) => n.recipient)).toEqual([broker.email]);
    expect(JSON.stringify(forThis)).not.toMatch(/visitor|lift/i);
  });

  it("A18: the same operation id converges on the same receipt; a changed body is refused", async () => {
    const input = question({
      contact: { route: "phone", value: "+359 88 123 4567" },
      topic: "callback",
    });
    const first = await submitInquiry(t.db, input, { ip: ip() });
    const retry = await submitInquiry(t.db, input, { ip: ip() });
    expect(retry).toEqual({ ...first, replayed: true });
    const rows = await t.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.submissionId, input.operationId));
    expect(rows).toHaveLength(1);
    expect(first.contact).toEqual({ route: "phone", masked: "+359•••567" });
    expect(first.nextSteps).toContain("call_back");

    const changed = await rejection(
      submitInquiry(t.db, { ...input, message: "Changed" }, { ip: ip() }),
    );
    expect(changed.code).toBe("idempotency_key_reused");
  });

  it("links a known contact route to its person without saying so", async () => {
    const value = "repeat.visitor@example.test";
    const a = await submitInquiry(t.db, question({ contact: { route: "email", value } }), {
      ip: ip(),
    });
    const b = await submitInquiry(
      t.db,
      question({ contact: { route: "email", value: value.toUpperCase() } }),
      {
        ip: ip(),
      },
    );
    const {
      receiptToken: _a,
      reference: _ra,
      acceptedAt: _ta,
      operationReceiptId: _oa,
      ...shapeA
    } = a;
    const {
      receiptToken: _b,
      reference: _rb,
      acceptedAt: _tb,
      operationReceiptId: _ob,
      ...shapeB
    } = b;
    expect(shapeB).toEqual(shapeA);
    const methods = await t.db
      .select()
      .from(contactMethods)
      .where(eq(contactMethods.normalizedValue, value));
    expect(methods).toHaveLength(1);
    const linked = await t.db
      .select({ personId: inquiries.personId })
      .from(inquiries)
      .where(eq(inquiries.contactMethodId, methods[0]?.id ?? ""));
    expect(new Set(linked.map((l) => l.personId)).size).toBe(1);
    expect(
      await t.db
        .select()
        .from(persons)
        .where(eq(persons.id, linked[0]?.personId ?? "")),
    ).toHaveLength(1);
  });

  it("returns field errors and keeps nothing for invalid input", async () => {
    const error = await rejection(
      submitInquiry(
        t.db,
        {
          operationId: "short",
          topic: "callback",
          contact: { route: "email", value: "not-an-email" },
          responseLocale: "xx",
          listingReference: "RQ-2026-000001",
          consent: { privacyNotice: false },
        },
        { ip: ip() },
      ),
    );
    expect(error.code).toBe("validation_failed");
    expect(error.fieldErrors).toMatchObject({
      operationId: ["invalid_operation_id"],
      responseLocale: ["required"],
      "consent.privacyNotice": ["required"],
    });
    const phone = await rejection(
      submitInquiry(t.db, question({ contact: { route: "phone", value: "0888 123 456" } }), {
        ip: ip(),
      }),
    );
    expect(phone.fieldErrors).toEqual({ "contact.value": ["phone_international_format"] });
    const callback = await rejection(
      submitInquiry(t.db, question({ topic: "callback", name: "" }), { ip: ip() }),
    );
    expect(callback.fieldErrors).toEqual({
      "contact.route": ["phone_required_for_callback"],
      name: ["required"],
    });
    const notLive = await rejection(
      submitInquiry(t.db, question({ listingReference: unpublished }), { ip: ip() }),
    );
    expect(notLive.fieldErrors).toEqual({ listingReference: ["not_found"] });
  });

  it("records marketing consent only when opted in", async () => {
    const receipt = await submitInquiry(
      t.db,
      question({
        contact: { route: "email", value: "optin@example.test" },
        consent: { privacyNotice: true, marketing: true },
      }),
      { ip: ip() },
    );
    const [row] = await t.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.reference, receipt.reference));
    expect(row?.marketingOptIn).toBe(true);
    const consents = await t.db
      .select()
      .from(contactConsents)
      .where(eq(contactConsents.contactMethodId, row?.contactMethodId ?? ""));
    expect(consents.map((c) => c.purpose).sort()).toEqual(["marketing", "service_updates"]);
  });

  it("rate-limits new submissions per client IP but never a retry", async () => {
    const address = ip();
    const inputs = Array.from({ length: 6 }, () => question({ listingReference: undefined }));
    for (const input of inputs.slice(0, 5)) await submitInquiry(t.db, input, { ip: address });
    const limited = await rejection(
      submitInquiry(t.db, inputs[5] as InquiryInput, { ip: address }),
    );
    expect(limited.code).toBe("rate_limited");
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    const retry = await submitInquiry(t.db, inputs[0] as InquiryInput, { ip: address });
    expect(retry.replayed).toBe(true);
  });
});

describe("getInquiryReceipt", () => {
  it("reads the receipt back with its token; anything else is not_found", async () => {
    const receipt = await submitInquiry(t.db, question(), { ip: ip() });
    const found = await getInquiryReceipt(t.db, {
      reference: receipt.reference,
      token: receipt.receiptToken,
    });
    const { operationReceiptId: _o, replayed: _r, ...expected } = receipt;
    expect(found).toEqual({ status: "found", receipt: expected });
    expect(
      await getInquiryReceipt(t.db, {
        reference: receipt.reference,
        token: receipt.receiptToken.replace(/.$/, "0"),
      }),
    ).toEqual({ status: "not_found" });
    expect(await getInquiryReceipt(t.db, { reference: receipt.reference, token: "" })).toEqual({
      status: "not_found",
    });
    expect(
      await getInquiryReceipt(t.db, { reference: "RQ-2099-000001", token: receipt.receiptToken }),
    ).toEqual({
      status: "not_found",
    });
  });
});

describe("POST /api/inquiries", () => {
  const origin = "http://localhost:3000";
  const call = (body: string, headers: Record<string, string>) =>
    POST(new Request(`${origin}/api/inquiries`, { method: "POST", body, headers }), undefined);

  it("rejects cross-site requests and malformed JSON with the §19.2 error body", async () => {
    process.env.DATABASE_URL = t.url;
    const crossSite = await call(JSON.stringify(question()), { origin: "https://evil.example" });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({
      error: { code: "cross_origin_request", outcome: "not_applied" },
    });
    const malformed = await call("{", { origin });
    expect(malformed.status).toBe(422);
    expect(await malformed.json()).toMatchObject({
      error: { code: "validation_failed", fieldErrors: { form: ["invalid_json"] } },
    });
  });

  it("returns 201 with the receipt, then 200 with the same receipt for a retry", async () => {
    process.env.DATABASE_URL = t.url;
    const body = JSON.stringify(question());
    const headers = { origin, "content-type": "application/json", "cf-connecting-ip": ip() };
    const created = await call(body, headers);
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { receipt } = await created.json();
    const again = await call(body, headers);
    expect(again.status).toBe(200);
    expect((await again.json()).receipt).toEqual({ ...receipt, replayed: true });
  });
});
