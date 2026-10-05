import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClientPage from "../../../app/client/[locale]/(journey)/preferences/search-alerts/page";
import { alertSearch } from "./search-alert-state";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  preferences: vi.fn(),
  findOperation: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => "db" }));
vi.mock("@/server/auth/pages", () => ({ currentClientSession: mocks.session }));
vi.mock("@/server/auth/sessions", () => ({ isFresh: () => true }));
vi.mock("@/server/privacy/preferences", () => ({ getPreferences: mocks.preferences }));
vi.mock("@/server/operations", () => ({ findOperation: mocks.findOperation }));
vi.mock("@/server/subscriptions/rule", () => ({ configuredAlertRule: () => null }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { public: "https://public.example.test" } }),
}));
vi.mock("../../../app/client/[locale]/(journey)/preferences/search-alerts/actions", () => ({
  saveSearchAlert: async () => {},
}));
vi.mock("./search-alert-criteria", () => ({
  SearchAlertCriteria: ({
    search,
    title,
  }: {
    search: { normalized: { q: string | null } };
    title?: string;
  }) => (
    <section aria-label={title ?? "Reviewed search criteria"}>
      <p>{search.normalized.q ?? "Reviewed search criteria"}</p>
    </section>
  ),
}));
vi.mock("./search-alert-server", () => ({
  initialSearchAlertState: () => ({
    operationId: "review-key",
    expectedRevision: null,
    responseId: "render",
    outcome: { kind: "idle" },
    values: {
      contactMethodId: "",
      frequency: "daily",
      timezone: "Europe/Sofia",
      confirmed: "",
      proof: "proof",
    },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
const session = { actor: { kind: "client", id: "current-client" } };
const criteria = {
  purpose: "long_term_rent",
  minPrice: "950.03",
  areaBasis: "built",
  minArea: "74.51",
  includeUnconfirmed: "1",
};
function data() {
  return {
    party: { contactPreferences: {} },
    subscriptions: [],
    contacts: [
      {
        id: "verified-email",
        kind: "email",
        value: "synthetic@example.test",
        verification: "verified",
      },
      {
        id: "unverified-email",
        kind: "email",
        value: "unverified@example.test",
        verification: "unverified",
      },
    ],
    terms: {
      search_alerts: {
        title: "Synthetic reviewed terms",
        locale: "bg",
        paragraphs: ["Only a test policy"],
        version: { id: "terms" },
      },
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.preferences.mockResolvedValue(data());
});
afterEach(cleanup);
it("keeps exact criteria and the same uncertain operation through account recovery", async () => {
  mocks.session.mockResolvedValue(null);
  const operation = "45000000-0000-4000-8000-000000000001";
  const path = `${alertSearch("en", criteria).clientHref}&operation=${operation}`;
  await expect(
    ClientPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ ...criteria, operation }),
    }),
  ).rejects.toThrow(`/en/access?returnTo=${encodeURIComponent(path)}`);
  expect(mocks.preferences).not.toHaveBeenCalled();
});
it("preserves an invalid-context correction across sign-in without silently subscribing to an empty search", async () => {
  mocks.session.mockResolvedValue(null);
  await expect(
    ClientPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ minPrice: "bad" }),
    }),
  ).rejects.toThrow(
    `/en/access?returnTo=${encodeURIComponent("/en/preferences/search-alerts?context=invalid")}`,
  );
  mocks.session.mockResolvedValue(session);
  render(
    await ClientPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ context: "invalid" }),
    }),
  );
  expect(screen.getByText(/search could not be preserved/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save this search preference" }),
  ).not.toBeInTheDocument();
});
it("keeps the native response form mounted after creation and offers only owned verified email", async () => {
  mocks.preferences.mockResolvedValue({
    ...data(),
    subscriptions: [{ purpose: "search_alerts", state: "active" }],
  });
  render(
    await ClientPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve(criteria),
    }),
  );
  expect(screen.getByText(/search-alert preference already exists/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Save this search preference" })).toBeVisible();
  expect(screen.getByRole("option", { name: "synthetic@example.test" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "unverified@example.test" })).not.toBeInTheDocument();
});
it.each(["contact", "terms"])(
  "blocks opt-in when current %s eligibility is absent",
  async (missing) => {
    mocks.preferences.mockResolvedValue(
      missing === "contact" ? { ...data(), contacts: [] } : { ...data(), terms: {} },
    );
    render(
      await ClientPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve(criteria),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Save this search preference" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask the team" })).toHaveAttribute(
      "href",
      "https://public.example.test/en/inquire",
    );
  },
);
it("uses only the current actor's operation result and never opens another submission on a status request", async () => {
  const operation = "45000000-0000-4000-8000-000000000001";
  mocks.findOperation.mockResolvedValue(null);
  render(
    await ClientPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ ...criteria, operation }),
    }),
  );
  expect(mocks.findOperation).toHaveBeenCalledWith(
    "db",
    session.actor,
    "preferences.opt_in",
    operation,
  );
  expect(screen.getByText(/change is not confirmed/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save this search preference" }),
  ).not.toBeInTheDocument();
});

