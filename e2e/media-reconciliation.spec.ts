// O13/AT10/AT11: typed readback is a status check, not a fresh save/review/placement.
// Only synthetic records in the generated disposable browser database are used here.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type APIResponse, expect, type Page, type Route, test } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Media reconciliation requires the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
type Seed = { reference: string; listingId: string; relations: string[]; token: string };
type Kind = "details" | "review" | "placement";
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/media/order-browser-seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: databaseUrl,
        },
      },
    ).trim(),
  );
}
async function signIn(page: Page, f: Seed) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function snapshot(f: Seed) {
  const rows = await db
    .select({ asset: schema.mediaAssets, relation: schema.mediaRelations })
    .from(schema.mediaRelations)
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.mediaRelations.mediaAssetId))
    .where(eq(schema.mediaRelations.listingId, f.listingId))
    .orderBy(asc(schema.mediaRelations.position));
  const [listing] = await db
    .select()
    .from(schema.listings)
    .where(eq(schema.listings.id, f.listingId));
  const manifests = await db
    .select({ media: schema.publicationManifests.media })
    .from(schema.publicationManifests)
    .where(eq(schema.publicationManifests.listingId, f.listingId));
  return { rows, listing, manifests };
}
async function record(
  f: Seed,
  kind: Kind,
  status: "in_progress" | "failed" | "succeeded",
  photo = 0,
  key: string = randomUUID(),
) {
  const row = (await snapshot(f)).rows[photo];
  if (!row?.asset.reviewedById) throw new Error("Missing synthetic reviewed photo");
  await db.insert(schema.operations).values({
    actorKind: "staff",
    actorId: row.asset.reviewedById,
    idempotencyKey: key,
    operationType:
      kind === "details"
        ? "media.details.save"
        : kind === "review"
          ? "media.review"
          : "media.place",
    requestHash: "synthetic-reconciliation",
    status,
    resultType: kind === "placement" ? "media_relation" : "media_asset",
    resultId: kind === "placement" ? row.relation.id : row.asset.id,
    outcome: status === "failed" ? { code: "version_conflict" } : null,
  });
  return key;
}
function statusUrl(f: Seed, kind: Kind, key: string, photo = f.relations[0]) {
  return hostUrl(
    "staff",
    `/en/inventory/${f.reference}/media?photo=${photo}${kind === "review" ? "&panel=review" : ""}&operation=${key}&operationType=${kind}`,
  );
}
async function expectReadOnly(page: Page, key: string, url: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Outcome not yet confirmed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(key, { exact: true })).toBeVisible();
  const check = page.getByRole("link", { name: "Check the save result", exact: true });
  await expect(check).toBeVisible();
  expect(new URL((await check.getAttribute("href")) ?? "", page.url()).href).toBe(url);
  await expect(page.getByRole("main").locator("form")).toHaveCount(0);
  await expect(page.getByRole("main").locator('button[type="submit"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to the current task", exact: true }),
  ).toHaveCount(0);
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });
    for (const kind of ["details", "review", "placement"] as const) {
      test(`O13 ${kind} readback exposes no new command for unresolved or unmatched requests`, async ({
        page,
      }) => {
        const f = seed();
        await signIn(page, f);
        const pending = await record(f, kind, "in_progress");
        const unmatched = await record(f, kind, "failed", 1);
        const unproven = await record(f, kind, "succeeded");
        const checks = [
          { key: randomUUID() },
          { key: pending },
          { key: unmatched },
          { key: unproven },
          { key: "short" },
          { key: pending, photo: randomUUID() },
        ];
        const before = await snapshot(f);
        const actorId = before.rows[0]?.asset.reviewedById ?? "";
        const originalOperations = await db
          .select()
          .from(schema.operations)
          .where(eq(schema.operations.actorId, actorId));
        for (const { key, photo } of checks) {
          const url = statusUrl(f, kind, key, photo);
          await page.goto(url);
          await expectReadOnly(page, key, url);
          await page.getByRole("link", { name: "Check the save result", exact: true }).click();
          await expect(page).toHaveURL(url);
          await expectReadOnly(page, key, url);
        }
        expect(await snapshot(f)).toEqual(before);
        expect(
          await db.select().from(schema.operations).where(eq(schema.operations.actorId, actorId)),
        ).toEqual(originalOperations);
      });

      test(`O13 ${kind} failed readback permits only an explicit return to the current photo`, async ({
        page,
      }) => {
        const f = seed();
        await signIn(page, f);
        const key = await record(f, kind, "failed");
        const before = await snapshot(f);
        await page.goto(statusUrl(f, kind, key));
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "This action could not be completed. Review the current revision, required evidence and your access before trying again.",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByRole("status")).toContainText(
          "This request failed without applying its change.",
        );
        await expect(page.getByRole("main").locator("form")).toHaveCount(0);
        const back = page.getByRole("link", { name: "Back to the current task", exact: true });
        await expect(back).toHaveAttribute(
          "href",
          `/en/inventory/${f.reference}/media?photo=${f.relations[0]}`,
        );
        expect(await snapshot(f)).toEqual(before);
        await back.click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Photo 1 of 3", exact: true }),
        ).toBeVisible();
      });
    }
  });

