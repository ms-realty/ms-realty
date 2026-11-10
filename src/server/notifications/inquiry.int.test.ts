// ADR 0014: every e-mail inquiry is acknowledged once, in the site language, on the visitor's
// own request as basis; phone-only and held submissions get nothing; the send-time rule is the
// inquirer's own, not the client one.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { serviceNotifications } from "@/config/tenant";
import { contactMethods, externalActions, inquiries } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { getEnv } from "../config/env";
import {
  type InquiryInput,
  issueSubmissionKey,
  newReceiptSession,
  submitInquiry,
} from "../inquiries/intake";
import { dispatchMessage } from "../jobs/outbox";
import { type OutboundMessage, TestMessageProvider } from "../jobs/provider";
import { createListingFixture, type ListingFixture, publishForTest } from "../publication/testing";
import { createStaff } from "../testing";
import { dispatchDealNotices } from "./guard";
import {
  inquiryAcknowledgementSubject,
  inquiryAcknowledgementTemplate,
  renderInquiryAcknowledgement,
} from "./inquiry";

let t: TestDatabase;
let live: ListingFixture;
beforeAll(async () => {
  t = await createTestDatabase();
  const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  live = await createListingFixture(t.db, { reviewerId: staff.id });
  await publishForTest(t.db, staff.actor, live);
});
afterAll(async () => {
  await t?.drop();
});

let counter = 0;
const ip = () => `198.51.100.${++counter}`;
const question = (overrides: Partial<InquiryInput> = {}): InquiryInput => ({
  submissionKey: issueSubmissionKey(),
  purpose: "question",
  locale: "bg",
  name: "Test Visitor",
  contact: { kind: "email", value: `visitor-${++counter}@example.test` },
  message: "Is there a lift? Private synthetic message",
  listingReference: live.reference,
  privacyNotice: true,
  ...overrides,
});
const acknowledgements = (inquiryId: string) =>
  t.db
    .select()
    .from(externalActions)
    .where(
      and(
        eq(externalActions.subjectType, inquiryAcknowledgementSubject),
        eq(externalActions.subjectId, inquiryId),
      ),
    );
const inquiryOf = async (key: string) =>
  (await t.db.select().from(inquiries).where(eq(inquiries.submissionKey, key)))[0];
function render(row: typeof externalActions.$inferSelect) {
  const payload = row.payload as { recipient: string; params: Record<string, unknown> };
  const message: OutboundMessage = {
    outboxId: row.id,
    idempotencyKey: row.effectKey,
    channel: "email",
    recipient: payload.recipient,
    template: inquiryAcknowledgementTemplate,
    params: payload.params,
    secretParams: null,
  };
  return renderInquiryAcknowledgement(message, { hosts: getEnv().hosts });
}