it.each(["active", "withdrawn"])(
  "status shows the stored operation's current %s search, never a different query's criteria",
  async (state) => {
    const operation = "45000000-0000-4000-8000-000000000001";
    const id = "45000000-0000-4000-8000-000000000002";
    const current = alertSearch("bg", {
      ...criteria,
      q: "Stored search A after editing",
      maxPrice: "1700.09",
    }).normalized;
    mocks.findOperation.mockResolvedValue({
      status: "succeeded",
      outcome: { id, state: "active" },
    });
    mocks.preferences.mockResolvedValue({
      ...data(),
      subscriptions: [
        {
          id,
          purpose: "search_alerts",
          state,
          frequency: "weekly",
          timezone: "Europe/Sofia",
          criteria: current,
        },
        {
          id: "another-subscription",
          purpose: "search_alerts",
          state: "active",
          criteria: alertSearch("en", { ...criteria, q: "Unrelated stored search B" }).normalized,
        },
      ],
    });
    render(
      await ClientPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ ...criteria, q: "URL search B", operation }),
      }),
    );
    expect(screen.getByText("This search-preference request was recorded.")).toBeVisible();
    expect(screen.getByRole("region", { name: "Current saved search" })).toHaveTextContent(
      "Stored search A after editing",
    );
    expect(screen.queryByText("URL search B")).not.toBeInTheDocument();
    expect(screen.queryByText("Unrelated stored search B")).not.toBeInTheDocument();
    expect(screen.getByText(/not a snapshot of the original request/)).toBeVisible();
    expect(screen.getByText(/^Current subscription state:/)).toHaveTextContent(
      `Current subscription state: ${state === "active" ? "Active" : "Unsubscribed"}`,
    );
    expect(
      screen.queryByRole("link", { name: "Review or edit these filters" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save this search preference" }),
    ).not.toBeInTheDocument();
  },
);

it("states recorded-request copy in the page locale inside the bg/en alert island", async () => {
  const id = "45000000-0000-4000-8000-000000000002";
  mocks.findOperation.mockResolvedValue({ status: "succeeded", outcome: { id } });
  mocks.preferences.mockResolvedValue({
    ...data(),
    subscriptions: [
      {
        id,
        purpose: "search_alerts",
        state: "active",
        frequency: "daily",
        timezone: "Asia/Jerusalem",
        criteria: { unexpected: "shape" },
      },
    ],
  });
  render(
    await ClientPage({
      params: Promise.resolve({ locale: "he" }),
      searchParams: Promise.resolve({
        ...criteria,
        operation: "45000000-0000-4000-8000-000000000001",
      }),
    }),
  );
  const recorded = screen.getByText("הבקשה להתראות על החיפוש נרשמה.");
  expect(recorded.closest("[lang]")).toHaveAttribute("lang", "he");
  expect(recorded.closest("[dir]")).toHaveAttribute("dir", "rtl");
  // Stored criteria that no longer parse are never replaced by the status URL's criteria.
  expect(screen.getByText(/פרטי החיפוש השמור אינם זמינים כאן/)).toBeVisible();
  expect(screen.queryByRole("region", { name: "החיפוש השמור הנוכחי" })).not.toBeInTheDocument();
});

it.each(["marketing", "missing"])(
  "does not label an owned %s result as a successful search preference",
  async (variation) => {
    const operation = "45000000-0000-4000-8000-000000000001";
    const id = "45000000-0000-4000-8000-000000000002";
    mocks.findOperation.mockResolvedValue({
      status: "succeeded",
      outcome: { id, state: "active" },
    });
    mocks.preferences.mockResolvedValue({
      ...data(),
      subscriptions:
        variation === "missing"
          ? []
          : [{ id, purpose: "marketing", state: "active", criteria: null }],
    });
    render(
      await ClientPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ ...criteria, q: "URL search B", operation }),
      }),
    );
    expect(screen.getByText(/change is not confirmed/)).toBeVisible();
    expect(
      screen.queryByText("This search-preference request was recorded."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("URL search B")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save this search preference" }),
    ).not.toBeInTheDocument();
  },
);