for (const intent of ["details", "review-approve", "review-reject"] as const)
  test(`O13 ${intent} retries an unrecorded request with its exact key, text and decision`, async ({
    page,
  }) => {
    const f = seed();
    await signIn(page, f);
    const review = intent !== "details";
    const path = `/en/inventory/${f.reference}/media`;
    await page.goto(
      hostUrl("staff", `${path}?photo=${f.relations[0]}${review ? "&panel=review" : ""}`),
    );
    await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
    const key = await page.locator('input[name="_operationId"]').inputValue();
    const revision = await page.locator('input[name="_expectedRevision"]').inputValue();
    const retainedText = review
      ? "Synthetic retained permission holder"
      : "Synthetic retained caption before transport failure";
    if (review) {
      await page.getByLabel("Rights holder", { exact: true }).fill(retainedText);
      await page
        .getByLabel("Rights evidence / permission reference", { exact: true })
        .fill("synthetic-retained-permission-reference");
      if (intent === "review-approve") {
        await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
        await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
      } else
        await page
          .locator("summary")
          .filter({ hasText: /^Reject \/ withdraw public permission$/ })
          .click();
    } else {
      await page.getByLabel("Visible caption", { exact: true }).fill(retainedText);
      await page
        .getByLabel("Image description", { exact: true })
        .fill("Synthetic retained description");
    }
    const before = await snapshot(f);
    let posts = 0;
    let held: Route | undefined;
    await page.route(
      (target) => target.pathname === path,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts += 1;
        // This first request never reaches the server; checking its status cannot write it.
        if (posts === 1) {
          if (intent === "review-approve") {
            held = route;
            return;
          }
          return route.abort("failed");
        }
        return route.continue();
      },
    );
    const label =
      intent === "details"
        ? "Save photo details"
        : intent === "review-approve"
          ? "Approve as a public candidate"
          : "Reject / withdraw public permission";
    await page.getByRole("button", { name: label, exact: true }).click();
    if (intent === "review-approve") {
      await expect.poll(() => Boolean(held)).toBe(true);
      await expect(page.locator("#photo-review-form")).toHaveAttribute("aria-busy", "true");
      await expect(
        page.getByRole("checkbox", { name: /private addresses, people/ }),
      ).toBeDisabled();
      // aria-disabled does not suppress a native click. The refused duplicate must not
      // replace the retained request with controls omitted while the first is pending.
      await page.locator('#photo-review-form button[type="submit"]').first().click({ force: true });
      expect(posts).toBe(1);
      await held?.abort("failed");
    }
    await expect(page.getByText("We could not confirm the result", { exact: true })).toBeVisible();
    expect(
      await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
    ).toHaveLength(0);
    expect(await snapshot(f)).toEqual(before);
    await page.getByRole("link", { name: "Receipt for this request", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Outcome not yet confirmed", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(retainedText, { exact: true })).toBeVisible();
    await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
    await expect(page.locator('input[name="_operationId"]')).toHaveValue(key);
    await expect(page.locator('input[name="_expectedRevision"]')).toHaveValue(revision);
    if (intent === "review-approve") {
      await expect(page.locator('input[name="privacyReviewed"]')).toHaveValue("yes");
      await expect(page.locator('input[name="rightsConfirmed"]')).toHaveValue("yes");
      await expect(
        page.getByText("synthetic-retained-permission-reference", { exact: true }),
      ).toBeVisible();
    }
    expect(await snapshot(f)).toEqual(before);
    expect(posts).toBe(1);
    await page.getByRole("button", { name: "Retry the same save", exact: true }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: review ? /^Saved\./ : /Photo draft saved/ })
        .first(),
    ).toBeVisible();
    const after = await snapshot(f);
    expect(after.rows[0]?.asset.version).toBe((before.rows[0]?.asset.version ?? 0) + 1);
    if (intent === "details") {
      expect(after.rows[0]?.asset.detailsDraft).toMatchObject({
        caption: retainedText,
        altText: "Synthetic retained description",
      });
      expect(after.rows[0]?.asset.review).toBe(before.rows[0]?.asset.review);
    } else if (intent === "review-approve") {
      expect(after.rows[0]?.asset).toMatchObject({
        review: "approved",
        rights: "cleared",
        rightsHolder: retainedText,
        rightsReference: "synthetic-retained-permission-reference",
      });
    } else
      expect(after.rows[0]?.asset).toMatchObject({
        review: "rejected",
        rights: "rejected",
        audience: "private",
      });
    expect(after.manifests).toEqual(before.manifests);
    expect(after.listing).toEqual(before.listing);
    const recorded = await db
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.idempotencyKey, key));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      status: "succeeded",
      operationType: review ? "media.review" : "media.details.save",
    });
    await page.reload();
    expect(await snapshot(f)).toEqual(after);
    expect(posts).toBe(2);
  });

