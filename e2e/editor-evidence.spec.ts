// O12/O13 editor cutover evidence: full-page captures of every designed editor state at
// desktop and phone width, for side-by-side review against the Figma frames. Runs only with
// EDITOR_EVIDENCE=1; it asserts nothing beyond reaching each state.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

test.skip(!process.env.EDITOR_EVIDENCE, "evidence capture only");

const run = (script: string) =>
  JSON.parse(
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        AUTH_SECRET: process.env.E2E_AUTH_SECRET,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
      },
    }).trim(),
  );

async function signIn(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("editor states", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const shot = (name: string) =>
    page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const f = run("e2e/support/listing-edit-seed.ts") as {
    token: string;
    reference: string;
    blank: { reference: string };
    bgn: { reference: string };
  };
  await signIn(page, f.token);
  const bg = (path: string) => hostUrl("staff", `/bg/inventory/${path}`);

  // O12 Text and Facts.
  await page.goto(bg(f.reference));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot("o12-text");
  await page.goto(bg(`${f.reference}?tab=facts`));
  await shot("o12-facts");
  // O12NEEDS and its rejected save.
  await page.goto(bg(f.bgn.reference));
  await shot("o12-needs");
  await page.getByRole("button", { name: "Запишете описанието", exact: true }).click();
  await expect(page.getByText("Попълнете това поле.").first()).toBeVisible();
  await shot("o12-needs-errors");
  // O12LEAVE.
  await page.goto(bg(f.reference));
  await page
    .getByLabel("Описание", { exact: false })
    .first()
    .fill("Синтетична незаписана промяна.");
  await page.getByRole("link", { name: "Снимки", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot("o12-leave");
  // O12SAVED.
  await page.getByRole("dialog").getByRole("button").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Работната чернова е записана" }),
  ).toBeVisible();
  await shot("o12-saved");
  // O16 review for publication.
  await page.goto(bg(`${f.reference}?tab=review`));
  await shot("o16-review");

  // O13 media order and its saved state.
  const m = run("src/server/media/order-browser-seed.ts") as { token: string; reference: string };
  await signIn(page, m.token);
  await page.goto(bg(`${m.reference}/media`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot("o13-media");
  await page
    .getByRole("link", { name: /надолу/i })
    .first()
    .click();
  await shot("o13-order");
  await page.getByRole("button", { name: /Запишете подредбата/i }).click();
  await shot("o13-saved");
});
