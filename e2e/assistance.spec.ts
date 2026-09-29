// O32/AT51–AT54: synthetic draft through actual source authorization and review UI.
// Provider qualification is separate; no live model is called by this test.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Assistance browser tests require disposable DB");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function fixture(assessment = false) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/ai/testing/seed.ts",
        ...(assessment ? ["jev"] : []),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  ) as { id: string; sourceId: string; actorId: string; token: string };
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`typed assessment with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("O32: Jev uncertainty remains visible and human review retains authority at 320px", async ({
      context,
      page,
    }, testInfo) => {
      const data = fixture(true);
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: data.token,
          url: origins.staff,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      await page.setViewportSize({ width: 320, height: 800 });
      for (const [locale, heading] of [
        ["bg", "Автоматична оценка на черновата"],
        ["ru", "Автоматическая оценка черновика"],
        ["en", "Automated draft assessment"],
      ]) {
        await page.goto(hostUrl("staff", `/${locale}/operations/assistance/${data.id}`));
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          textOverflow: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter(
              (el) =>
                el.getClientRects().length &&
                getComputedStyle(el).overflowX === "visible" &&
                el.scrollWidth > el.clientWidth + 1,
            )
            .slice(-12)
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              width: el.clientWidth,
              scroll: el.scrollWidth,
              text: el.textContent?.slice(0, 100),
            })),
          overflow: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter(
              (el) =>
                el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1,
            )
            .slice(0, 12)
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              right: el.getBoundingClientRect().right,
              text: el.textContent?.slice(0, 80),
            })),
        }));
        expect(layout.scroll <= layout.width, `${locale}: ${JSON.stringify(layout)}`).toBe(true);
      }
      const panel = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Automated draft assessment", exact: true }),
      });
      const brand = page.locator('header img[src="/brand/logo-ms-realty.png"]:visible');
      await expect(brand).toHaveCount(1);
      expect(
        await brand.evaluate((element) => {
          const image = element as HTMLImageElement;
          const rect = image.getBoundingClientRect();
          return (
            image.complete &&
            image.naturalWidth === 172 &&
            image.naturalHeight === 88 &&
            Math.abs(rect.width / rect.height - 172 / 88) < 0.01
          );
        }),
      ).toBe(true);
      await page
        .locator("header:visible")
        .screenshot({ path: testInfo.outputPath("authentic-workspace-header-320.png") });
      await expect(panel).toContainText("Insufficient evidence");
      await panel.getByText("Assessment details", { exact: true }).click();
      await expect(panel).toContainText("typesafe/jev-1.13-20260917");
      await expect(panel).toContainText("10%");
      await expect(panel).toContainText("1.50");
      await panel.screenshot({ path: testInfo.outputPath("jev-assessment-320.png") });
      const read = async () =>
        (
          await db.select().from(schema.assistanceRuns).where(eq(schema.assistanceRuns.id, data.id))
        )[0];
      expect(await read()).toMatchObject({
        state: "draft",
        reviewedAt: null,
        actualCostMicros: 170,
      });
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record review", exact: true }).click();
      await expect.poll(async () => (await read())?.state).toBe("accepted");
      expect((await read())?.reviewedById).toBe(data.actorId);
    });
  });
}

test("O32: human review stays source-bound; disabled provider and real queue status preserve manual work", async ({
  context,
  page,
}, testInfo) => {
  const data = fixture();
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: data.token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", `/en/operations/assistance?source=${data.sourceId}`));
  await expect(
    page.getByText("Draft generation is unavailable. Continue the manual workflow."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Request a draft" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open draft status" }).click();
  await expect(
    page.getByText("Synthetic draft: you asked about 2 bedrooms.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("withheld@example.test", { exact: false })).toHaveCount(0);
  const source = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Included source", exact: true }),
  });
  await expect(source).toContainText("Synthetic visitor asks about 2 bedrooms.");
  const draft = page.getByRole("heading", { name: "Proposed text", exact: true });
  const sourceBox = await source.boundingBox();
  const draftBox = await draft.boundingBox();
  if (!sourceBox || !draftBox) throw new Error("Source or draft not rendered");
  expect(sourceBox.y).toBeLessThan(draftBox.y);
  await page.screenshot({
    path: testInfo.outputPath("assistance-source-review.png"),
    fullPage: true,
  });
  await expect(page.getByText("synthetic-fixture-model", { exact: true })).toBeHidden();
  await page.getByText("Generation details", { exact: true }).click();
  await expect(page.getByText("synthetic-fixture-model", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open the inquiry", exact: true }).click();
  await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${data.sourceId}`));
  await page.goto(hostUrl("staff", `/en/operations/assistance/${data.id}`));

  const stale = await context.newPage();
  await stale.goto(hostUrl("staff", `/en/operations/assistance/${data.id}`));
  await stale.getByRole("checkbox").check();
  await db
    .update(schema.inquiries)
    .set({ version: 2, message: "Synthetic changed source" })
    .where(eq(schema.inquiries.id, data.sourceId));
  await stale.getByRole("button", { name: "Record review" }).click();
  await expect(
    stale
      .getByText(
        "The source changed. This draft cannot be accepted. Review the current inquiry and request a fresh draft.",
      )
      .first(),
  ).toBeVisible();
  expect(
    (await db.select().from(schema.assistanceRuns).where(eq(schema.assistanceRuns.id, data.id)))[0]
      ?.state,
  ).toBe("draft");
  await page.goto(hostUrl("staff", "/en/operations/jobs"));
  await expect(page.getByRole("heading", { name: "Jobs and assistance status" })).toBeVisible();
  await expect(page.getByRole("row", { name: /ai.draft/ }).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("synthetic-operations-status.png"),
    fullPage: true,
  });
  await db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, data.actorId));
  await page.goto(hostUrl("staff", `/en/operations/assistance/${data.id}`));
  await expect(
    page.getByText("Synthetic draft: you asked about 2 bedrooms.", { exact: true }),
  ).toHaveCount(0);
  await stale.close();
});

