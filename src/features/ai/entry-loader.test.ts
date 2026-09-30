import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantsForRoles } from "@/domain/capabilities";
import type { Session } from "@/server/auth/sessions";
import type { Executor } from "@/server/db";
import { AppError } from "@/server/errors";
import { assistanceEntryAccess, entryPage, entryView, readAssistanceEntry } from "./entry-loader";

const services = vi.hoisted(() => ({
  inbox: vi.fn(),
  source: vi.fn(),
  grants: vi.fn(),
  live: vi.fn(),
}));
vi.mock("@/server/work/queries", () => ({ listInbox: services.inbox }));
vi.mock("@/server/ai/assistance", () => ({ readAssistanceSource: services.source }));
vi.mock("@/server/authz", () => ({ resolveGrants: services.grants }));
vi.mock("@/server/work/shared", () => ({ liveStaff: services.live }));
const db = {} as Executor;
const session = { id: "session" } as Session;
const allAccess = {
  inquiries: true,
  inquiryDrafts: true,
  inventory: true,
  intakeDrafts: true,
  localeDrafts: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  services.live.mockResolvedValue(session);
  services.grants.mockResolvedValue(grantsForRoles(["assigned_broker"]));
});

it("checks every queue choice using current source authority, preserves order and projects no message or contact data", async () => {
  services.inbox.mockResolvedValue({
    rows: ["first", "denied", "last"].map((id) => ({
      inquiry: { id, purpose: "question", message: "private original" },
    })),
    page: 2,
    hasMore: true,
  });
  services.source.mockImplementation(async (_db, _session, id) => {
    if (id === "denied") throw new AppError("forbidden");
    return {
      id,
      version: 9,
      fields: {
        reference: `RQ-${id}`,
        locale: "en",
        purpose: "question",
        message: "private minimized",
      },
    };
  });
  const result = await readAssistanceEntry(db, session, "mine", 2);
  expect(services.inbox).toHaveBeenCalledWith(db, session, "mine", 2);
  expect(services.source.mock.calls.map((call) => call[2])).toEqual(["first", "denied", "last"]);
  expect(result).toEqual({
    choices: [
      { id: "first", reference: "RQ-first", locale: "en", purpose: "question" },
      { id: "last", reference: "RQ-last", locale: "en", purpose: "question" },
    ],
    page: 2,
    hasMore: true,
    view: "mine",
    access: allAccess,
  });
  expect(JSON.stringify(result)).not.toContain("private");
});

it("retains the queue pagination when records are removed or lose draft authority", async () => {
  services.inbox.mockResolvedValue({
    rows: [{ inquiry: { id: "removed" } }],
    page: 3,
    hasMore: true,
  });
  services.source.mockRejectedValue(new AppError("not_found"));
  expect(await readAssistanceEntry(db, session, "all", 3)).toEqual({
    choices: [],
    page: 3,
    hasMore: true,
    view: "all",
    access: allAccess,
  });
});

it("never queries an unauthorized inquiry queue for a content editor, while retaining legitimate listing tasks", async () => {
  services.grants.mockResolvedValue(grantsForRoles(["content_editor"]));
  const result = await readAssistanceEntry(db, session);
  expect(services.inbox).not.toHaveBeenCalled();
  expect(services.source).not.toHaveBeenCalled();
  expect(result).toEqual({
    choices: [],
    page: 1,
    hasMore: false,
    view: "all",
    access: {
      inquiries: false,
      inquiryDrafts: false,
      inventory: true,
      intakeDrafts: true,
      localeDrafts: true,
    },
  });
});

it("preserves record, parent-case and locale scoped inquiry authority instead of probing only global grants", async () => {
  services.grants.mockResolvedValue([
    {
      capability: "inquiry.read",
      scope: { recordType: "case", recordId: "case-one", locales: ["en"] },
    },
    {
      capability: "ai.draft",
      scope: { recordType: "inquiry", recordId: "inquiry-one", locales: ["en"] },
    },
  ]);
  services.inbox.mockResolvedValue({ rows: [], page: 2, hasMore: true });
  const result = await readAssistanceEntry(db, session, "all", 2);
  expect(services.inbox).toHaveBeenCalledWith(db, session, "all", 2);
  expect(result.access).toEqual({
    inquiries: true,
    inquiryDrafts: true,
    inventory: false,
    intakeDrafts: false,
    localeDrafts: false,
  });
});

it("does not query draft sources for a read-only role, expired grants or unrelated record families", async () => {
  services.grants.mockResolvedValue(grantsForRoles(["coordinator"]));
  const result = await readAssistanceEntry(db, session);
  expect(services.inbox).not.toHaveBeenCalled();
  expect(result.access).toEqual({
    inquiries: true,
    inquiryDrafts: false,
    inventory: true,
    intakeDrafts: false,
    localeDrafts: false,
  });
  expect(
    assistanceEntryAccess([
      { capability: "inquiry.read" },
      { capability: "ai.draft", scope: { recordType: "content_page" } },
      { capability: "ai.draft", scope: { expiresAt: "2000-01-01T00:00:00Z" } },
    ]).inquiryDrafts,
  ).toBe(false);
});

it("offers translation only when its required listing capabilities share a supported target locale", () => {
  const grants = [
    {
      capability: "listing.read" as const,
      scope: { recordType: "property", recordId: "property-one", locales: ["en" as const] },
    },
    {
      capability: "translation.draft" as const,
      scope: { recordType: "listing", recordId: "listing-one", locales: ["en" as const] },
    },
    {
      capability: "ai.draft" as const,
      scope: { recordType: "listing", recordId: "listing-one", locales: ["ru" as const] },
    },
  ];
  expect(assistanceEntryAccess(grants).localeDrafts).toBe(false);
  expect(
    assistanceEntryAccess([
      ...grants,
      {
        capability: "ai.draft",
        scope: { recordType: "property", recordId: "property-one", locales: ["en"] },
      },
    ]).localeDrafts,
  ).toBe(true);
  expect(assistanceEntryAccess(grants).intakeDrafts).toBe(false);
});

it("propagates backend failures rather than displaying an empty picker", async () => {
  services.inbox.mockResolvedValue({
    rows: [{ inquiry: { id: "broken" } }],
    page: 1,
    hasMore: false,
  });
  services.source.mockRejectedValue(new Error("storage unavailable"));
  await expect(readAssistanceEntry(db, session)).rejects.toThrow("storage unavailable");
});

describe("bounded native query parsing", () => {
  it.each([
    [undefined, 1],
    ["2", 2],
    ["10000", 10000],
    ["10001", 1],
    ["-1", 1],
    ["1.5", 1],
    ["bad", 1],
    [["2", "3"], 1],
  ] as const)("parses page %s", (value, result) => {
    expect(entryPage(value as string | string[] | undefined)).toBe(result);
  });
  it("accepts only supported queue views", () => {
    expect(entryView("review")).toBe("review");
    expect(entryView("all")).toBe("all");
    expect(entryView("other")).toBe("all");
    expect(entryView(["mine", "all"])).toBe("all");
  });
});
