// O02 row wording: intent, language, age and owner come only from the recorded inquiry.
import { describe, expect, it } from "vitest";
import { type InquiryRowSource, inquiryRowView } from "./inquiry-row-view";

const now = new Date();
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000);

function source(
  inquiry: Partial<InquiryRowSource["inquiry"]> = {},
  owner: Partial<Omit<InquiryRowSource, "inquiry">> = {},
): InquiryRowSource {
  return {
    inquiry: {
      id: "inquiry-one",
      reference: "RQ-TEST-000001",
      state: "received",
      preferredName: "Synthetic Alex",
      createdAt: ago(180),
      purpose: "viewing_request",
      preferredLocale: "bg",
      context: { listing: { reference: "MS-00202", title: "Synthetic flat" } },
      ...inquiry,
    },
    ownerName: null,
    needsCoverage: true,
    ...owner,
  };
}

describe("inquiryRowView", () => {
  it("names the listing before the purpose and words the received age, language and coverage", () => {
    const row = source();
    expect(inquiryRowView(row, "en", now)).toEqual({
      id: "inquiry-one",
      name: "Synthetic Alex",
      reference: "RQ-TEST-000001",
      context: { kind: "listing", value: "MS-00202" },
      state: null,
      received: { dateTime: row.inquiry.createdAt.toISOString(), label: "Received 3 hours ago" },
      language: "Bulgarian",
      owner: { name: null, needsCoverage: true },
    });
  });

  it("falls back to the stated purpose and shows any state other than received", () => {
    const view = inquiryRowView(
      source(
        { state: "assigned", context: {}, createdAt: ago(5), preferredLocale: "en" },
        { ownerName: "Synthetic broker", needsCoverage: false },
      ),
      "en",
      now,
    );
    expect(view).toMatchObject({
      context: { kind: "purpose", value: "Viewing request" },
      state: "Assigned",
      received: { label: "Received 5 minutes ago" },
      language: "English",
      owner: { name: "Synthetic broker", needsCoverage: false },
    });
    expect(
      inquiryRowView(source({ context: { listing: { reference: 7 } } }), "en", now).context,
    ).toEqual({ kind: "purpose", value: "Viewing request" });
    expect(inquiryRowView(source({ createdAt: ago(60 * 49) }), "en", now).received.label).toBe(
      "Received 2 days ago",
    );
  });

  it("keeps search rows minimal and never claims coverage for closed work", () => {
    const view = inquiryRowView(
      {
        inquiry: {
          id: "inquiry-two",
          reference: "RQ-TEST-000002",
          state: "resolved_without_case",
          preferredName: "   ",
          createdAt: ago(30),
        },
        ownerName: "Former broker",
        needsCoverage: true,
      },
      "en",
      now,
    );
    expect(view).toMatchObject({
      name: null,
      context: null,
      language: null,
      state: "Resolved without case",
      owner: { name: "Former broker", needsCoverage: false },
    });
    const open = inquiryRowView(
      {
        inquiry: {
          id: "inquiry-three",
          reference: "RQ-TEST-000003",
          state: "assigned",
          preferredName: null,
          createdAt: ago(30),
        },
        ownerName: null,
        needsCoverage: true,
      },
      "en",
      now,
    );
    expect(open).toMatchObject({ name: null, owner: { name: null, needsCoverage: true } });
  });

  it("words BG and RU rows in their own language", () => {
    expect(inquiryRowView(source(), "bg", now)).toMatchObject({
      received: { label: "Получено преди 3 часа" },
      language: "български",
    });
    expect(
      inquiryRowView(source({ state: "awaiting_client", context: null }), "ru", now),
    ).toMatchObject({
      context: { kind: "purpose", value: "Запрос просмотра" },
      state: "Ожидает клиента",
      received: { label: "Получено 3 часа назад" },
      language: "болгарский",
    });
  });
});
