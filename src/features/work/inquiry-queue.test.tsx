// O02 queue markup: scopes, rows, the open conversation, truthful empty and failed reads.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { InquiryQueue, InquiryQueueView } from "./inquiry-queue";
import type { InquiryRowView } from "./inquiry-row";

const reads = vi.hoisted(() => ({ listInbox: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/work/queries", () => ({ listInbox: reads.listInbox }));
vi.mock("./inquiry-search-action", () => ({ searchInquiriesAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  reads.listInbox.mockReset();
});

const session = { account: { kind: "staff", id: "staff-one" } } as Session;
const row = (id: string, overrides: Partial<InquiryRowView> = {}): InquiryRowView => ({
  id,
  name: `Synthetic ${id}`,
  reference: `RQ-TEST-${id}`,
  context: { kind: "listing", value: "MS-00202" },
  state: "Assigned",
  received: { dateTime: new Date().toISOString(), label: "Received 3 hours ago" },
  language: "Bulgarian",
  owner: { name: null, needsCoverage: true },
  ...overrides,
});

describe("InquiryQueue", () => {
  it("shows a failed read as a failure, never as an empty queue", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    reads.listInbox.mockRejectedValue(new Error("synthetic read failure"));
    render(await InquiryQueue({ locale: "en", session, scope: "unassigned", page: 1 }));
    expect(screen.getByRole("heading", { name: "The queue could not be loaded" })).toBeVisible();
    expect(
      screen.getByText("This does not mean there are no inquiries. Try again in a moment."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/en/inquiries?view=unassigned",
    );
    expect(screen.queryByText("No confirmed unclaimed conversations")).toBeNull();
    expect(screen.queryByText(/Open a conversation/)).toBeNull();
    expect(screen.getByRole("link", { name: "Unclaimed" })).toHaveAttribute("aria-current", "page");
    expect(logged).toHaveBeenCalled();
  });

  it("words an empty unclaimed scope as O02UNCLAIMED and points to coverage", async () => {
    reads.listInbox.mockResolvedValue({ rows: [], hasMore: false, page: 1 });
    render(await InquiryQueue({ locale: "en", session, scope: "unassigned", page: 1 }));
    expect(reads.listInbox).toHaveBeenCalledWith("test-db", session, "unassigned", 1);
    expect(
      screen.getByRole("heading", { name: "No confirmed unclaimed conversations" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "An unclear owner does not make a conversation free. Check coverage before you take one on.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Check coverage" })).toHaveAttribute(
      "href",
      "/en/coverage",
    );
    expect(screen.queryByRole("navigation", { name: "Queue pages" })).toBeNull();
    expect(screen.queryByText(/Open a conversation/)).toBeNull();
  });
});

describe("InquiryQueueView", () => {
  it("lists two-line rows that keep the scope, with the open-a-conversation prompt", () => {
    render(
      <InquiryQueueView
        locale="en"
        scope="all"
        page={1}
        read={{ ok: true, rows: [row("one"), row("two", { context: null })], hasMore: false }}
      />,
    );
    const links = within(screen.getByRole("list", { name: "Conversations" })).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/en/inquiries/one?view=all");
    expect(links[0]).toHaveTextContent(
      "Synthetic one · MS-00202Assigned · Received 3 hours ago · Preferred language: Bulgarian · Accountable owner: Agency coverage",
    );
    // Without a listing or purpose the reference names the conversation.
    expect(links[1]).toHaveTextContent("Synthetic two · RQ-TEST-two");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText("Open a conversation to see its context, owner and next action."),
    ).toBeVisible();
  });

  it("beside an open conversation keeps its scope and page and marks the selection", () => {
    render(
      <InquiryQueueView
        locale="en"
        scope="mine"
        page={2}
        selectedId="two"
        read={{
          ok: true,
          rows: [
            row("one", { owner: { name: "Synthetic broker", needsCoverage: false } }),
            row("two"),
          ],
          hasMore: true,
        }}
      />,
    );
    const queue = screen.getByRole("region", { name: "Inquiries" });
    const links = within(within(queue).getByRole("list", { name: "Conversations" })).getAllByRole(
      "link",
    );
    expect(links[0]).toHaveAttribute("href", "/en/inquiries/one?view=mine&page=2");
    expect(links[0]).toHaveTextContent("Accountable owner: Synthetic broker");
    expect(links[1]).toHaveAttribute("aria-current", "page");
    const mine = within(queue).getByRole("link", { name: "Mine" });
    expect(mine).toHaveAttribute("aria-current", "true");
    expect(mine).toHaveAttribute("href", "/en/inquiries/two?view=mine");
    const pages = within(queue).getByRole("navigation", { name: "Queue pages" });
    expect(within(pages).getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/en/inquiries/two?view=mine",
    );
    expect(within(pages).getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/en/inquiries/two?view=mine&page=3",
    );
    expect(screen.queryByText(/Open a conversation/)).toBeNull();
  });

  it("says a later page has emptied instead of claiming there is no work", () => {
    render(
      <InquiryQueueView
        locale="en"
        scope="all"
        page={3}
        read={{ ok: true, rows: [], hasMore: false }}
      />,
    );
    expect(screen.getByText("There are no conversations on this page.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to the first page" })).toHaveAttribute(
      "href",
      "/en/inquiries?view=all",
    );
    expect(screen.queryByText("No open conversations")).toBeNull();
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/en/inquiries?view=all&page=2",
    );
  });

  it("uses the BG and RU scope words", () => {
    for (const [locale, labels, search] of [
      ["bg", ["Всички", "Непоети", "Мои", "Изчакват клиент", "За преглед"], "Търсене в разговори"],
      ["ru", ["Все", "Свободные", "Мои", "Ожидают клиента", "На проверке"], "Поиск по разговорам"],
    ] as const) {
      const view = render(
        <InquiryQueueView
          locale={locale}
          scope="review"
          page={1}
          read={{ ok: true, rows: [], hasMore: false }}
        />,
      );
      const scopes = within(screen.getByRole("navigation")).getAllByRole("link");
      expect(scopes.map((link) => link.textContent)).toEqual(labels);
      expect(scopes[4]).toHaveAttribute("aria-current", "page");
      expect(screen.getByLabelText(search)).toBeInTheDocument();
      view.unmount();
    }
  });
});
