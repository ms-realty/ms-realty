// P21 / F09 / M-072: these are preserved source identities, not new content fixtures
// or authority for current availability, translation, indexability or media rights.
import { expect, test } from "@playwright/test";
import { hostUrl } from "./hosts";

const cases = [
  { locale: "en", id: "0060c155d560ff91e51b4193", kind: "listing" },
  { locale: "en", id: "1b78f029a9e6cf185268e61a", kind: "page" },
  { locale: "bg", id: "49bedd92a43a06d767046abe", kind: "post" },
  { locale: "bg", id: "042922f874af5e9cf3f6092d", kind: "taxonomy" },
];

for (const javaScriptEnabled of [true, false]) {
  test.describe(`P21 archive with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("M-072: listing, page, article and collection keep truthful context and native recovery", async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name.includes("mobile"))
        await page.setViewportSize({ width: 320, height: 844 });
      // Explicit image-failure coverage: no claim that local Next serves gateway media.
      await page.route("**/legacy-media/**", (route) => route.abort());
      for (const item of cases) {
        const response = await page.goto(hostUrl("public", `/${item.locale}/legacy/${item.id}`));
        expect(response?.status()).toBe(200);
        const article = page.locator("article[data-legacy-source-hash]");
        await expect(article).toHaveAttribute("lang", item.locale);
        await expect(article).toHaveAttribute("dir", "ltr");
        await expect(article).toHaveAttribute("data-legacy-source-hash", /^[a-f0-9]{64}$/);
        await expect(article.locator("h1")).toBeVisible();
        await expect(article).not.toContainText(
          /Tweet|\[si-contact-form|\[email protected\]|Name Email Phone Message Send/u,
        );
        await expect(article.locator("form, input, button, script")).toHaveCount(0);
        const call = article.locator('a[href="tel:+359879696870"]');
        await expect(call).toBeVisible();
        await expect(call.locator("bdi")).toHaveText("+359879696870");
        await expect(article.locator(`a[href="/${item.locale}/properties"]`)).toBeVisible();
        const control = await call.boundingBox();
        expect(control?.height).toBeGreaterThanOrEqual(44);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
        if (item.kind === "listing") {
          await expect(article.locator("[data-legacy-source-facts]")).toBeVisible();
          await expect(
            article.getByText("Current availability and conditions are unconfirmed.", {
              exact: true,
            }),
          ).toBeVisible();
          const imageLink = article.getByRole("link", { name: /Open image 1$/u }).first();
          await expect(imageLink).toBeVisible();
          await expect(imageLink).toHaveAttribute("href", /^\/legacy-media\//u);
        }
        await page.screenshot({ path: testInfo.outputPath(`P21-${item.kind}.png`) });
      }
      await page.locator(`article a[href="/bg/properties"]`).click();
      await expect(page).toHaveURL(hostUrl("public", "/bg/properties"));
      // An unsupported edition of an existing archive stays absent; it does not
      // acquire a fabricated Hebrew translation or a sold-property explanation.
      const absent = await page.goto(hostUrl("public", `/he/legacy/${cases[0]?.id}`));
      expect(absent?.status()).toBe(404);
      await expect(page.locator("article[data-legacy-source-hash]")).toHaveCount(0);
    });
  });
}
