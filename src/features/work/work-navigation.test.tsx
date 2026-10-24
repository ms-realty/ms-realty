import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Page, Pagination } from "./screens";

afterEach(cleanup);

it.each([
  ["bg", "Предишна страница / Следваща страница"],
  ["en", "Previous page / Next page"],
  ["ru", "Предыдущая страница / Следующая страница"],
])("keeps %s queue pagination separate from the shell-owned navigation", (locale, label) => {
  render(
    <Page title="Synthetic work" locale={locale}>
      <Pagination page={2} hasMore href={`/${locale}/tasks?view=mine`} locale={locale} />
    </Page>,
  );
  const landmarks = screen.getAllByRole("navigation");
  expect(landmarks).toHaveLength(1);
  expect(landmarks[0]).toHaveAccessibleName(label);
  const pagination = screen.getByRole("navigation", { name: label });
  expect([...pagination.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
    `/${locale}/tasks?view=mine&page=1`,
    `/${locale}/tasks?view=mine&page=3`,
  ]);
});

it("omits pagination when the current queue has no other pages", () => {
  render(
    <Page title="Synthetic work" locale="en">
      <Pagination page={1} hasMore={false} href="/en/contacts" locale="en" />
    </Page>,
  );
  expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  expect(screen.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
});