test("O13 corrects a known invalid approval with fresh confirmations and the same request key", async ({
  page,
}) => {
  const f = seed();
  await signIn(page, f);
  const path = `/en/inventory/${f.reference}/media`;
  await page.goto(hostUrl("staff", `${path}?photo=${f.relations[0]}&panel=review`));
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const key = await page.locator('input[name="_operationId"]').inputValue();
  const revision = await page.locator('input[name="_expectedRevision"]').inputValue();
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic validation holder");
  await page.getByLabel("Rights evidence / permission reference", { exact: true }).fill("");
  await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
  await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
  const before = await snapshot(f);
  let posts = 0;
  await page.route(
    (target) => target.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      return posts === 1 ? route.abort("failed") : route.continue();
    },
  );
  await page.getByRole("button", { name: "Approve as a public candidate", exact: true }).click();
  await expect(page.getByText("We could not confirm the result", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Receipt for this request", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Outcome not yet confirmed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic validation holder", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  const retry = page.getByRole("button", { name: "Retry the same save", exact: true });
  await retry.click();
  const evidence = page.getByLabel("Rights evidence / permission reference", { exact: true });
  await expect(evidence).toBeVisible();
  await expect(evidence).toBeEditable();
  await expect(page.getByRole("textbox", { name: "Visible caption", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Image description", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("checkbox", { name: /private addresses, people/ })).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /usage rights and permission/ }),
  ).not.toBeChecked();
  await expect(page.locator('input[name="_operationId"]')).toHaveValue(key);
  await expect(page.locator('input[name="_expectedRevision"]')).toHaveValue(revision);
  expect(await snapshot(f)).toEqual(before);
  expect(
    await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
  ).toHaveLength(0);
  expect(posts).toBe(2);
  await evidence.fill("synthetic-corrected-permission");
  await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
  await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
  await page.getByRole("link", { name: "Back to inventory", exact: true }).click();
  const unsaved = page.getByRole("dialog", { name: "Unsaved photo details", exact: true });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(evidence).toHaveValue("synthetic-corrected-permission");
  await expect(page.locator('input[name="_operationId"]')).toHaveValue(key);
  await retry.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /^Saved\./ })
      .first(),
  ).toBeVisible();
  const after = await snapshot(f);
  expect(after.rows[0]?.asset).toMatchObject({
    version: (before.rows[0]?.asset.version ?? 0) + 1,
    review: "approved",
    rightsHolder: "Synthetic validation holder",
    rightsReference: "synthetic-corrected-permission",
  });
  expect(after.manifests).toEqual(before.manifests);
  expect(after.listing).toEqual(before.listing);
  const recorded = await db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.idempotencyKey, key));
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({ operationType: "media.review", status: "succeeded" });
  await page.reload();
  expect(await snapshot(f)).toEqual(after);
  expect(posts).toBe(3);
});