for (const variant of ["locale", "intake"] as const) {
  test(`O32: ${variant} proposal review preserves manual authority and source evidence`, async ({
    context,
    page,
  }, testInfo) => {
    const data = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/features/ai/testing/proposal-seed.ts",
          variant,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            AUTH_SECRET: process.env.E2E_AUTH_SECRET,
            DATABASE_URL: url,
            CANONICAL_ORIGIN: "https://makler-realty.com",
          },
        },
      ).trim(),
    ) as { id: string; sourceId: string; listingId: string; reference: string; token: string };
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: data.token,
        url: origins.staff,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const before =
      variant === "intake"
        ? await db
            .select()
            .from(schema.propertyFacts)
            .where(eq(schema.propertyFacts.factRevisionId, data.sourceId))
        : [];
    await page.goto(
      hostUrl(
        "staff",
        `/en/operations/assistance/${variant}?${new URLSearchParams({ reference: data.reference, ...(variant === "locale" ? { language: "en" } : {}) })}`,
      ),
    );
    await expect(
      page.getByText("Draft generation is unavailable. Continue the manual workflow."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Request a draft" })).toHaveCount(0);
    await page.getByRole("link", { name: "Open draft status", exact: true }).click();
    if (variant === "locale") {
      await expect(
        page.getByRole("heading", { name: "Synthetic apartment translation", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open translation workbench", exact: true }),
      ).toHaveAttribute("href", `/en/inventory/${data.reference}/translations/en`);
    } else {
      await expect(
        page.getByRole("heading", { name: "Candidate facts — not approved facts", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("2 bedrooms", { exact: true })).toBeVisible();
      await expect(page.getByText("note [0, 10)", { exact: true })).toBeVisible();
      await expect(page.getByText("private@example.test", { exact: false })).toHaveCount(0);
    }
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(page.getByText("Request recorded", { exact: true })).toBeVisible();
    expect(
      (
        await db.select().from(schema.assistanceRuns).where(eq(schema.assistanceRuns.id, data.id))
      )[0]?.state,
    ).toBe("accepted");
    if (variant === "locale")
      expect(
        await db
          .select()
          .from(schema.localizedRevisions)
          .where(eq(schema.localizedRevisions.sourceRevisionId, data.sourceId)),
      ).toHaveLength(0);
    else
      expect(
        await db
          .select()
          .from(schema.propertyFacts)
          .where(eq(schema.propertyFacts.factRevisionId, data.sourceId)),
      ).toEqual(before);
    await page.screenshot({
      path: testInfo.outputPath(`synthetic-${variant}-proposal.png`),
      fullPage: true,
    });
  });
}
