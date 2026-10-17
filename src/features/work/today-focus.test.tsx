// O01 focus state markup contract: the status wrapper over listTranslationReviews, the pages it
// draws (first, later, failed, refused cursor, nothing waiting) and the route that chooses
// between Today, the focus view and a 404.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { readTranslationReviews, TranslationReviewsScreen } from "./today-focus";
import { TodayScreen } from "./today-screen";

const reads = vi.hoisted(() => ({ page: vi.fn() }));
const { db, session } = vi.hoisted(() => ({
  // The route reads the signed-in person's name for Today's greeting.
  db: { select: () => ({ from: () => ({ where: async () => [{ name: "Maria Example" }] }) }) },
  session: { account: { kind: "staff", id: "staff-one" }, actor: { kind: "staff" } } as Session,
}));
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/server/work/queries", () => ({
  listTranslationReviews: reads.page,
  readToday: vi.fn(),
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: async () => session }));
vi.mock("@/features/work/screens", () => ({ checkLocale: () => {} }));
// Today itself has its own contract (today-screen.test.tsx); the route only has to choose it.
vi.mock("./today-screen", async (original) => ({
  ...(await original<typeof import("./today-screen")>()),
  TodayScreen: ({ name }: { name: string | null }) => `Today for ${name}`,
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import WorkPage, { generateMetadata } from "../../../app/staff/[locale]/(workspace)/today/page";

const now = new Date("2026-10-07T07:30:00Z");
const review = (index: number) => ({
  id: `translation-${index}`,
  listingId: `listing-${index}`,
  reference: `MS-RU-${index}`,
  sourceRevisionId: `source-${index}`,
  locale: "ru",
  ownerId: "staff-one",
  ownerName: "Maria Example",
  needsCoverage: false,
  requestedAt: new Date(now.getTime() - (index + 1) * 60_000),
});
const page = (rows: number, extra: Record<string, unknown> = {}) => ({
  rows: Array.from({ length: rows }, (_, index) => review(index)),
  total: rows,
  hasMore: false,
  nextCursor: null,
  ...extra,
});
const first = "/en/today?queue=translation-reviews";
const show = async (after?: string, locale = "en") =>
  render(await TranslationReviewsScreen({ locale, session, after, now }));
const focus = () => document.querySelector("[data-today-focus]") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  reads.page.mockResolvedValue(page(3));
});
afterEach(cleanup);

it("adds the ready status to the server's page and passes the cursor through", async () => {
  const served = page(30, { total: 31, hasMore: true, nextCursor: "cursor-2" });
  reads.page.mockResolvedValue(served);
  await expect(readTranslationReviews("db" as never, session, "cursor-1")).resolves.toEqual({
    status: "ready",
    ...served,
  });
  expect(reads.page).toHaveBeenCalledWith("db", session, "cursor-1");
});

it("reads a refused cursor as a link that is no longer valid, not as a failure", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reads.page.mockRejectedValue(new AppError("validation_failed"));
  await expect(readTranslationReviews("db" as never, session, "foreign")).resolves.toEqual({
    status: "invalid_cursor",
  });
  expect(log).not.toHaveBeenCalled();
  // Without a cursor there is no link to blame: the list did not load.
  await expect(readTranslationReviews("db" as never, session)).resolves.toEqual({
    status: "unavailable",
  });
  log.mockRestore();
});

it("reads any other failure as unavailable and logs only its class", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reads.page.mockRejectedValue(new TypeError("synthetic MS-RU-0 row in the message"));
  await expect(readTranslationReviews("db" as never, session, "cursor")).resolves.toEqual({
    status: "unavailable",
  });
  expect(log).toHaveBeenCalledWith("[O01] Translation reviews unavailable:", "TypeError");
  expect(JSON.stringify(log.mock.calls)).not.toContain("MS-RU-0");
  log.mockRestore();
});

it("lets an access change or a Next.js control-flow error through", async () => {
  for (const code of ["unauthenticated", "forbidden", "not_found"] as const) {
    const denied = new AppError(code);
    reads.page.mockRejectedValue(denied);
    await expect(readTranslationReviews("db" as never, session, "cursor")).rejects.toBe(denied);
  }
  // The real control-flow error: the mock above replaces notFound for the route only.
  const navigation = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  let control: unknown;
  try {
    navigation.notFound();
  } catch (error) {
    control = error;
  }
  reads.page.mockRejectedValue(control);
  await expect(readTranslationReviews("db" as never, session)).rejects.toBe(control);
});

