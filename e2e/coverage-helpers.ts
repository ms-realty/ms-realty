import { expect, type Page } from "@playwright/test";
import { offboardingCopy } from "../src/features/offboarding/copy";
import { workCopy } from "../src/features/work/copy";
import { hostUrl } from "./hosts";

type QueueOptions = {
  locale?: string;
  pageParameter?: "page" | "workPage";
  viewportWidth?: number;
};

/** Use the actual link and retain the queue, locale, filters and receipt while paging. */
export async function moveQueuePage(
  page: Page,
  direction: "next" | "previous",
  { locale = "en", pageParameter = "page", viewportWidth }: QueueOptions = {},
) {
  const copy = pageParameter === "workPage" ? offboardingCopy(locale) : workCopy(locale);
  const link = page.getByRole("link", { name: copy[direction], exact: true });
  if (!(await link.count())) return false;
  const before = new URL(page.url());
  const number = Number(before.searchParams.get(pageParameter) ?? "1");
  const expected = new URL(before);
  expected.searchParams.set(pageParameter, String(number + (direction === "next" ? 1 : -1)));
  expected.searchParams.sort();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL((url) => {
    const actual = new URL(url);
    actual.searchParams.sort();
    return actual.href === expected.href;
  });
  if (viewportWidth !== undefined)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewportWidth,
    );
  return true;
}

/** Missing links are absent from every reachable page, never just the current page. */
export async function findPaginatedRecords(
  page: Page,
  hrefs: readonly string[],
  options: QueueOptions = {},
) {
  let rewound = 0;
  while (await moveQueuePage(page, "previous", options)) {
    if (++rewound >= 100) throw new Error("Queue fixture exceeded 100 previous pages");
  }
  const remaining = new Set(hrefs);
  const found = new Set<string>();
  for (let number = 1; number <= 100; number++) {
    if (options.viewportWidth !== undefined)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        options.viewportWidth,
      );
    for (const href of remaining) {
      const record = page.locator(`a[href="${href}"]`);
      if (await record.count()) {
        await expect(record).toBeVisible();
        found.add(href);
        remaining.delete(href);
      }
    }
    if (!remaining.size || !(await moveQueuePage(page, "next", options))) return found;
  }
  throw new Error("Queue fixture exceeded 100 next pages");
}

/** False means absent from every reachable page, never just absent from the current page. */
export async function findPaginatedRecord(page: Page, href: string, options: QueueOptions = {}) {
  return (await findPaginatedRecords(page, [href], options)).has(href);
}

/** Existing linked-journey API; locale follows the requested record's route. */
export async function findCoverageRecord(page: Page, href: string) {
  return (await findCoverageRecords(page, [href])).has(href);
}

/** Check related records together so absence needs one complete traversal of the queue. */
export async function findCoverageRecords(page: Page, hrefs: readonly string[]) {
  const locale = hrefs[0]?.split("/")[1] ?? "en";
  const path = `/${locale}/coverage`;
  await page.goto(hostUrl("staff", path));
  await expect(page).toHaveURL(hostUrl("staff", path));
  return findPaginatedRecords(page, hrefs, { locale });
}