for (const kind of ["details", "review"] as const)
  test(`O13 successful photo-${kind} save and reload need no beforeunload confirmation`, async ({
    page,
  }, testInfo) => {
    const f = seed();
    await signIn(page, f);
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();
    });
    await page.goto(
      hostUrl(
        "staff",
        `/en/inventory/${f.reference}/media?photo=${f.relations[0]}${kind === "review" ? "&panel=review" : ""}`,
      ),
    );
    await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
    const key = await page.locator('input[name="_operationId"]').inputValue();
    const before = await snapshot(f);
    const caption = "Synthetic caption with an acknowledged save";
    if (kind === "details") await page.getByLabel("Visible caption", { exact: true }).fill(caption);
    else {
      await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic acknowledged holder");
      await page
        .getByLabel("Rights evidence / permission reference", { exact: true })
        .fill("synthetic-acknowledged-permission");
      await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
      await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
    }
    await page
      .getByRole("button", {
        name: kind === "details" ? "Save photo details" : "Approve as a public candidate",
        exact: true,
      })
      .click();
    const receipt = page
      .getByRole("status")
      .filter({ hasText: kind === "details" ? /Photo draft saved/ : /^Saved\./ })
      .first();
    try {
      await expect(receipt).toBeVisible();
      await page.reload();
      await expect(receipt).toBeVisible();
    } finally {
      const recorded = await db
        .select()
        .from(schema.operations)
        .where(eq(schema.operations.idempotencyKey, key));
      const ackField = page.locator('input[name="_ack"]');
      const acknowledgment = (await ackField.count()) ? await ackField.inputValue() : "";
      const cookie = (await page.context().cookies()).find(
        (candidate) => candidate.name === "msr_saved_operation",
      );
      await testInfo.attach("successful-save-acknowledgment", {
        body: JSON.stringify({
          dialogs,
          operationStatus: recorded[0]?.status,
          acknowledgmentMatches: Boolean(acknowledgment) && cookie?.value === acknowledgment,
          disabledFields: await page
            .locator("form :disabled[name]")
            .evaluateAll((fields) => fields.map((field) => field.getAttribute("name"))),
          assetVersion: (await snapshot(f)).rows[0]?.asset.version,
          originalVersion: before.rows[0]?.asset.version,
        }),
        contentType: "application/json",
      });
    }
    if (kind === "details")
      await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(caption);
    const after = await snapshot(f);
    expect(after.rows[0]?.asset.version).toBe((before.rows[0]?.asset.version ?? 0) + 1);
    if (kind === "details") expect(after.rows[0]?.asset.detailsDraft).toMatchObject({ caption });
    else
      expect(after.rows[0]?.asset).toMatchObject({
        review: "approved",
        rightsHolder: "Synthetic acknowledged holder",
        rightsReference: "synthetic-acknowledged-permission",
      });
    expect(after.manifests).toEqual(before.manifests);
    expect(after.listing).toEqual(before.listing);
    expect(dialogs).toEqual([]);
  });

test("O13 a committed photo save permits hard receipt navigation while its response is pending", async ({
  page,
}, testInfo) => {
  const f = seed();
  await signIn(page, f);
  const path = `/en/inventory/${f.reference}/media`;
  await page.goto(hostUrl("staff", `${path}?photo=${f.relations[0]}`));
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const key = await page.locator('input[name="_operationId"]').inputValue();
  const before = await snapshot(f);
  await page
    .getByLabel("Visible caption", { exact: true })
    .fill("Synthetic caption saved before a delayed response");
  let held: { route: Route; response: APIResponse } | undefined;
  await page.route(
    (target) => target.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // The real authenticated command commits and sets its acknowledgment cookie.
      // Keep the React response pending to exercise hard navigation from that state.
      const response = await route.fetch({ maxRedirects: 0 });
      held = { route, response };
    },
  );
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Save photo details", exact: true }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await expect(page.locator("#photo-details-form")).toHaveAttribute("aria-busy", "true");
  const recorded = await db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.idempotencyKey, key));
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.status).toBe("succeeded");
  const acknowledgment = await page.locator('input[name="_ack"]').inputValue();
  const cookie = (await page.context().cookies()).find(
    (candidate) => candidate.name === "msr_saved_operation",
  );
  expect(cookie?.value).toBe(acknowledgment);
  const disabledFields = await page
    .locator("#photo-details-form :disabled[name]")
    .evaluateAll((fields) => fields.map((field) => field.getAttribute("name")));
  const receiptUrl = hostUrl("staff", `${path}?photo=${f.relations[0]}&saved=${recorded[0]?.id}`);
  let navigationError: string | undefined;
  try {
    await page.goto(receiptUrl, { timeout: 5_000 });
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  } finally {
    await testInfo.attach("pending-save-acknowledgment", {
      body: JSON.stringify({
        commandStatus: recorded[0]?.status,
        acknowledgmentMatches: cookie?.value === acknowledgment,
        disabledFields,
        dialogs,
        navigationError,
      }),
      contentType: "application/json",
    });
    await held?.route.fulfill({ response: held.response }).catch(() => undefined);
  }
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Photo draft saved/ })
      .first(),
  ).toBeVisible();
  const after = await snapshot(f);
  expect(after.rows[0]?.asset.version).toBe((before.rows[0]?.asset.version ?? 0) + 1);
  expect(after.manifests).toEqual(before.manifests);
  expect(after.listing).toEqual(before.listing);
  expect(dialogs).toEqual([]);
  expect(navigationError).toBeUndefined();
});

