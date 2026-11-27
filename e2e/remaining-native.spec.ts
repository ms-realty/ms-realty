// AT02/AT08/AT31: native browser compositions, using synthetic PostgreSQL fixtures.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

type Listing = { reference: string; title: string };
function seed(command = "discovery", reference?: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "e2e/support/remaining-native-seed.ts",
        command,
        ...(reference ? [reference] : []),
      ],
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
const card = (page: Page, reference: string) =>
  page.locator(`article[data-listing-reference="${reference}"]`);
function barrier() {
  let resolve = () => {};
  let reject = (_error: unknown) => {};
  const promise = new Promise<void>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}
async function openFilters(page: Page) {
  const details = page
    .locator('form[method="get"]')
    .filter({ has: page.locator('[name="q"]') })
    .locator("details");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open)))
    await details.locator("summary").click();
}

for (const javaScriptEnabled of [false, true]) {
  test.describe(`remaining native JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });
    test("AT02 filters survive detail, Back and refresh on the actual public route", async ({
      page,
    }) => {
      const f: { first: Listing; second: Listing } = seed();
      await page.goto("/en/properties");
      await openFilters(page);
      const values = {
        q: f.first.reference,
        minPrice: "94999.99",
        maxPrice: "95000.01",
        currency: "EUR",
        minBeds: "2",
        maxBeds: "2",
        minArea: "67.99",
        maxArea: "68.01",
        areaBasis: "living",
        sort: "price_desc",
      };
      for (const [name, value] of Object.entries(values)) {
        const field = page.locator(`form[method="get"] [name="${name}"]`);
        if (["currency", "areaBasis", "sort"].includes(name)) await field.selectOption(value);
        else await field.fill(value);
      }
      await page.getByRole("checkbox", { name: "Apartment", exact: true }).check();
      await page.getByRole("button", { name: "Search properties", exact: true }).click();
      await expect(card(page, f.first.reference)).toBeVisible();
      await expect(card(page, f.second.reference)).toHaveCount(0);
      const committed = page.url();
      for (const [name, value] of Object.entries({ ...values, purpose: "sale", type: "apartment" }))
        expect(new URL(committed).searchParams.get(name)).toBe(value);
      await card(page, f.first.reference)
        .getByRole("link", { name: f.first.title, exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: f.first.title })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(committed);
      await openFilters(page);
      for (const [name, value] of Object.entries(values))
        await expect(page.locator(`form[method="get"] [name="${name}"]`)).toHaveValue(value);
      await expect(page.getByRole("checkbox", { name: "Apartment", exact: true })).toBeChecked();
      await page.reload();
      await expect(page).toHaveURL(committed);
      await openFilters(page);
      for (const [name, value] of Object.entries(values))
        await expect(page.locator(`form[method="get"] [name="${name}"]`)).toHaveValue(value);
      await expect(card(page, f.first.reference)).toBeVisible();
      await expect(card(page, f.second.reference)).toHaveCount(0);
    });

    test("AT02 an older native query response cannot replace a newer committed query", async ({
      page,
    }) => {
      const f: { first: Listing; second: Listing } = seed();
      await page.goto("/en/properties");
      const fetched = barrier();
      const release = barrier();
      const handled = barrier();
      const obsolete = page.waitForEvent("requestfailed", {
        predicate: (request) => new URL(request.url()).searchParams.get("q") === f.first.reference,
      });
      let olderBody = "";
      await page.route(
        (url) =>
          url.pathname === "/en/properties" && url.searchParams.get("q") === f.first.reference,
        async (route) => {
          try {
            const response = await route.fetch();
            olderBody = await response.text();
            fetched.resolve();
            await release.promise;
            await route.fulfill({ response });
            handled.resolve();
          } catch (error) {
            fetched.reject(error);
            handled.reject(error);
          }
        },
      );
      try {
        await page.locator('form[method="get"] [name="q"]').fill(f.first.reference);
        const oldSubmit = page
          .getByRole("button", { name: "Search properties", exact: true })
          .click({ noWaitAfter: true });
        await fetched.promise;
        expect(olderBody).toContain(f.first.reference);
        await oldSubmit;
        // A pending native navigation has no editable committed form. A second address-bar
        // navigation exercises the same URL-owned query boundary without an invented API.
        await page.goto(`/en/properties?purpose=sale&q=${f.second.reference}`);
        await expect(card(page, f.second.reference)).toBeVisible();
        const latestUrl = page.url();
        expect(new URL(latestUrl).searchParams.get("q")).toBe(f.second.reference);
        expect((await obsolete).failure()?.errorText).toMatch(/ABORTED|cancelled|canceled/i);
        release.resolve();
        await handled.promise;
        await expect(page).toHaveURL(latestUrl);
        await expect(page.locator('form[method="get"] [name="q"]')).toHaveValue(f.second.reference);
        await expect(card(page, f.second.reference)).toBeVisible();
        await expect(card(page, f.first.reference)).toHaveCount(0);
      } finally {
        release.resolve();
        await page.unrouteAll({ behavior: "wait" });
      }
    });

    test("AT31 the same Appointment preserves both DST-fold instants on client and staff hosts", async ({
      page,
    }) => {
      const f: { staffToken: string; clientToken: string; id: string; reference: string } =
        seed("calendar");
      await page.context().addCookies([
        {
          name: "msr_staff_session",
          value: f.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      // Independent oracle: the Sofia autumn fold maps these distinct UTC instants to 03:30.
      const first = "2030-10-27T00:30:00.000Z";
      const second = "2030-10-27T01:30:00.000Z";
      expect(Date.parse(second) - Date.parse(first)).toBe(60 * 60 * 1000);
      for (const host of ["client", "staff"] as const) {
        await page.goto(
          hostUrl(host, `/en/${host === "client" ? "appointments" : "calendar"}/${f.id}`),
        );
        await expect(page.getByText(f.reference, { exact: true })).toBeVisible();
        const range = page.locator(`main time[datetime="${first}"]`).first();
        await expect(range).toContainText("03:30");
        await expect(range).toContainText("First, before the clocks change");
        await expect(range).toContainText("Second, after the clocks change");
        if (host === "client") await expect(range).toContainText("Sofia time");
        await expect(
          page.locator('main time[datetime="2030-10-28T08:00:00.000Z"]').first(),
        ).toContainText("10:00");
      }
      await page.goto(
        hostUrl("staff", "/en/calendar?date=2030-10-27&view=day&zone=Europe%2FSofia&scope=team"),
      );
      const viewing = page.getByRole("article", { name: f.reference, exact: true });
      await expect(viewing.locator(`time[datetime="${first}"]`).first()).toContainText(
        "03:30 GMT+3",
      );
      await expect(viewing.locator(`time[datetime="${second}"]`).first()).toContainText(
        "03:30 GMT+2",
      );
      const filters = page.locator("[data-calendar-filters]");
      if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open)))
        await filters.locator("summary").click();
      await filters.locator('[name="zone"]').selectOption("UTC");
      await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("zone") === "UTC");
      await expect(filters.locator('[name="zone"]')).toHaveValue("UTC");
      await expect(viewing.locator(`time[datetime="${first}"]`).first()).toHaveText("00:30");
      await expect(viewing.locator(`time[datetime="${second}"]`).first()).toHaveText("01:30");
      await page.goto(hostUrl("client", `/en/appointments/${f.id}`));
      await expect(page.locator(`main time[datetime="${first}"]`).first()).toContainText(
        "First, before the clocks change",
      );
      await expect(page.locator(`main time[datetime="${first}"]`).first()).toContainText(
        "Second, after the clocks change",
      );
    });
  });
}

test("AT08 saved and compared selections re-read a newly approved price without dropping IDs", async ({
  page,
}) => {
  const f: { first: Listing; second: Listing } = seed();
  await page.goto("/bg/saved");
  const refs = [f.first.reference, f.second.reference];
  await page.evaluate((references) => {
    localStorage.setItem("ms-realty.saved.v1", JSON.stringify(references));
    localStorage.setItem("ms-realty.compare.v1", JSON.stringify(references));
  }, refs);
  await page.reload();
  await expect(card(page, f.first.reference)).toContainText(/95[\s,.]?000/);
  const revised = seed("reprice", f.first.reference);
  expect(revised.reference).toBe(f.first.reference);
  expect(revised.manifests).toHaveLength(1);
  await page.reload();
  await expect(card(page, f.first.reference)).toContainText(/123[\s,.]?456[,.]78/);
  await expect(card(page, f.first.reference)).not.toContainText(/95[\s,.]?000/);
  await expect(card(page, f.second.reference)).toContainText(/95[\s,.]?000/);
  await page.goto(`/bg/compare?references=${refs.join(",")}`);
  await expect(page.locator('th[id^="compare-MS-"]')).toHaveCount(2);
  await expect(page.locator("table")).toContainText(/123[\s,.]?456[,.]78/);
  await expect(page.locator("table")).toContainText(/95[\s,.]?000/);
  expect(
    await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem("ms-realty.saved.v1") ?? "null"),
      compare: JSON.parse(localStorage.getItem("ms-realty.compare.v1") ?? "null"),
    })),
  ).toEqual({ saved: refs, compare: refs });
});
