// Visual regression of every Storybook story (docs/ux-spec.md §23.3) in bg, en and he at 390
// and 1440 px (playwright.visual.config.ts projects). Reads the built story index, so run
// `npm run storybook:build` first. A story opts out with the tag `!visual`.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type IndexEntry = { id: string; type: "story" | "docs"; tags?: string[] };

const index = JSON.parse(readFileSync("storybook-static/index.json", "utf8")) as {
  entries: Record<string, IndexEntry>;
};
const stories = Object.values(index.entries).filter(
  (entry) => entry.type === "story" && !entry.tags?.includes("!visual"),
);
const locales = ["bg", "en", "he"] as const;

declare global {
  interface Window {
    __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
  }
}

for (const story of stories) {
  for (const locale of locales) {
    test(`${story.id} ${locale}`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale}`);
      // The play function (hover, focus, open) has finished once the render completes.
      const phase = await page.waitForFunction(() => {
        const current = window.__STORYBOOK_PREVIEW__?.currentRender?.phase;
        return current === "finished" || current === "errored" ? current : false;
      });
      expect(await phase.jsonValue()).toBe("finished");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${story.id}--${locale}.png`, { fullPage: true });
    });
  }
}
