import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { externalActions, inquiries, outboxEvents } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { GET as readReceiptRoute } from "../../../app/api/inquiries/[submission]/route";
import { GET as issueRoute, POST } from "../../../app/api/inquiries/route";
import { getEnv } from "../config/env";
import { AppError } from "../errors";
import { loadPublishedListings } from "../publication/presentation";
import {
  createListingFixture,
  createPlaces,
  type ListingFixture,
  publishForTest,
} from "../publication/testing";
import { createStaff } from "../testing";
import {
  type InquiryInput,
  inquiryCoverageQueue,
  issueSubmissionKey,
  newReceiptSession,
  readInquiryReceipt,
  submitInquiry,
} from "./intake";

// P11/P12 inquiry intake and receipt (architecture §6.1; AT10–AT12).
let t: TestDatabase;
let live: ListingFixture;
let unpublished: ListingFixture;
beforeAll(async () => {
  t = await createTestDatabase();
  const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  const places = await createPlaces(t.db);
  live = await createListingFixture(t.db, { reviewerId: staff.id, placeId: places.settlementId });
  await publishForTest(t.db, staff.actor, live);
  unpublished = await createListingFixture(t.db, { reviewerId: staff.id });
});
afterAll(async () => {
  // The route handlers opened the app pool on this test database; dropping it ends those
  // connections, and the next getDb() must not reuse the pool.
  delete (globalThis as { __msRealtyDb?: unknown }).__msRealtyDb;
  await t?.drop();
});

let ipCounter = 0;
const ip = () => `198.51.100.${++ipCounter}`;