it("acknowledges an e-mail inquiry once, in the site language, with the listing and receipt link only", async () => {
  const input = question({ locale: "bg" });
  const session = newReceiptSession();
  const accepted = await submitInquiry(t.db, input, { ip: ip(), receiptSession: session });
  const inquiry = await inquiryOf(input.submissionKey);
  if (!inquiry) throw new Error("No inquiry");
  let rows = await acknowledgements(inquiry.id);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error("No acknowledgement");
  expect(row).toMatchObject({
    state: "queued",
    effectKey: `inquiry.acknowledgement.v1:${inquiry.id}`,
    payload: {
      recipient: input.contact.value,
      template: "inquiry.acknowledgement.v1",
      params: {
        locale: "bg",
        reference: accepted.receipt.reference,
        receiptUrl: `${getEnv().hosts.public}/bg/requests/${input.submissionKey}`,
        listing: { reference: live.reference },
        recipient: { kind: "inquirer" },
      },
    },
  });
  const rendered = render(row);
  expect(rendered?.subject).toBe(`Получихме запитването Ви (${accepted.receipt.reference})`);
  expect(rendered?.text).toContain(`Отнася се за ${live.reference}`);
  expect(rendered?.text).toContain("Брокер ще Ви отговори.");
  expect(rendered?.html).toContain('<html lang="bg" dir="ltr">');
  const all = JSON.stringify(row) + JSON.stringify(rendered);
  for (const secret of ["Private synthetic message", "Test Visitor", "lift"])
    expect(all).not.toContain(secret);
  // No promise of a reply time: the operating policy records none.
  expect(rendered?.text).not.toMatch(/\d+\s*(h|hours|часа|ч\.)/i);

  // A retry of the same submission is a replay: still one acknowledgement.
  const replay = await submitInquiry(t.db, input, { ip: ip(), receiptSession: session });
  expect(replay.replayed).toBe(true);
  rows = await acknowledgements(inquiry.id);
  expect(rows).toHaveLength(1);

  // A general question asked on the Hebrew site is acknowledged in Hebrew, right to left.
  const hebrew = question({ locale: "he", listingReference: undefined });
  await submitInquiry(t.db, hebrew, { ip: ip(), receiptSession: newReceiptSession() });
  const [he] = await acknowledgements((await inquiryOf(hebrew.submissionKey))?.id ?? "");
  const heRendered = he ? render(he) : null;
  expect(heRendered?.subject).toMatch(/^קיבלנו את הפנייה שלכם \(/);
  expect(heRendered?.html).toContain('<html lang="he" dir="rtl">');
  expect(heRendered?.text).not.toContain("עוסקת ב");

  const provider = new TestMessageProvider();
  await dispatchDealNotices(t.db, provider);
  expect(provider.sent.filter((m) => m.recipient === input.contact.value)).toHaveLength(1);
  expect((await acknowledgements(inquiry.id))[0]?.state).toBe("acknowledged");
});

it("sends nothing for a phone-only contact or a held submission, and rechecks the inquirer at send time", async () => {
  const phone = question({
    purpose: "callback",
    contact: { kind: "phone", value: "+359888123456" },
    message: undefined,
  });
  await submitInquiry(t.db, phone, { ip: ip(), receiptSession: newReceiptSession() });
  const byPhone = await inquiryOf(phone.submissionKey);
  expect(await acknowledgements(byPhone?.id ?? "")).toHaveLength(0);

  const held = question({ website: "https://spam.example" } as Partial<InquiryInput>);
  await submitInquiry(t.db, held, { ip: ip(), receiptSession: newReceiptSession() });
  const heldRow = await inquiryOf(held.submissionKey);
  expect(heldRow?.state).toBe("suspected_spam");
  expect(await acknowledgements(heldRow?.id ?? "")).toHaveLength(0);

  const changed = question();
  await submitInquiry(t.db, changed, { ip: ip(), receiptSession: newReceiptSession() });
  const inquiry = await inquiryOf(changed.submissionKey);
  const [queued] = await acknowledgements(inquiry?.id ?? "");
  await t.db
    .update(contactMethods)
    .set({ value: "someone-else@example.test" })
    .where(eq(contactMethods.id, inquiry?.contactMethodId ?? ""));
  const provider = new TestMessageProvider();
  expect(await dispatchMessage(t.db, provider, queued?.id ?? "")).toBe("cancelled");
  expect(provider.sent).toHaveLength(0);
  expect((await acknowledgements(inquiry?.id ?? ""))[0]?.lastErrorCode).toBe(
    "inquiry_ack_contact_changed",
  );
});

it("records nothing when the brand switches acknowledgements off", async () => {
  const events = serviceNotifications.events as Record<string, boolean>;
  events["inquiry.acknowledged"] = false;
  try {
    const input = question();
    await submitInquiry(t.db, input, { ip: ip(), receiptSession: newReceiptSession() });
    const inquiry = await inquiryOf(input.submissionKey);
    expect(await acknowledgements(inquiry?.id ?? "")).toHaveLength(0);
  } finally {
    events["inquiry.acknowledged"] = true;
  }
});
