import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { saveSearchAlert } from "../../../app/client/[locale]/(journey)/preferences/search-alerts/actions";
import { initialSearchAlertState } from "./search-alert-server";
import { alertSearch } from "./search-alert-state";

const mocks = vi.hoisted(() => {
  vi.stubEnv("P10_TEST_AUTH_SECRET", crypto.randomUUID());
  return { optIn: vi.fn(), session: vi.fn(), host: vi.fn() };
});
vi.mock("@/db/client", () => ({ getDb: () => "db" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://client.example.test" }),
}));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({
    authSecret: process.env.P10_TEST_AUTH_SECRET,
    hosts: { client: "https://client.example.test" },
  }),
}));
vi.mock("@/server/auth/pages", () => ({
  currentClientSession: mocks.session,
  requireAuthHost: mocks.host,
}));
vi.mock("@/server/privacy/preferences", () => ({ optIn: mocks.optIn }));
const session = {
  id: "current-session",
  actor: { kind: "client", id: "current-client" },
  account: { kind: "client", id: "current-client" },
} as Session;
const search = alertSearch("bg", {
  purpose: "long_term_rent",
  type: "apartment",
  minPrice: "950.03",
  minBeds: "2",
  minArea: "74.51",
  areaBasis: "built",
  features: "lift",
  includeUnconfirmed: "1",
});
const termsVersionId = "42000000-0000-4000-8000-000000000001";
const context = { locale: "bg", filters: search.filters, termsVersionId };
function fixture() {
  const state = initialSearchAlertState(session, search, termsVersionId, "Europe/Sofia");
  const data = new FormData();
  for (const [name, value] of Object.entries({
    ...state.values,
    contactMethodId: "42000000-0000-4000-8000-000000000002",
    confirmed: "yes",
    frequency: "weekly",
  }))
    data.set(name, value);
  data.set("_operationId", state.operationId);
  return { state, data };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.optIn.mockResolvedValue({ operationId: randomUUID(), outcome: { state: "active" } });
});
afterAll(() => vi.unstubAllEnvs());
it("passes complete exact criteria and explicit contact/frequency/purpose to existing optIn", async () => {
  const { state, data } = fixture();
  const result = await saveSearchAlert(context, state, data);
  expect(mocks.host).toHaveBeenCalledWith("client");
  expect(mocks.optIn).toHaveBeenCalledWith("db", session, {
    operationId: state.operationId,
    contactMethodId: data.get("contactMethodId"),
    purpose: "search_alerts",
    locale: "bg",
    termsVersionId,
    confirmed: true,
    timezone: "Europe/Sofia",
    frequency: "weekly",
    search: search.input,
  });
  expect(result.outcome.kind).toBe("confirmed");
});
it("retains choices after missing consent and accepts correction with the same issued key", async () => {
  const { state, data } = fixture();
  data.delete("confirmed");
  const invalid = await saveSearchAlert(context, state, data);
  expect(invalid.outcome.kind).toBe("validation");
  expect(invalid.values.frequency).toBe("weekly");
  expect(invalid.values.proof).toBe(state.values.proof);
  expect(mocks.optIn).not.toHaveBeenCalled();
  data.set("confirmed", "yes");
  expect((await saveSearchAlert(context, invalid, data)).outcome.kind).toBe("confirmed");
  expect(mocks.optIn.mock.calls[0]?.[2].operationId).toBe(state.operationId);
});
it.each(["session", "criteria", "duplicate", "key"])(
  "rejects %s changes to issued review identity before subscription work",
  async (variation) => {
    const { state, data } = fixture();
    let submittedContext = context;
    if (variation === "session")
      mocks.session.mockResolvedValue({ ...session, id: "another-session" });
    if (variation === "criteria")
      submittedContext = { ...context, filters: { ...context.filters, includeUnconfirmed: "" } };
    if (variation === "duplicate")
      data.append("contactMethodId", String(data.get("contactMethodId")));
    if (variation === "key") data.set("_operationId", randomUUID());
    expect((await saveSearchAlert(submittedContext, state, data)).outcome.kind).toBe("rejected");
    expect(mocks.optIn).not.toHaveBeenCalled();
  },
);
it("keeps uncertain results tied to the original operation and search", async () => {
  const { state, data } = fixture();
  mocks.optIn.mockRejectedValue(new AppError("outcome_unknown"));
  const result = await saveSearchAlert(context, state, data);
  expect(result.outcome.kind).toBe("unknown");
  if (result.outcome.kind !== "unknown") throw new Error("Expected unknown result");
  const url = new URL(result.outcome.status.href, "https://client.example.test");
  expect(url.searchParams.get("operation")).toBe(state.operationId);
  expect(alertSearch("bg", Object.fromEntries(url.searchParams)).normalized).toEqual(
    search.normalized,
  );
});
