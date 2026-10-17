// O01 → O27, ported from Codex's 825091bf browser case onto the Figma Today screen. Delivery
// operations are agency-wide for report readers, so no grant scopes their count to this test's
// records. The parallel suite stays out of the count three ways: the case runs in one project
// only (three projects would each add 31 failed actions at once); counts are relative to the
// failed and unknown actions recorded just before seeding (no other spec writes any: browser
// runs have no worker, so actions stay queued); and its own rows are dated older than anything
// else, so they lead the oldest-first queue. A spec that starts writing failed actions must
// keep this one apart, for example in a project that runs after the others. Synthetic
// qualification over the run's disposable database, never launch evidence.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { inArray, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { hostUrl } from "./hosts";
import { staffSession, todayDatabase } from "./today-helpers";

const { connection, db } = todayDatabase();
test.afterAll(async () => {
  await connection.end();
});
test.use({ javaScriptEnabled: false });

test("O01 operator rows open their exact exception and the same queue reaches the 31st, without JavaScript", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Agency-wide count: one project only, so parallel projects do not add to it.",
  );
  const staff = await staffSession(db, context);
  await db.insert(schema.grants).values({
    principalId: staff.id,
    capability: "report.read",
    reason: "Today operator browser fixture",
  });
  const exceptions = inArray(schema.externalActions.state, ["failed", "outcome_unknown"]);
  const [counted] = await db
    .select({ before: sql<number>`count(*)::int` })
    .from(schema.externalActions)
    .where(exceptions);
  const before = counted?.before ?? 0;
  const at = (index: number) => new Date(Date.UTC(2001, 0, 1) + index * 1000);
  const actions = await db
    .insert(schema.externalActions)
    .values(
      Array.from({ length: 32 }, (_, index) => ({
        kind: "email_send" as const,
        effectKey: randomUUID(),
        payload: { recipient: "private-recipient@example.test" },
        payloadDigest: "synthetic-today",
        state: index === 31 ? ("attempting" as const) : ("failed" as const),
        attempts: 1,
        lastErrorCode: "private-provider-error",
        updatedAt: at(index),
        lastAttemptAt: at(index),
      })),
    )
    .returning();
  try {
    const first = actions[0],
      last = actions[30],
      attempting = actions[31];
    if (!first || !last || !attempting) throw new Error("Missing operator fixtures");
    const total = before + 31;
    await page.goto(hostUrl("staff", "/en/today"));
    await expect(
      page
        .getByRole("main")
        .getByText(`Waiting for action: ${total}. Start at the top of the list.`),
    ).toBeVisible();
    const today = page.locator('[data-today-group="delivery-operations"]');
    // The count opens the queue that O27 pages: the same failed and unknown actions.
    const heading = today.getByRole("heading", { level: 3 });
    await expect(heading).toHaveText(`Delivery operations to checkIn the queue: ${total}`);
    await expect(heading.getByRole("link")).toHaveAttribute(
      "href",
      "/en/operations/jobs?view=exceptions#external-action-exceptions",
    );
    await today.locator(`[data-delivery-operation="${first.id}"]`).getByRole("link").click();
    await expect(page).toHaveURL(
      hostUrl("staff", `/en/operations/jobs?action=${first.id}#external-action-${first.id}`),
    );
    const listed = page.locator("#external-action-exceptions");
    const rows = listed.locator('li[id^="external-action-"]');
    await expect(rows).toHaveCount(1);
    await expect(listed.locator(`#external-action-${first.id}`)).toContainText(
      "unclassified_error",
    );
    await expect(page.getByText(/private-recipient|private-provider-error/)).toHaveCount(0);

    await listed.getByRole("link", { name: "All exceptions", exact: true }).click();
    // Page 1 holds the thirty oldest: this test's first thirty, never the attempt in flight.
    await expect(rows).toHaveCount(30);
    await expect(rows.first()).toHaveAttribute("id", `external-action-${first.id}`);
    await expect(rows.last()).toHaveAttribute("id", `external-action-${actions[29]?.id}`);
    await expect(listed.locator(`#external-action-${last.id}`)).toHaveCount(0);
    await expect(listed.locator(`#external-action-${attempting.id}`)).toHaveCount(0);

    await listed.getByRole("link", { name: "Next exceptions", exact: true }).click();
    await expect(page).toHaveURL(
      hostUrl("staff", "/en/operations/jobs?view=exceptions&page=2#external-action-exceptions"),
    );
    await expect(rows.first()).toHaveAttribute("id", `external-action-${last.id}`);
    await expect(rows).toHaveCount(Math.min(30, total - 30));
    await expect(listed.locator(`#external-action-${attempting.id}`)).toHaveCount(0);
    await expect(
      listed.getByRole("link", { name: "Previous exceptions", exact: true }),
    ).toBeVisible();
    await expect(listed.getByRole("link", { name: "Next exceptions", exact: true })).toHaveCount(
      total > 60 ? 1 : 0,
    );
    await page.screenshot({
      path: testInfo.outputPath("today-operator-page-two.png"),
      fullPage: true,
    });
  } finally {
    await db.delete(schema.externalActions).where(
      inArray(
        schema.externalActions.id,
        actions.map((action) => action.id),
      ),
    );
  }
});