test("O13 an unacknowledged pending photo save still guards hard navigation", async ({
  page,
}, testInfo) => {
  const f = seed();
  await signIn(page, f);
  const path = `/en/inventory/${f.reference}/media`;
  const editorUrl = hostUrl("staff", `${path}?photo=${f.relations[0]}`);
  await page.goto(editorUrl);
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const key = await page.locator('input[name="_operationId"]').inputValue();
  const before = await snapshot(f);
  const caption = "Synthetic unacknowledged caption remains protected";
  await page.getByLabel("Visible caption", { exact: true }).fill(caption);
  let held: Route | undefined;
  await page.route(
    (target) => target.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // No server command or acknowledgment has occurred when navigation is attempted.
      held = route;
    },
  );
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Save photo details", exact: true }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await expect(page.locator("#photo-details-form")).toHaveAttribute("aria-busy", "true");
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === "msr_saved_operation"),
  ).toBe(false);
  await page.goto(hostUrl("staff", "/en/inventory"), { timeout: 5_000 }).catch(() => undefined);
  await expect(page).toHaveURL(editorUrl);
  expect(dialogs).toEqual(["beforeunload"]);
  await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(caption);
  expect(await snapshot(f)).toEqual(before);
  expect(
    await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
  ).toHaveLength(0);
  await testInfo.attach("unacknowledged-pending-navigation", {
    body: JSON.stringify({
      dialogs,
      acknowledged: false,
      operationRecorded: false,
      editorRetained: page.url() === editorUrl,
    }),
    contentType: "application/json",
  });
  await held?.abort("failed");
  await expect(page.getByText("We could not confirm the result", { exact: true })).toBeVisible();
  await expect(page.getByText(caption, { exact: true })).toBeVisible();
});

test("O13 a fresh synthetic session can revisit and save after step-up rejection without a browser prompt", async ({
  page,
}, testInfo) => {
  const f = seed();
  await signIn(page, f);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${f.relations[0]}`));
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const before = await snapshot(f);
  const actorId = before.rows[0]?.asset.reviewedById;
  if (!actorId) throw new Error("Missing synthetic reviewer");
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await db
    .update(schema.sessions)
    .set({ reverifiedAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(schema.sessions.principalId, actorId));
  await page
    .getByLabel("Visible caption", { exact: true })
    .fill("Synthetic caption after fresh verification");
  await page.getByRole("button", { name: "Save photo details", exact: true }).click();
  await expect(
    page.getByText("Please confirm it is you before this action.", { exact: true }),
  ).toBeVisible();
  expect(await snapshot(f)).toEqual(before);

  // Supply a freshly verified synthetic session; this test does not exercise passkeys.
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.sessions.principalId, actorId));
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    tokenHash: createHash("sha256").update(token).digest("hex"),
    principalKind: "staff",
    principalId: actorId,
    reverifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  await signIn(page, { ...f, token });
  await page.getByRole("link", { name: "Back to inventory", exact: true }).click();
  const unsaved = page.getByRole("dialog", { name: "Unsaved photo details", exact: true });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole("button", { name: "Discard and leave", exact: true }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/inventory"));
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${f.relations[0]}`));
  await expect(page.getByRole("button", { name: "Save photo details", exact: true })).toBeVisible();
  await page
    .getByLabel("Visible caption", { exact: true })
    .fill("Synthetic caption after fresh verification");
  await page.getByRole("button", { name: "Save photo details", exact: true }).click();
  try {
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Photo draft saved/ })
        .first(),
    ).toBeVisible();
  } finally {
    await testInfo.attach("fresh-session-save-dialogs", {
      body: JSON.stringify({
        dialogs,
        assetVersion: (await snapshot(f)).rows[0]?.asset.version,
        originalVersion: before.rows[0]?.asset.version,
      }),
      contentType: "application/json",
    });
  }
  const after = await snapshot(f);
  expect(after.rows[0]?.asset.version).toBe((before.rows[0]?.asset.version ?? 0) + 1);
  expect(after.rows[0]?.asset.detailsDraft).toMatchObject({
    caption: "Synthetic caption after fresh verification",
  });
  expect(after.manifests).toEqual(before.manifests);
  expect(after.listing).toEqual(before.listing);
  expect(dialogs).toEqual([]);
});

