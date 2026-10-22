import { beforeEach, expect, it, vi } from "vitest";
import Page from "../../../app/staff/[locale]/(workspace)/cases/page";

const calls = vi.hoisted(() => ({
  session: { id: "session-one", account: { kind: "staff", id: "broker-one" } },
  access: vi.fn(),
  retained: vi.fn(),
  locale: vi.fn(),
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: calls.access }));
vi.mock("@/features/work/screens", () => ({ checkLocale: calls.locale }));
vi.mock("./directory-private", () => ({ retainedCaseDirectoryFilter: calls.retained }));
vi.mock("./directory-screen", () => ({ CaseDirectoryScreen: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  calls.access.mockResolvedValue(calls.session);
  calls.retained.mockResolvedValue(null);
});
const route = (search: Record<string, string | string[] | undefined>) =>
  Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(search) });

it("retains legacy q for explicit POST recovery and ignores new private criteria supplied in a URL", async () => {
  const result = await route({
    q: ["legacy", "ignored"],
    purpose: "url private purpose",
    party: "url private party",
    nextAction: "url private action",
    kind: "buyer",
  });
  expect(result.props).toMatchObject({
    session: calls.session,
    locale: "en",
    query: {
      q: ["legacy", "ignored"],
      purpose: undefined,
      party: undefined,
      nextAction: undefined,
      kind: "buyer",
    },
    privateFilterUnavailable: false,
  });
  expect(calls.retained).not.toHaveBeenCalled();
});

it("uses the first opaque context and the session-bound text instead of any URL override", async () => {
  calls.retained.mockResolvedValue({
    shortened: true,
    values: {
      q: "retained q",
      purpose: "retained purpose",
      party: "retained party",
      nextAction: "retained action",
    },
  });
  const result = await route({
    filter: ["context-one", "context-two"],
    q: "override",
    party: "override",
    view: "needs",
    cursor: "page-two",
  });
  expect(calls.retained).toHaveBeenCalledWith(calls.session, "en", "context-one");
  expect(result.props).toMatchObject({
    query: {
      q: "retained q",
      purpose: "retained purpose",
      party: "retained party",
      nextAction: "retained action",
      cursor: "page-two",
      view: "needs",
    },
    privateFilterUnavailable: false,
    shortened: true,
  });
});

it("marks missing or foreign contexts unavailable rather than using URL text or widening scope", async () => {
  const result = await route({
    filter: "foreign-context",
    q: "fallback text",
    party: "fallback party",
    view: "mine",
  });
  expect(result.props).toMatchObject({
    privateFilterUnavailable: true,
    query: {
      q: undefined,
      purpose: undefined,
      party: undefined,
      nextAction: undefined,
      view: "mine",
    },
  });
});

it("requires staff access before reading any retained filter", async () => {
  calls.access.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await expect(route({ filter: "context" })).rejects.toThrow("ACCESS_DENIED");
  expect(calls.retained).not.toHaveBeenCalled();
});
