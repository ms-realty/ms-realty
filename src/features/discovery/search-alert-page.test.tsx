import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PublicPage from "../../../app/public/[locale]/(site)/search-alerts/page";
import { SearchAlertForm } from "./search-alert-form";
import { alertSearch } from "./search-alert-state";

vi.mock("@/db/client", () => ({ getDb: () => "db" }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { client: "https://client.example.test" } }),
}));
vi.mock("@/server/subscriptions/rule", () => ({ configuredAlertRule: () => null }));
vi.mock("@/server/ai/intent-source", () => ({ intentPlaces: async () => [] }));
vi.mock("./search-alert-criteria", () => ({
  SearchAlertCriteria: () => <p>Reviewed search criteria</p>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
afterEach(cleanup);
it("offers account/manual recovery without an anonymous email or false verification send", async () => {
  render(
    await PublicPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ minPrice: "950.03", minArea: "74.51", areaBasis: "built" }),
    }),
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  const href = screen.getByRole("link", { name: "Continue in your account" }).getAttribute("href");
  expect(new URL(href ?? "").origin).toBe("https://client.example.test");
  expect(new URL(href ?? "").searchParams.get("minPrice")).toBe("950.03");
  expect(screen.getByText(/Email alerts are currently unavailable/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Ask the team" })).toHaveAttribute("href", "/en/inquire");
});
it("shows exact money/area precision and explicit unknown policy in review", async () => {
  const { SearchAlertCriteria } =
    await vi.importActual<typeof import("./search-alert-criteria")>("./search-alert-criteria");
  render(
    await SearchAlertCriteria({
      locale: "en",
      search: alertSearch("en", {
        minPrice: "950.03",
        minArea: "74.51",
        areaBasis: "built",
        minBeds: "2",
      }),
    }),
  );
  expect(screen.getByText(/950\.03/)).toBeVisible();
  expect(screen.getByText(/74\.51/)).toBeVisible();
  expect(screen.getByText(/unknown facts do not match/)).toBeVisible();
});
it("requires a deliberately chosen verified contact and unchecked alert-only consent", () => {
  render(
    <SearchAlertForm
      locale="en"
      permalink="/en/preferences/search-alerts?purpose=sale"
      contacts={[{ id: "contact-one", value: "synthetic@example.test" }]}
      initialState={{
        operationId: "op",
        expectedRevision: null,
        responseId: "render",
        values: {
          contactMethodId: "",
          confirmed: "",
          frequency: "daily",
          timezone: "Europe/Sofia",
          proof: "proof",
        },
        outcome: { kind: "idle" },
      }}
      action={async (state) => state}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Email" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Frequency" })).toHaveValue("daily");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("checkbox")).toHaveAccessibleName(/does not enable marketing/);
});