test("O13 recovery keeps corrected rights evidence visible after a revision conflict", async ({
  page,
}) => {
  const f = seed();
  await signIn(page, f);
  const path = `/en/inventory/${f.reference}/media`;
  await page.goto(hostUrl("staff", `${path}?photo=${f.relations[0]}&panel=review`));
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const key = await page.locator('input[name="_operationId"]').inputValue();
  const before = await snapshot(f);
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic original holder");
  await page.getByLabel("Rights evidence / permission reference", { exact: true }).fill("");
  let posts = 0;
  await page.route(
    (target) => target.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      return posts === 1 ? route.abort("failed") : route.continue();
    },
  );
  await page.getByRole("button", { name: "Approve as a public candidate", exact: true }).click();
  await expect(page.getByText("We could not confirm the result", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Receipt for this request", exact: true }).click();
  await page.getByRole("button", { name: "Retry the same save", exact: true }).click();
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic corrected holder");
  await page
    .getByLabel("Rights evidence / permission reference", { exact: true })
    .fill("synthetic-corrected-reference-before-conflict");
  await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
  await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
  const photo = before.rows[0]?.asset;
  if (!photo) throw new Error("Missing synthetic photo");
  await db
    .update(schema.mediaAssets)
    .set({ version: photo.version + 1 })
    .where(eq(schema.mediaAssets.id, photo.id));
  const changed = await snapshot(f);
  await page.getByRole("button", { name: "Retry the same save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Synthetic corrected holder", { exact: true })).toBeVisible();
  await expect(
    page.getByText("synthetic-corrected-reference-before-conflict", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic original holder", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry the same save", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('input[name="_operationId"]')).toHaveValue(key);
  expect(await snapshot(f)).toEqual(changed);
  const recorded = await db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.idempotencyKey, key));
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.status).toBe("failed");
  expect(posts).toBe(3);
});

test("O13 a retained draft with known failed readback is terminal without unknown or retry", async ({
  page,
}) => {
  const f = seed();
  await signIn(page, f);
  const path = `/en/inventory/${f.reference}/media`;
  await page.goto(hostUrl("staff", `${path}?photo=${f.relations[0]}`));
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  const key = await page.locator('input[name="_operationId"]').inputValue();
  const before = await snapshot(f);
  await page
    .getByLabel("Visible caption", { exact: true })
    .fill("Synthetic retained terminal caption");
  let posts = 0;
  await page.route(
    (target) => target.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      return route.abort("failed");
    },
  );
  await page.getByRole("button", { name: "Save photo details", exact: true }).click();
  await expect(page.getByText("We could not confirm the result", { exact: true })).toBeVisible();
  await record(f, "details", "failed", 0, key);
  await page.getByRole("link", { name: "Receipt for this request", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This request failed without applying its change." }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic retained terminal caption", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("We could not confirm the result", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry the same save", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("main").locator('button[type="submit"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to the current task", exact: true }),
  ).toBeVisible();
  expect(await snapshot(f)).toEqual(before);
  expect(posts).toBe(1);
});