it("lists the first thirty with the server's total, workbench rows and a Next page link", async () => {
  const cursor = "eyJ2ZXJzaW9uIjoxfQ_-";
  reads.page.mockResolvedValue(page(30, { total: 31, hasMore: true, nextCursor: cursor }));
  await show();
  expect(reads.page).toHaveBeenCalledWith(db, session, undefined);
  expect(focus()).toHaveAttribute("data-today-state", "ready");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Translations to review");
  expect(screen.getByText("Waiting for review: 31, oldest first.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/en/today");
  // Every row opens the translation workbench exactly as Today's rows do.
  const rows = within(screen.getByRole("list", { name: "Translations to review" }));
  expect(rows.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
    Array.from({ length: 30 }, (_, index) => `/en/inventory/MS-RU-${index}/translations/ru`),
  );
  expect(
    rows.getByRole("link", { name: /^Translation to review · RU · MS-RU-0/ }),
  ).toHaveTextContent(
    "Owner: Maria Example · Requested 1 min. ago · Next step: review the translation",
  );
  const pages = within(screen.getByRole("navigation", { name: "Pages of this list" }));
  expect(
    pages.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual([["Next page", `${first}&after=${encodeURIComponent(cursor)}`]]);
  expect(screen.queryByText("Continued after the previous page.")).toBeNull();
  // The focus view links; it never approves, sends or publishes.
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector("form")).toBeNull();
});

it("continues after a cursor with the rest and a way back to the first page", async () => {
  reads.page.mockResolvedValue({ ...page(1), total: 31 });
  await show("cursor-2");
  expect(reads.page).toHaveBeenCalledWith(db, session, "cursor-2");
  expect(screen.getByText("Waiting for review: 31, oldest first.")).toBeVisible();
  expect(screen.getByText("Continued after the previous page.")).toBeVisible();
  expect(
    within(screen.getByRole("list", { name: "Translations to review" })).getAllByRole("link"),
  ).toHaveLength(1);
  const pages = within(screen.getByRole("navigation", { name: "Pages of this list" }));
  expect(
    pages.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual([["Go to the first page", first]]);
});

it("draws a failed read as Today's failed state, never as an empty list", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reads.page.mockRejectedValue(new Error("synthetic connection reset"));
  await show("cursor-2");
  expect(focus()).toHaveAttribute("data-today-state", "failed");
  expect(screen.getByText("This list could not load. Work may be waiting in it.")).toBeVisible();
  expect(
    screen.getByText("Reload the page. If that does not help, check the system status."),
  ).toBeVisible();
  // Reload asks for the same page again.
  expect(screen.getByRole("link", { name: "Reload the page" })).toHaveAttribute(
    "href",
    `${first}&after=cursor-2`,
  );
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText(/No translations|no more translations|Waiting for review/)).toBeNull();
  log.mockRestore();
});

it("names a refused cursor politely and starts again from the first page", async () => {
  reads.page.mockRejectedValue(new AppError("validation_failed"));
  await show("another-persons-cursor");
  expect(focus()).toHaveAttribute("data-today-state", "invalid-link");
  expect(
    screen.getByText("This page link is no longer valid. Start from the first page."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute("href", first);
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText(/could not load/)).toBeNull();
});

it("says when nothing waits, and when nothing follows the previous page any more", async () => {
  reads.page.mockResolvedValue(page(0));
  await show();
  expect(focus()).toHaveAttribute("data-today-state", "empty");
  expect(screen.getByText("No translations are waiting for your review.")).toBeVisible();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();

  cleanup();
  reads.page.mockResolvedValue({ ...page(0), total: 3 });
  await show("cursor-2");
  expect(focus()).toHaveAttribute("data-today-state", "ended");
  expect(screen.getByText("Waiting for review: 3, oldest first.")).toBeVisible();
  expect(screen.getByText("There are no more translations after the previous page.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute("href", first);
});

it.each([
  [
    "bg",
    "Преводи за преглед",
    "Чакат преглед: 31, най-старите първи.",
    "Назад към „Днес“",
    "Следваща страница",
  ],
  [
    "ru",
    "Переводы на проверку",
    "Ждут проверки: 31, сначала самые давние.",
    "Назад к «Сегодня»",
    "Следующая страница",
  ],
])("speaks %s", async (locale, title, lead, back, next) => {
  reads.page.mockResolvedValue(page(30, { total: 31, hasMore: true, nextCursor: "cursor-2" }));
  await show(undefined, locale);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
  expect(screen.getByText(lead)).toBeVisible();
  expect(screen.getByRole("link", { name: back })).toHaveAttribute("href", `/${locale}/today`);
  expect(screen.getByRole("link", { name: next })).toHaveAttribute(
    "href",
    `/${locale}/today?queue=translation-reviews&after=cursor-2`,
  );
  expect(document.body.textContent).not.toMatch(/Next step|Owner:|Waiting for review/);
});

const route = (query: Record<string, string | string[]>, locale = "en") => ({
  params: Promise.resolve({ locale }),
  searchParams: Promise.resolve(query),
});

it("routes a known queue to its focus view and any other queue to a 404", async () => {
  // A repeated parameter keeps its first value.
  const focusView = await WorkPage(
    route({ queue: "translation-reviews", after: ["cursor-2", "ignored"] }),
  );
  expect(focusView.type).toBe(TranslationReviewsScreen);
  expect(focusView.props).toEqual({ locale: "en", session, after: "cursor-2" });

  for (const queue of ["viewings", "", "TRANSLATION-REVIEWS", ["unknown", "translation-reviews"]])
    await expect(WorkPage(route({ queue }))).rejects.toThrow("NOT_FOUND");
  // Without a queue the cursor means nothing: Today itself.
  const today = await WorkPage(route({ after: "cursor-2" }));
  expect(today.type).toBe(TodayScreen);
  expect(today.props).toEqual({ locale: "en", session, name: "Maria Example" });
  expect(reads.page).not.toHaveBeenCalled();
});

it("titles the focus view after its queue", async () => {
  await expect(generateMetadata(route({ queue: "translation-reviews" }, "bg"))).resolves.toEqual({
    title: "Преводи за преглед",
  });
  await expect(generateMetadata(route({}))).resolves.toEqual({ title: "Today" });
});
