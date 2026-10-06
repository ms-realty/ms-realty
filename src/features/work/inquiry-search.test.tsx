// O02 search: the term goes to the Server Action in the form body; results replace the queue
// and no link carries the term. A refused or failed search keeps the queue in view.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { InquiryRowView } from "./inquiry-row";
import { InquirySearch } from "./inquiry-search";
import type { InquirySearchState } from "./inquiry-search-state";

afterEach(cleanup);

const term = "Synthetic Ni";
const found: InquiryRowView = {
  id: "two",
  name: "Synthetic Nikol",
  reference: "RQ-TEST-two",
  context: null,
  state: "Assigned",
  received: { dateTime: new Date().toISOString(), label: "Received 5 minutes ago" },
  language: null,
  owner: { name: "Synthetic broker", needsCoverage: false },
};

function renderSearch(
  action: (state: InquirySearchState, data: FormData) => Promise<InquirySearchState>,
) {
  return render(
    <InquirySearch
      action={action}
      permalink="/en/inquiries?view=mine#inquiry-search"
      locale="en"
      scope="mine"
      page={1}
      clearHref="/en/inquiries?view=mine"
    >
      <p>Server-rendered queue</p>
    </InquirySearch>,
  );
}

it("posts the term, replaces the queue with results and keeps the term out of every link", async () => {
  const action = vi.fn(
    async (_state: InquirySearchState, data: FormData): Promise<InquirySearchState> => ({
      responseId: `response-${data.get("page") ?? 1}`,
      q: String(data.get("q")),
      outcome: {
        kind: "results",
        rows: [found],
        page: Number(data.get("page") ?? 1),
        hasMore: true,
      },
    }),
  );
  renderSearch(action);
  fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  const heading = await screen.findByRole("heading", { name: "Search results" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(action.mock.calls[0]?.[1].get("q")).toBe(term);
  expect(screen.queryByText("Server-rendered queue")).toBeNull();
  const results = screen.getByRole("list", { name: "Search results" });
  expect(within(results).getByRole("link")).toHaveAttribute("href", "/en/inquiries/two?view=mine");
  expect(within(results).getByRole("link")).toHaveTextContent("Synthetic Nikol · RQ-TEST-two");
  for (const link of screen.getAllByRole("link"))
    expect(link.getAttribute("href")).not.toMatch(/Synthetic|Ni\b/);
  expect(screen.getByRole("link", { name: "Back to the queue" })).toHaveAttribute(
    "href",
    "/en/inquiries?view=mine",
  );
  expect(screen.getByLabelText("Search conversations")).toHaveValue(term);

  // The next page of results is another POST that carries the same term in its body.
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1]?.[1].get("q")).toBe(term);
  expect(action.mock.calls[1]?.[1].get("page")).toBe("2");
  expect(await screen.findByRole("button", { name: "Previous page" })).toBeVisible();
});

it("shows a refused term inline, focuses the field and keeps the queue", async () => {
  const message = "Enter at least 2 characters.";
  renderSearch(async () => ({
    responseId: "refused",
    q: "a",
    outcome: { kind: "invalid", message },
  }));
  fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: "a" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText(message)).toBeVisible();
  const input = screen.getByLabelText("Search conversations");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    `Part of a name, or a full phone number or email address. ${message}`,
  );
  await waitFor(() => expect(input).toHaveFocus());
  expect(screen.getByText("Server-rendered queue")).toBeVisible();
});

it("announces a failed search and keeps the queue", async () => {
  const message = "The search could not be completed. The queue is unchanged; try again.";
  renderSearch(async () => ({
    responseId: "failed",
    q: term,
    outcome: { kind: "failed", message },
  }));
  fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Search conversations")).not.toHaveAttribute("aria-invalid");
  expect(screen.getByText("Server-rendered queue")).toBeVisible();
});
