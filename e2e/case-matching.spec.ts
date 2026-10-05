// O07 matching workbench (design/contracts/o07.md, W05/F21): frames read from the server, the
// single-property check and the add, with and without JavaScript. Synthetic, isolated fixtures;
// product-path evidence only, not live release proof.
import { execFileSync } from "node:child_process";
import { type Browser, expect, type Page, type TestInfo, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Matching browser tests require the generated disposable database.");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

type ListSeed = {
  staffToken: string;
  brokerName: string;
  clientName: string;
  placeName: string;
  caseId: string;
  briefRevision: number;
  refs: Record<"match" | "needs" | "negotiating" | "reserved" | "onList" | "noMatch", string>;
  onListInterestId: string;
};
type RequirementsSeed = {
  staffToken: string;
  clientName: string;
  placeName: string;
  missingCaseId: string;
  kindCaseId: string;
  emptyCaseId: string;
  needsCaseId: string;
  needsRef: string;
};

function seed<T>(mode: "list" | "requirements" | "revise", extra: Record<string, string> = {}) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/case-matching-seed.ts"],
      {
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
          O07_SEED: mode,
          ...extra,
        },
        encoding: "utf8",
      },
    ),
  ) as T;
}

async function staffPage(
  browser: Browser,
  testInfo: TestInfo,
  token: string,
  javaScriptEnabled: boolean,
  viewport?: { width: number; height: number },
) {
  const context = await browser.newContext({
    ...testInfo.project.use,
    javaScriptEnabled,
    ...(viewport ? { viewport } : {}),
  });
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return { context, page: await context.newPage() };
}

const at = (path: string) => hostUrl("staff", path);
const exact = { exact: true } as const;
/** Intl money and dates use no-break spaces; compare the words, not the space characters. */
const words = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
}

async function saved(caseId: string, reference: string) {
  return db
    .select({ id: schema.interests.id, explanation: schema.interests.fitExplanation })
    .from(schema.interests)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.interests.listingId))
    .where(and(eq(schema.interests.caseId, caseId), eq(schema.listings.reference, reference)));
}

/**
 * The page may say "added" only when the server recorded the property, once. Until the cases
 * Server Action passes `matchReview` to `addInterest`, the command refuses the add and the page
 * must say that nothing was added.
 */
async function expectTruthfulAdd(
  page: Page,
  caseId: string,
  reference: string,
  explanation: string,
) {
  const addedHeading = page.getByRole("heading", { name: `${reference} е в списъка на клиента` });
  const notAdded = page.getByText("Не е добавен", exact);
  await expect(addedHeading.or(notAdded).first()).toBeVisible();
  const rows = await saved(caseId, reference);
  if (rows.length) {
    expect(rows).toHaveLength(1);
    expect(rows[0]?.explanation).toEqual([explanation]);
    await expect(addedHeading).toBeVisible();
    await expect(page.getByText("Добавен в списъка на клиента", exact)).toBeVisible();
    await expect(page.getByText(/ · Europe\/Sofia$/).first()).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: explanation })).toBeVisible();
  } else {
    await expect(notAdded).toBeVisible();
    await expect(page.getByRole("heading", { name: /е в списъка на клиента/ })).toHaveCount(0);
    await expect(page.getByRole("definition").filter({ hasText: explanation })).toBeVisible();
  }
  return rows.length > 0;
}

