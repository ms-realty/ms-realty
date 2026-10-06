// O01 Today against real PostgreSQL with synthetic, record-scoped records: contract order,
// counts that open their queues, rows with reason/owner/time/next step, the draft-only Butler
// entry, and truthful no-work and overload states. JavaScript on and off; BG, EN and RU. The
// mobile projects run every case at 390 px.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

type Seed = {
  token: string;
  emptyToken: string;
  overloadToken: string;
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
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/today-seed.ts"],
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

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O01 lists work in contract order and every count opens its queue", async ({
      page,
    }, testInfo) => {
      const f = seed();
      await open(page, f.token, "/en/today");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(
        /^Good (morning|afternoon|evening), Synthetic broker\.$/,
      );
      await expect(
        main.getByText("Waiting for action: 4. Start at the top of the list."),
      ).toBeVisible();
      await expect(groups(page)).toHaveText([
        "Unassigned requests2",
        "My overdue tasks1",
        "Awaiting my acceptance1",
        "My open inquiries1",
      ]);
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

      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
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
      await page.getByRole("link", { name: /^Awaiting my acceptance/ }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/tasks?view=handovers"));
      await expect(page.locator(`a[href="/en/tasks/${f.offered}"]`)).toBeVisible();
      await page.goBack();
      await unassigned.first().click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(f.oldestReference);
    });

    test("O01 separates a day without work from more work than it lists", async ({
      page,
    }, testInfo) => {
      const f = seed();
      await open(page, f.emptyToken, "/en/today");
      await expect(page.getByText("Check the inquiries for new requests.")).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .getByRole("heading", { level: 2, name: "Nothing needs action right now" }),
      ).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Butler" })).toHaveCount(0);
      await expect(groups(page)).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`today-empty-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Open the inquiries" }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/inquiries"));

      await open(page, f.overloadToken, "/en/today");
      await expect(
        page.getByText("Waiting for action: 30+. Start at the top of the list."),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Unassigned requests/ })).toContainText("30+");
      await expect(page.getByText("More than 30 requests have no owner")).toBeVisible();
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
      await expect(page.getByText("Nothing needs action right now")).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`today-overload-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Agency coverage", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/coverage"));
    });
  });

test("O01 speaks Bulgarian and Russian", async ({ page }) => {
  const f = seed();
  for (const [locale, greeting, tabs, groupNames] of [
    [
      "bg",
      /^(Добро утро|Добър ден|Добър вечер), Synthetic broker\.$/,
      ["За действие", "Моите задачи"],
      [
        "Неразпределени запитвания2",
        "Моите просрочени задачи1",
        "Очакващи моето приемане1",
        "Моите отворени запитвания1",
      ],
    ],
    [
      "ru",
      /^(Доброе утро|Добрый день|Добрый вечер), Synthetic broker\.$/,
      ["К действию", "Мои задачи"],
      [
        "Запросы без исполнителя2",
        "Мои просроченные задачи1",
        "Ожидают моего принятия1",
        "Мои открытые обращения1",
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