const question = (overrides: Partial<InquiryInput> = {}): InquiryInput => ({
  submissionKey: issueSubmissionKey(),
  purpose: "question",
  locale: "bg",
  name: "Test Visitor",
  contact: { kind: "email", value: "Visitor.One@Example.test" },
  message: "Is there a lift?",
  listingReference: live.reference,
  privacyNotice: true,
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

const inquiriesFor = (key: string) =>
  t.db.select().from(inquiries).where(eq(inquiries.submissionKey, key));

describe("submitInquiry", () => {
  it("AT27: rejects an outdated observed manifest without accepting intent and records the canonical source on a fresh request", async () => {
    const stale = question({ observedManifestId: randomUUID() });
    const error = await rejection(
      submitInquiry(t.db, stale, { ip: ip(), receiptSession: newReceiptSession() }),
    );
    expect(error).toMatchObject({
      code: "version_conflict",
      current: { reason: "listing_changed" },
    });
    expect(await inquiriesFor(stale.submissionKey)).toEqual([]);
    const [published] = await loadPublishedListings(t.db, { references: [live.reference] }, "bg");
    const reviewed = question({ observedManifestId: published?.manifestId });
    await submitInquiry(t.db, reviewed, { ip: ip(), receiptSession: newReceiptSession() });
    const [row] = await inquiriesFor(reviewed.submissionKey);
    expect(row?.context).toMatchObject({
      listing: {
        manifestId: published?.manifestId,
        sourceUrl: `${getEnv().canonicalOrigin}/bg/properties/${live.reference}/${live.reference.toLowerCase()}`,
      },
    });
  });

  it("AT10: a retried or double-tapped submission yields one Inquiry and one receipt", async () => {
    const input = question();
    const session = newReceiptSession();
    const context = () => ({ ip: ip(), receiptSession: session });
    const taps = await Promise.allSettled([
      submitInquiry(t.db, input, context()),
      submitInquiry(t.db, input, context()),
    ]);
    const accepted = taps.flatMap((tap) => (tap.status === "fulfilled" ? [tap.value] : []));
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    for (const tap of taps) {
      // A tap that lost the race is told the same submission is still in flight.
      if (tap.status === "rejected")
        expect(tap.reason).toMatchObject({ code: "operation_pending" });
    }
    const retried = await submitInquiry(t.db, input, context());
    expect(retried.replayed).toBe(true);
    expect(retried.receipt).toEqual(accepted[0]?.receipt);
    expect(await inquiriesFor(input.submissionKey)).toHaveLength(1);
    expect(retried.receipt).toMatchObject({
      receiptId: input.submissionKey,
      status: "accepted",
      purpose: "question",
      listingReference: live.reference,
    });
    expect(retried.receipt.reference).toMatch(/^RQ-\d{4}-\d{6}$/);
  });

  it("AT11: the same key with another payload is refused and changes nothing", async () => {
    const input = question();
    const session = newReceiptSession();
    await submitInquiry(t.db, input, { ip: ip(), receiptSession: session });
    const changed = await rejection(
      submitInquiry(
        t.db,
        { ...input, message: "Actually, is there parking?" },
        {
          ip: ip(),
          receiptSession: session,
        },
      ),
    );
    expect(changed.code).toBe("idempotency_key_reused");
    const [row] = await inquiriesFor(input.submissionKey);
    expect(row?.message).toBe("Is there a lift?");
  });

  it("AT11: the receipt reads back only with the submitting session and carries no personal data", async () => {
    const input = question();
    const session = newReceiptSession();
    const { receipt } = await submitInquiry(t.db, input, { ip: ip(), receiptSession: session });
    expect(
      await readInquiryReceipt(t.db, {
        submissionKey: input.submissionKey,
        receiptSession: session,
      }),
    ).toEqual(receipt);
    for (const receiptSession of [newReceiptSession(), null]) {
      const error = await rejection(
        readInquiryReceipt(t.db, { submissionKey: input.submissionKey, receiptSession }),
      );
      expect(error.code).toBe("not_found");
    }
    const byReference = await rejection(
      readInquiryReceipt(t.db, { submissionKey: receipt.reference, receiptSession: session }),
    );
    expect(byReference.code).toBe("not_found");
    const serialized = JSON.stringify(receipt).toLowerCase();
    for (const secret of ["visitor.one", "example.test", "lift", "test visitor"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("AT12: commits the Inquiry with its coverage-queue owner and outbox event, no provider call", async () => {
    const input = question();
    const { receipt } = await submitInquiry(t.db, input, {
      ip: ip(),
      receiptSession: newReceiptSession(),
    });
    const [row] = await inquiriesFor(input.submissionKey);
    expect(row).toMatchObject({
      state: "received",
      source: "website",
      coverageQueue: inquiryCoverageQueue,
      ownerId: null,
      listingId: live.listingId,
      listingRevisionId: live.revisionId,
      preferredLocale: "bg",
      preferredChannel: "email",
      marketingOptIn: false,
    });
    expect(row?.context).toMatchObject({ listing: { reference: live.reference, locale: "bg" } });
    const events = await t.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.subjectId, row?.id ?? ""));
    expect(events).toMatchObject([
      {
        eventType: "inquiry.received",
        state: "pending",
        payload: { reference: receipt.reference, purpose: "question", coverageQueue: "intake" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("example.test");
    expect(await t.db.select().from(externalActions)).toEqual([]);
  });

  it("accepts a request only about a listing public in the page's locale", async () => {
    for (const [reference, locale] of [
      [live.reference, "en"],
      [unpublished.reference, "bg"],
    ] as const) {
      const input = question({ listingReference: reference, locale });
      const error = await rejection(
        submitInquiry(t.db, input, { ip: ip(), receiptSession: newReceiptSession() }),
      );
      expect(error).toMatchObject({
        code: "validation_failed",
        fieldErrors: { listingReference: ["not_found"] },
      });
      expect(await inquiriesFor(input.submissionKey)).toEqual([]);
    }
  });

  it("holds a filled honeypot for review instead of dropping it, with the same receipt", async () => {
    const input = question({ website: "http://spam.example" });
    const { receipt } = await submitInquiry(t.db, input, {
      ip: ip(),
      receiptSession: newReceiptSession(),
    });
    expect(receipt.status).toBe("accepted");
    const [row] = await inquiriesFor(input.submissionKey);
    expect(row).toMatchObject({
      state: "suspected_spam",
      dispositionReason: "automated_submission_signal",
      coverageQueue: "intake",
    });
  });

  it("rate-limits new submissions per client IP but never a retry", async () => {
    const address = ip();
    const first = question({ listingReference: undefined });
    const session = newReceiptSession();
    await submitInquiry(t.db, first, { ip: address, receiptSession: session });
    for (let i = 0; i < 4; i++) {
      await submitInquiry(t.db, question({ listingReference: undefined }), {
        ip: address,
        receiptSession: session,
      });
    }
    const limited = await rejection(
      submitInquiry(t.db, question(), { ip: address, receiptSession: session }),
    );
    expect(limited.code).toBe("rate_limited");
    const retry = await submitInquiry(t.db, first, { ip: address, receiptSession: session });
    expect(retry.replayed).toBe(true);
  });
});

describe("/api/inquiries", () => {
  const origin = "http://localhost:3000";
  const post = (body: string, headers: Record<string, string>) =>
    POST(new Request(`${origin}/api/inquiries`, { method: "POST", body, headers }));
  const cookieOf = (response: Response) =>
    (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

  it("issues a submission key and a receipt session only when the browser has none", async () => {
    const issued = issueRoute(new Request(`${origin}/api/inquiries`));
    expect(issued.headers.get("cache-control")).toBe("no-store");
    const { submissionKey } = await issued.json();
    expect(submissionKey).toMatch(/^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/);
    const cookie = cookieOf(issued);
    expect(cookie).toMatch(/^msr_receipt=/);
    const again = issueRoute(new Request(`${origin}/api/inquiries`, { headers: { cookie } }));
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-site and malformed requests with the §5.1 error body", async () => {
    process.env.DATABASE_URL = t.url;
    const crossSite = await post(JSON.stringify(question()), { origin: "https://evil.example" });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({
      error: { code: "CROSS_ORIGIN_REQUEST", outcome: "not_applied" },
    });
    const malformed = await post("{", { origin });
    expect(malformed.status).toBe(422);
    expect(await malformed.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fieldErrors: { form: ["invalid_json"] } },
    });
  });

  it("AT10: answers JSON with 201 and the receipt, then 200 with the same receipt", async () => {
    process.env.DATABASE_URL = t.url;
    const body = JSON.stringify(question());
    const headers = { origin, "content-type": "application/json", "cf-connecting-ip": ip() };
    const created = await post(body, headers);
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const cookie = cookieOf(created);
    const { receipt } = await created.json();
    const again = await post(body, { ...headers, cookie });
    expect(again.status).toBe(200);
    expect((await again.json()).receipt).toEqual(receipt);
  });

  it("works without JavaScript: POST/Redirect/GET to the receipt, readable with the cookie only", async () => {
    process.env.DATABASE_URL = t.url;
    const submissionKey = issueSubmissionKey();
    const posted = await post(
      form({
        submissionKey,
        purpose: "question",
        locale: "bg",
        contactKind: "email",
        contactValue: "no-js@example.test",
        message: "Is the flat still offered?",
        privacyNotice: "on",
        website: "",
      }),
      { origin, "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip() },
    );
    expect(posted.status).toBe(303);
    expect(posted.headers.get("location")).toBe(`${origin}/bg/requests/${submissionKey}`);
    const cookie = cookieOf(posted);
    expect(cookie).toMatch(/^msr_receipt=/);
    expect(posted.headers.get("set-cookie")).toContain("HttpOnly");

    const params = { params: Promise.resolve({ submission: submissionKey }) };
    const status = await readReceiptRoute(
      new Request(`${origin}/api/inquiries/${submissionKey}`, { headers: { cookie } }),
      params,
    );
    expect(status.status).toBe(200);
    const { receipt } = await status.json();
    expect(receipt).toMatchObject({ receiptId: submissionKey, status: "accepted" });
    expect(JSON.stringify(receipt)).not.toContain("no-js@example.test");
    const stranger = await readReceiptRoute(
      new Request(`${origin}/api/inquiries/${submissionKey}`),
      { params: Promise.resolve({ submission: submissionKey }) },
    );
    expect(stranger.status).toBe(404);
    expect((await stranger.json()).error.code).toBe("NOT_FOUND");
  });

  it("sends a failed form back with its key and an error code, never the private fields", async () => {
    process.env.DATABASE_URL = t.url;
    const submissionKey = issueSubmissionKey();
    const posted = await post(
      form({
        submissionKey,
        purpose: "question",
        locale: "en",
        contactKind: "email",
        contactValue: "private@example.test",
        message: "My private question",
      }),
      { origin, "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip() },
    );
    expect(posted.status).toBe(303);
    const location = new URL(posted.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/inquire");
    expect(Object.fromEntries(location.searchParams)).toEqual({
      submission: submissionKey,
      error: "VALIDATION_FAILED",
    });
    expect(location.toString()).not.toContain("private");
    expect(await inquiriesFor(submissionKey)).toEqual([]);
  });
});