for (const javaScriptEnabled of [true, false]) {
  test(`O07 requirements missing, of the other kind and without matches, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const f = seed<RequirementsSeed>("requirements");
    const { context, page } = await staffPage(browser, testInfo, f.staffToken, javaScriptEnabled, {
      width: 320,
      height: 844,
    });
    try {
      await page.goto(at(`/bg/cases/${f.missingCaseId}/matching`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Подбор на имоти за ${f.clientName}`,
      );
      await expect(
        page.getByText(
          "Още не можем да търсим: не е записано какво търси клиентът или записът е непълен.",
          exact,
        ),
      ).toBeVisible();
      for (const line of [
        "Задължително: покупка или наем.",
        "Препоръчително: район, бюджет и вид имот. Без тях списъкът е твърде широк.",
        "Ако е важно: спални, площ и удобства, без които не може, например асансьор.",
        `Запишете какво търси ${f.clientName}. След това тук ще видите подходящите имоти.`,
      ])
        await expect(page.getByText(line, exact)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Попълнете какво търси клиентът", exact: true }),
      ).toHaveAttribute("href", `/bg/cases/${f.missingCaseId}#case-brief`);
      await noOverflow(page);

      await page.goto(at(`/bg/cases/${f.kindCaseId}/matching`));
      await expect(
        page.getByText(
          "Какво търси клиентът е записано за наем, а тази сделка е покупка. Показваме имоти само когато двете съвпадат.",
          exact,
        ),
      ).toBeVisible();
      await expect(
        page.getByText(words(`Записано: Наем · апартамент · ${f.placeName} · до 130 000 €`)),
      ).toBeVisible();
      await expect(page.getByText(`Сделката: покупка в ${f.placeName}.`, exact)).toBeVisible();
      await expect(
        page.getByText(
          "Поправете в какво търси клиентът „наем“ на „покупка“ или проверете дали сте в правилната сделка.",
          exact,
        ),
      ).toBeVisible();
      await noOverflow(page);

      await page.goto(at(`/bg/cases/${f.emptyCaseId}/matching`));
      await expect(
        page.getByRole("heading", { name: "Няма имоти, които отговарят", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/^Проверихме всички публикувани обяви в \d{1,2}:\d{2} · Europe\/Sofia\.$/),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Попитайте ${f.clientName} какво да промени`, exact: true }),
      ).toHaveAttribute("href", `/bg/cases/${f.emptyCaseId}#case-conversation`);
      await noOverflow(page);

      // O07NEEDSCONF: nothing fully confirmed; confirm first, starting with the open property.
      await page.goto(at(`/bg/cases/${f.needsCaseId}/matching`));
      await expect(page.getByText("Намерен 1 имот · показани 1", exact)).toBeVisible();
      await expect(
        page.getByText(
          "Няма имот, за който всичко е потвърдено. Този имот може да отговаря, но за него липсват факти.",
          exact,
        ),
      ).toBeVisible();
      for (const line of [
        "1. Попитайте продавача или колегата, който води обявата.",
        "2. Запишете отговора при фактите за имота.",
        "3. Проверете имота отново тук.",
        `Потвърдете липсващите факти, преди да предложите имот. Започнете с ${f.needsRef}.`,
      ])
        await expect(page.getByText(line, exact)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Трябва да се потвърди · 1", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Проверете ${f.needsRef}`, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /Отговарят на всичко/ })).toHaveCount(0);
      await noOverflow(page);

      for (const [locale, heading] of [
        ["en", `Property matching for ${f.clientName}`],
        ["ru", `Подбор объектов для ${f.clientName}`],
      ] as const) {
        await page.goto(at(`/${locale}/cases/${f.missingCaseId}/matching`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
        await noOverflow(page);
      }
    } finally {
      await context.close();
    }
  });

  test(`O07 list, property checks and the add readback, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const f = seed<ListSeed>("list");
    const { context, page } = await staffPage(browser, testInfo, f.staffToken, javaScriptEnabled);
    const list = `/bg/cases/${f.caseId}/matching`;
    const check = (reference: string) =>
      at(`${list}?property=${reference}&revision=${f.briefRevision}`);
    try {
      // O05: the raw reference form is gone; the deal links into the workbench and anchors rows.
      await page.goto(at(`/en/cases/${f.caseId}`));
      await expect(page.getByLabel("Listing reference", exact)).toHaveCount(0);
      await expect(page.locator(`#interest-${f.onListInterestId}`)).toContainText(f.refs.onList);
      await page.goto(at(`/bg/cases/${f.caseId}`));
      await page
        .getByRole("link", { name: "Вижте подходящите имоти", exact: true })
        .first()
        .click();
      await expect(page).toHaveURL(at(list));

      // O07READY: confirmed and needs-confirmation groups, server statuses only.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Подбор на имоти за ${f.clientName}`,
      );
      await expect(
        page.getByRole("heading", { name: `Какво търси ${f.clientName}`, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(words(`Покупка · апартамент · ${f.placeName} · до 130 000 €`)),
      ).toBeVisible();
      await expect(page.getByText(`${f.clientName} още не е потвърдил това.`, exact)).toBeVisible();
      await expect(page.getByText("Намерени 5 имота · показани 5", exact)).toBeVisible();
      await expect(
        page.getByText(/^Обявите са проверени в \d{1,2}:\d{2} · Europe\/Sofia\.$/),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Отговарят на всичко · 4", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Трябва да се потвърди · 1", exact: true }),
      ).toBeVisible();
      const row = (reference: string) => page.locator(`#match-${reference}`);
      await expect(row(f.refs.needs)).toContainText("Не е известно: наличност");
      await expect(row(f.refs.match)).toContainText("Наличност: Свободен");
      await expect(row(f.refs.negotiating)).toContainText("Наличност: В процес на договаряне");
      await expect(row(f.refs.reserved)).toContainText("Наличност: Резервиран");
      await expect(row(f.refs.onList)).toContainText("Вече е в списъка на клиента");
      await expect(
        row(f.refs.onList).getByRole("link", { name: `Отворете ${f.refs.onList} в сделката` }),
      ).toHaveAttribute("href", `/bg/cases/${f.caseId}#interest-${f.onListInterestId}`);
      await expect(row(f.refs.onList).getByRole("link", { name: /Проверете/ })).toHaveCount(0);
      await expect(
        row(f.refs.needs).getByRole("link", { name: `Проверете ${f.refs.needs}` }),
      ).toBeVisible();
      await expect(page.getByText(/Потвърдено:/)).toHaveCount(0);
      await expect(page.getByText(f.refs.noMatch)).toHaveCount(0);
      await expect(page.getByText("Това са всички намерени имоти.", exact)).toBeVisible();
      await page.setViewportSize({ width: 320, height: 844 });
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`o07-ready-320-js-${javaScriptEnabled}.png`),
        fullPage: true,
      });

      // O07CHECKNOMATCH: the violation first, nothing claimed about the rest, no add.
      await page.goto(check(f.refs.noMatch));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Имот ${f.refs.noMatch} за ${f.clientName}`,
      );
      await expect(page.getByText("Не отговаря", exact)).toBeVisible();
      await expect(page.getByText("Не отговаря на", exact)).toBeVisible();
      await expect(
        page.getByText(words("Цена: 135 000 € — над бюджета до 130 000 €.")),
      ).toBeVisible();
      await expect(
        page.getByText("Другото не е проверено докрай, защото цената вече не отговаря.", exact),
      ).toBeVisible();
      await expect(
        page.getByText(
          `Да предложите имот, който не отговаря, като изрична алтернатива, още не може оттук. Ако ${f.clientName} иска друго, първо променете какво търси клиентът.`,
          exact,
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Добавете/ })).toHaveCount(0);
      await expect(
        page.getByText(
          `${f.refs.noMatch} не отговаря на цената. Върнете се към списъка и изберете друг имот.`,
          exact,
        ),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`o07-check-nomatch-320-js-${javaScriptEnabled}.png`),
        fullPage: true,
      });

      // O07CHECKNEEDS: availability unknown, confirm first, no add.
      await page.goto(check(f.refs.needs));
      await expect(
        page.getByText("Наличност: не знаем дали имотът още се продава.", exact),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Добавете имота в списъка на клиента, след като наличността е потвърдена.",
          exact,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Потвърдете наличността", exact: true }),
      ).toHaveAttribute("href", `/bg/inventory/${f.refs.needs}#inventory-readiness`);
      await expect(page.getByRole("button", { name: /Добавете/ })).toHaveCount(0);

      // O07CHECKNEGOTIATING: the listing's actual status, never a plain «confirmed».
      await page.goto(check(f.refs.negotiating));
      await expect(page.getByText("Наличност: В процес на договаряне", exact)).toBeVisible();
      await expect(
        page.getByText(
          `Има започнали преговори за имота. Можете да го предложите, но кажете на ${f.clientName}.`,
          exact,
        ),
      ).toBeVisible();
      await expect(page.getByText(/потвърдена|Свободен/)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: `Добавете ${f.refs.negotiating} в списъка на клиента` }),
      ).toBeVisible();

      // O07ONLIST: a saved property opens on its own row of the deal, never a second add.
      await page.goto(check(f.refs.onList));
      await expect(page.getByText("Вече е в списъка на клиента", exact)).toBeVisible();
      await expect(
        page.getByText(
          "Имотът вече е в списъка на клиента. Не е нужно да го добавяте отново.",
          exact,
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Добавете/ })).toHaveCount(0);
      await page
        .getByRole("link", { name: `Отворете ${f.refs.onList} в сделката`, exact: true })
        .click();
      await expect(page).toHaveURL(at(`/bg/cases/${f.caseId}#interest-${f.onListInterestId}`));
      await expect(page.locator(`#interest-${f.onListInterestId}`)).toBeVisible();

      // O07UNAVAILABLE / O07NOTFOUND: say only what the server said; nothing to add.
      await page.goto(check("MS-000000000001"));
      await expect(page.getByText("Не е добавен", exact)).toBeVisible();
      await expect(
        page.getByText("Обявата вече не е публикувана. Имотът не е добавен.", exact),
      ).toBeVisible();
      await expect(page.getByText("Изберете друг имот от списъка с имоти.", exact)).toBeVisible();
      await expect(page.getByRole("button", { name: /Добавете/ })).toHaveCount(0);
      await page.goto(check("NOT-A-LISTING"));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Имотът не е достъпен");
      await expect(
        page.getByText(
          "Имотът не е достъпен или нямате достъп до него. Нищо не е добавено.",
          exact,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Към списъка с имоти", exact: true }),
      ).toBeVisible();

      // O07CHECKMATCH → add: an empty explanation keeps the form; then only the readback counts.
      await page.goto(at(list));
      await page
        .getByRole("link", { name: `Проверете и добавете ${f.refs.match}`, exact: true })
        .click();
      await expect(page.getByText("Наличност: Свободен", exact)).toBeVisible();
      await expect(page.getByText("Няма факти за потвърждаване.", exact)).toBeVisible();
      await expect(
        page.getByText(
          `${f.clientName} вижда това обяснение. Пишете само за имота; бележките ви за това какво търси той остават вътрешни.`,
          exact,
        ),
      ).toBeVisible();
      const add = page.getByRole("button", {
        name: `Добавете ${f.refs.match} в списъка на клиента`,
        exact: true,
      });
      await add.click();
      await expect(
        page.getByText("Напишете обяснението за клиента: от 3 до 1500 знака.").first(),
      ).toBeVisible();
      expect(await saved(f.caseId, f.refs.match)).toHaveLength(0);
      const explanation = "Светъл двустаен апартамент в Сандански, в рамките на бюджета.";
      await page.getByRole("textbox", { name: /Обяснение за клиента/ }).fill(explanation);
      await add.click();
      if (await expectTruthfulAdd(page, f.caseId, f.refs.match, explanation)) {
        await page.reload();
        await expect(page.getByText("Вече е в списъка на клиента", exact)).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test(`O07 a changed requirement keeps the explanation and rechecks, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const f = seed<ListSeed>("list");
    const { context, page } = await staffPage(browser, testInfo, f.staffToken, javaScriptEnabled, {
      width: 320,
      height: 844,
    });
    try {
      await page.goto(
        at(`/bg/cases/${f.caseId}/matching?property=${f.refs.match}&revision=${f.briefRevision}`),
      );
      const explanation = "Тих квартал, асансьор и паркомясто към имота.";
      await page.getByRole("textbox", { name: /Обяснение за клиента/ }).fill(explanation);
      seed("revise", { O07_CASE_ID: f.caseId, O07_STAFF_TOKEN: f.staffToken });
      await page
        .getByRole("button", { name: `Добавете ${f.refs.match} в списъка на клиента`, exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Някой е променил това междувременно",
      );
      await expect(
        page.getByText(
          `Докато проверявахте, е променено какво търси клиентът. Затова ${f.refs.match} не е добавен в списъка на клиента.`,
          exact,
        ),
      ).toBeVisible();
      await expect(page.getByRole("definition").filter({ hasText: explanation })).toBeVisible();
      await expect(
        page.getByText(
          "Обяснението е запазено. Проверката ще покаже дали имотът отговаря на новото.",
          exact,
        ),
      ).toBeVisible();
      expect(await saved(f.caseId, f.refs.match)).toHaveLength(0);
      await noOverflow(page);
      await page.getByText(`Проверете ${f.refs.match} отново`, exact).click();
      const recheck = page.locator("details");
      await expect(
        recheck.getByRole("heading", { name: `Имот ${f.refs.match} за ${f.clientName}` }),
      ).toBeVisible();
      await expect(recheck.getByRole("textbox", { name: /Обяснение за клиента/ })).toHaveValue(
        explanation,
      );
      await recheck
        .getByRole("button", { name: `Добавете ${f.refs.match} в списъка на клиента`, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Някой е променил това междувременно" }),
      ).toHaveCount(0);
      await expectTruthfulAdd(page, f.caseId, f.refs.match, explanation);

      // O07STALE: links of the list read before the change offer a refresh, never a snapshot.
      const loaded = new Date().toISOString();
      for (const path of [
        `/bg/cases/${f.caseId}/matching?revision=${f.briefRevision}&at=${loaded}`,
        `/bg/cases/${f.caseId}/matching?property=${f.refs.needs}&revision=${f.briefRevision}&at=${loaded}`,
      ]) {
        await page.goto(at(path));
        await expect(
          page.getByText(
            /^Списъкът е зареден в \d{1,2}:\d{2} · Europe\/Sofia\. Оттогава обявите или това, което търси клиентът, са променени\.$/,
          ),
        ).toBeVisible();
        await expect(
          page.getByText("Обновете списъка, преди да добавяте имоти. Нищо не е добавено.", exact),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Обновете списъка", exact: true }),
        ).toHaveAttribute("href", `/bg/cases/${f.caseId}/matching`);
        await expect(page.getByRole("button", { name: /Добавете/ })).toHaveCount(0);
      }

      if (javaScriptEnabled) {
        // O07ADDOFFLINE: nothing leaves the browser; the same request goes when back online.
        await page.goto(at(`/bg/cases/${f.caseId}/matching`));
        await page
          .getByRole("link", { name: `Проверете и добавете ${f.refs.negotiating}`, exact: true })
          .click();
        const offlineText = "Предлагаме го въпреки започналите преговори.";
        await page.getByRole("textbox", { name: /Обяснение за клиента/ }).fill(offlineText);
        await context.setOffline(true);
        await page
          .getByRole("button", { name: `Добавете ${f.refs.negotiating} в списъка на клиента` })
          .click();
        await expect(
          page.getByText(
            "Връзката прекъсна преди изпращането. Нищо не е добавено. При нов опит изпращаме същата заявка.",
            exact,
          ),
        ).toBeVisible();
        await expect(page.getByText("Не е изпратено", exact)).toBeVisible();
        await expect(page.getByRole("textbox", { name: /Обяснение за клиента/ })).toHaveValue(
          offlineText,
        );
        expect(await saved(f.caseId, f.refs.negotiating)).toHaveLength(0);
        await context.setOffline(false);
        await page.getByRole("button", { name: "Опитайте отново", exact: true }).click();
        await expectTruthfulAdd(page, f.caseId, f.refs.negotiating, offlineText);

        // O07ADDUNKNOWN: the answer is lost after sending; only the same request is checked.
        await page.goto(at(`/bg/cases/${f.caseId}/matching`));
        await page
          .getByRole("link", { name: `Проверете и добавете ${f.refs.reserved}`, exact: true })
          .click();
        await expect(page.getByText("Наличност: Резервиран", exact)).toBeVisible();
        await expect(
          page.getByText("Имотът е резервиран. Предложете го само като резервен вариант.", exact),
        ).toBeVisible();
        const lostText = "Предлагаме го като резервен вариант.";
        await page.getByRole("textbox", { name: /Обяснение за клиента/ }).fill(lostText);
        const posted: string[] = [];
        let lose = true;
        await page.route(
          (target) => target.pathname.endsWith("/matching"),
          async (route) => {
            if (route.request().method() !== "POST") return route.continue();
            posted.push(route.request().postData() ?? "");
            if (!lose) return route.continue();
            lose = false;
            // The server records the request; only its answer is lost on the way back.
            await route.fetch();
            await route.abort("connectionreset");
          },
        );
        await page
          .getByRole("button", { name: `Добавете ${f.refs.reserved} в списъка на клиента` })
          .click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          `Още не знаем дали ${f.refs.reserved} е добавен`,
        );
        await expect(page.getByText("Още не е потвърдено", exact)).toBeVisible();
        await expect(page.getByRole("textbox", { name: /Обяснение за клиента/ })).toHaveValue(
          lostText,
        );
        await page.getByRole("button", { name: "Проверете същата заявка", exact: true }).click();
        await expectTruthfulAdd(page, f.caseId, f.refs.reserved, lostText);
        // The check replays the same operation: one key, at most one saved property.
        const keys = posted.map((body) => body.match(/_operationId"\r?\n\r?\n([^\r\n]+)/)?.[1]);
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBeTruthy();
        expect(keys[1]).toBe(keys[0]);
      }
    } finally {
      await context.close();
    }
  });
}
