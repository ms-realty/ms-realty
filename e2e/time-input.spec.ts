import { expect, test } from "@playwright/test";
import { fillAgencyInstant } from "./time";

for (const javaScriptEnabled of [true, false]) {
  test(`native date-time fixture input preserves zero and nonzero seconds, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    try {
      const page = await context.newPage();
      await page.setContent(
        '<label>Recorded instant <input type="datetime-local" step="1"></label>',
      );
      const input = page.getByLabel("Recorded instant", { exact: true });
      const year = new Date().getUTCFullYear() + 1;
      for (const second of [0, 1]) {
        const instant = new Date(Date.UTC(year, 0, 15, 8, 0, second));
        await fillAgencyInstant(input, instant, "second");
        await expect(input).toHaveValue(`${year}-01-15T10:00${second ? ":01" : ""}`);
      }
    } finally {
      await context.close();
    }
  });
}
