// O01 Today against real PostgreSQL with synthetic, record-scoped records: contract order,
// counts that open their queues, rows with reason/owner/time/next step, the draft-only Butler
// entry, truthful no-work, overload and overdue-follow-up states, and the 20 px phone padding
// of the Figma 390 frames. JavaScript on and off; BG, EN and RU. The mobile projects run every
// case at 390 px; the padding case also checks 320 px.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

type Seeds = {
  ordinary: {
    token: string;
    listing: string;
    oldest: string;
    oldestReference: string;
    newest: string;
    mine: string;
    due: string;
    dueTitle: string;
    offered: string;
    offeredTitle: string;
  };
  quiet: { emptyToken: string; overloadToken: string };
  overdue: { overdueToken: string; overdue: string };
};
/** Seeds only the scenario a case reads (see e2e/support/today-seed.ts). */
function seed<K extends keyof Seeds>(scenario: K): Seeds[K] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/today-seed.ts", scenario],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  );
}
async function open(page: Page, token: string, path: string) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", path));
}
const groups = (page: Page) => page.getByRole("main").getByRole("heading", { level: 3 });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Axe needs browser timers, which Playwright stops when scripting is off; the no-JavaScript
// runs keep the structural assertions around each call.
async function expectAccessible(page: Page, javaScriptEnabled: boolean) {
  if (!javaScriptEnabled) return;
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O01 lists work in contract order and every count opens its queue", async ({
      page,
    }, testInfo) => {
      const f = seed("ordinary");
      await open(page, f.token, "/en/today");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(
        /^Good (morning|afternoon|evening), Synthetic broker\.$/,
      );
      await expect(
        main.getByText("Waiting for action: 4. Start at the top of the list."),
      ).toBeVisible();
      await expect(groups(page)).toHaveText([
        "Unassigned requestsIn the queue: 2",
        "My overdue tasksIn the queue: 1",
        "Awaiting my acceptanceIn the queue: 1",
        "My open inquiriesIn the queue: 1",
      ]);
      // The other lists loaded and hold nothing for this person: named once, not drawn empty.
      await expect(page.locator('[data-today-quiet="attention"]')).toHaveText(
        "Nothing waiting: Viewings · Listing corrections and reviews · Translations to review · Email delivery to check · Publication delivery to check",
      );
      await expect(page.locator('[data-today-quiet="continue"]')).toHaveText(
        "Nothing waiting: My cases · My listing drafts",
      );
      // Record-scoped access only: the team scope is not offered.
      const scope = page.getByRole("navigation", { name: "Work scope" });
      await expect(scope.getByRole("link")).toHaveText(["For action", "My tasks"]);
      await expect(scope.getByRole("link", { name: "For action" })).toHaveAttribute(
        "aria-current",
        "page",
      );

      const unassigned = page.getByRole("list", { name: "Unassigned requests" }).getByRole("link");
      await expect(unassigned).toHaveCount(2);
      await expect(unassigned.first()).toHaveAttribute("href", `/en/inquiries/${f.oldest}`);
      await expect(unassigned.first()).toContainText(
        `Viewing request · Synthetic visitor · ${f.listing}`,
      );
      await expect(unassigned.first()).toContainText(
        "Owner: Agency coverage · Received 3 hr. ago · Next step: accept and reply",
      );
      // The seed wrote it 12 minutes before the read; allow the seconds the run itself takes.
      await expect(unassigned.last()).toContainText(/Received 1[23] min\. ago/);
      const due = page.getByRole("list", { name: "My overdue tasks" }).getByRole("link");
      await expect(due).toHaveAttribute("href", `/en/tasks/${f.due}`);
      await expect(due).toContainText(f.dueTitle);
      await expect(due).toContainText("Owner: Synthetic broker · Overdue since");
      await expect(due).toContainText("Promised to a client · Next step: record the outcome");
      const offered = page.getByRole("list", { name: "Awaiting my acceptance" }).getByRole("link");
      await expect(offered).toContainText(f.offeredTitle);
      await expect(offered).toContainText(
        "Owner: Agency coverage (Last accepted owner: Former synthetic broker) · Due",
      );
      await expect(offered).toContainText("Next step: accept or decline");
      await expect(
        page.getByRole("list", { name: "My open inquiries" }).getByRole("link"),
      ).toHaveAttribute("href", `/en/inquiries/${f.mine}`);

      // Butler only opens a reviewed draft path; with drafting off it says so and keeps the
      // manual path beside it.
      const butler = page.getByRole("complementary", { name: "Butler" });
      await expect(butler.getByRole("button", { name: "Prepare a proposal" })).toBeDisabled();
      await expect(
        butler.getByText("Draft generation is unavailable. Continue the manual workflow."),
      ).toBeVisible();
      await expect(butler.getByRole("link", { name: "Continue without Butler" })).toHaveAttribute(
        "href",
        `/en/inquiries/${f.oldest}`,
      );
      await expect(
        butler.getByText(
          "Butler drafts only for the selected record, in its own review. There is no open chat here.",
        ),
      ).toBeVisible();
      await expect(butler.getByRole("textbox")).toHaveCount(0);

      expect(await noOverflow(page)).toBe(true);
      await expectAccessible(page, javaScriptEnabled);
      await page.screenshot({
        path: testInfo.outputPath(`today-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      if (testInfo.project.name === "chromium-desktop") {
        await page.setViewportSize({ width: 1024, height: 900 });
        expect(await noOverflow(page)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`today-1024-${javaScriptEnabled}.png`),
          fullPage: true,
        });
      }

      for (const [name, url, rows] of [
        [/^Unassigned requests/, "/en/inquiries?view=unassigned", 2],
        [/^My open inquiries/, "/en/inquiries?view=mine", 1],
      ] as const) {
        await page.getByRole("link", { name }).click();
        await expect(page).toHaveURL(hostUrl("staff", url));
        await expect(page.locator("[data-inquiry-id]")).toHaveCount(rows);
        await page.goBack();
      }
      for (const [name, url, task] of [
        [/^My overdue tasks/, "/en/tasks?view=overdue", f.due],
        [/^Awaiting my acceptance/, "/en/tasks?view=handovers", f.offered],
      ] as const) {
        await page.getByRole("link", { name }).click();
        await expect(page).toHaveURL(hostUrl("staff", url));
        // The queue holds exactly the work the count covered.
        await expect(page.getByRole("main").locator('a[href^="/en/tasks/"]')).toHaveCount(1);
        await expect(page.locator(`a[href="/en/tasks/${task}"]`)).toBeVisible();
        await page.goBack();
      }
      await unassigned.first().click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(f.oldestReference);
    });

    test("O01 separates a day without work from more work than it lists", async ({
      page,
    }, testInfo) => {
      const f = seed("quiet");
      await open(page, f.emptyToken, "/en/today");
      await expect(page.getByText("Check the inquiries for new requests.")).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .getByRole("heading", { level: 2, name: "Nothing in today's lists needs action" }),
      ).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Butler" })).toHaveCount(0);
      await expect(groups(page)).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      await expectAccessible(page, javaScriptEnabled);
      await page.screenshot({
        path: testInfo.outputPath(`today-empty-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Open the inquiries" }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/inquiries"));

      await open(page, f.overloadToken, "/en/today");
      // The server counts the whole queue; Today loads its first thirty rows.
      await expect(
        page.getByText("Waiting for action: 31. Start at the top of the list."),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Unassigned requests/ })).toContainText(
        "In the queue: 31",
      );
      await expect(page.getByText("Requests without an owner: 31")).toBeVisible();
      await expect(
        page.getByText("Agency coverage holds them until someone accepts them.", { exact: false }),
      ).toContainText("The oldest arrived 4 hr. ago.");
      // The oldest five stay in view; the count and the queue link carry the rest.
      await expect(
        page.getByRole("list", { name: "Unassigned requests" }).getByRole("link"),
      ).toHaveCount(5);
      await expect(page.getByRole("link", { name: "More in this queue" })).toHaveAttribute(
        "href",
        "/en/inquiries?view=unassigned",
      );
      await expect(page.getByText("Nothing in today's lists needs action")).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      await expectAccessible(page, javaScriptEnabled);
      await page.screenshot({
        path: testInfo.outputPath(`today-overload-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Agency coverage", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/coverage"));
    });

    test("O01 counts an overdue follow-up of my own inquiry as waiting for action", async ({
      page,
    }) => {
      const f = seed("overdue");
      await open(page, f.overdueToken, "/en/today");
      // Review FIX: only my own inquiry holds work, and its follow-up is due.
      await expect(
        page.getByText("Overdue in your own work: 1. Start under “Continue from here”."),
      ).toBeVisible();
      await expect(page.getByText(/Nothing in today's lists/)).toHaveCount(0);
      await expect(page.locator("[data-today-state=empty]")).toHaveCount(0);
      await expect(groups(page)).toHaveText(["My open inquiriesIn the queue: 1"]);
      const mine = page.getByRole("list", { name: "My open inquiries" }).getByRole("link");
      await expect(mine).toHaveAttribute("href", `/en/inquiries/${f.overdue}`);
      await expect(mine).toContainText("Overdue since");
      await expect(page.locator('[data-today-quiet="attention"]')).toContainText(
        "Nothing waiting: Unassigned requests · My overdue tasks · Awaiting my acceptance",
      );
      await expectAccessible(page, javaScriptEnabled);
    });

    test("O01 phone layout keeps the Figma 390 padding of 20 px down to 320 px", async ({
      page,
    }, testInfo) => {
      const f = seed("overdue");
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await open(page, f.overdueToken, "/en/today");
        const main = await page.getByRole("main").boundingBox();
        const heading = await page
          .getByRole("main")
          .getByRole("heading", { level: 1 })
          .boundingBox();
        const scope = await page.getByRole("navigation", { name: "Work scope" }).boundingBox();
        if (!main || !heading || !scope) throw new Error("Today did not render its frame");
        // Page content p-20 (Figma 14:4354): top and both sides, from the gutter token.
        expect(Math.round(heading.y - main.y)).toBe(20);
        expect(Math.round(heading.x - main.x)).toBe(20);
        expect(Math.round(main.x + main.width - (scope.x + scope.width))).toBe(20);
        expect(await noOverflow(page)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`today-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
      }
    });
  });

test("O01 speaks Bulgarian and Russian", async ({ page }) => {
  const f = seed("ordinary");
  for (const [locale, greeting, tabs, groupNames] of [
    [
      "bg",
      /^(Добро утро|Добър ден|Добър вечер), Synthetic broker\.$/,
      ["За действие", "Моите задачи"],
      [
        "Неразпределени запитванияВ опашката: 2",
        "Моите просрочени задачиВ опашката: 1",
        "Очакващи моето приеманеВ опашката: 1",
        "Моите отворени запитванияВ опашката: 1",
      ],
    ],
    [
      "ru",
      /^(Доброе утро|Добрый день|Добрый вечер), Synthetic broker\.$/,
      ["К действию", "Мои задачи"],
      [
        "Запросы без исполнителяВ очереди: 2",
        "Мои просроченные задачиВ очереди: 1",
        "Ожидают моего принятияВ очереди: 1",
        "Мои открытые обращенияВ очереди: 1",
      ],
    ],
  ] as const) {
    await open(page, f.token, `/${locale}/today`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(greeting);
    await expect(page.getByRole("main").getByRole("navigation").getByRole("link")).toHaveText([
      ...tabs,
    ]);
    await expect(groups(page)).toHaveText([...groupNames]);
  }
});
