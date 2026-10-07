import type { Page } from "@playwright/test";
import { hostUrl } from "./hosts";

/**
 * Opens the unassigned inquiry queue on the page that holds `id`. The queue is oldest-first with
 * 30 rows per page (src/server/work/queries.ts), and earlier browser projects leave open inquiries
 * in the shared e2e database, so a new inquiry is not always on page 1.
 */
export async function openUnassignedQueueAt(page: Page, id: string, maxPages = 20) {
  for (let n = 1; n <= maxPages; n++) {
    await page.goto(hostUrl("staff", `/en/inquiries?view=unassigned&page=${n}`));
    if ((await page.locator(`[data-inquiry-id="${id}"]`).count()) > 0) return;
  }
}
