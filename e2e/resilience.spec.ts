// UI01 resilience, against this run's disposable database: the permission state of a list the
// viewer's grants do not cover (M-003), each host's not-found with its way back (M-140) and the
// destination skeleton while a navigation is on its way (M-046). Server failures need a broken
// table and run apart from the parallel suite: e2e/route-errors.spec.ts.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createClient, createStaff } from "../src/server/testing";
import { type HostContext, hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Resilience cases require the disposable browser database");
const connection = postgres(databaseUrl, { max: 2, onnotice: () => {} });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

async function session(context: BrowserContext, kind: "staff" | "client", principalId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: kind,
    principalId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
  await context.addCookies([
    {
      name: `msr_${kind}_session`,
      value: token,
      url: origins[kind],
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** A staff member in their first week: two passkeys, a live session and no grants at all. */
async function newStaffMember(context: BrowserContext) {
  const staff = await createStaff(db);
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  await session(context, "staff", staff.id);
}

const noDefaultError = /This page couldn.t load|Application error|Internal Server Error/;

for (const javaScriptEnabled of [true, false])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O10 M-003: a staff member without listing access learns why, inside the shell", async ({
      page,
      context,
    }, info) => {
      const marker = randomUUID().slice(0, 8);
      const manager = await createStaff(db, { roles: ["manager"] });
      await db
        .update(schema.principals)
        .set({ displayName: `Access Manager ${marker}` })
        .where(eq(schema.principals.id, manager.id));
      await newStaffMember(context);

      for (const { locale, title, about, denied, back, nav, menu } of [
        {
          locale: "bg",
          title: "Имоти и обяви",
          about: "Имотите и обявите, с които работи агенцията.",
          denied: "Достъпът ви не включва тази страница",
          back: "Обратно към „Днес“",
          nav: "Работно пространство",
          menu: "Отворете навигацията",
        },
        {
          locale: "en",
          title: "Inventory",
          about: "The properties and listings the agency works with.",
          denied: "Your access does not include this page",
          back: "Back to Today",
          nav: "Workspace",
          menu: "Open navigation",
        },
      ]) {
        const response = await page.goto(hostUrl("staff", `/${locale}/inventory`));
        expect(response?.status()).toBe(200);
        const state = page.locator("[data-permission-state]");
        await expect(state.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await expect(state.getByText(about)).toBeVisible();
        await expect(state.getByRole("heading", { level: 2, name: denied })).toBeVisible();
        await expect(state).toContainText(`Access Manager ${marker}`);
        await expect(state.getByRole("link", { name: back })).toHaveAttribute(
          "href",
          `/${locale}/today`,
        );
        // The workspace shell stays around it; nothing of the list is read or drawn.
        await expect(page.getByRole("main")).toContainText(denied);
        if ((page.viewportSize()?.width ?? 1440) >= 1024) {
          await expect(page.getByRole("navigation", { name: nav }).first()).toBeVisible();
        } else {
          const trigger = page.getByRole("banner").getByRole("link", {
            name: menu,
            exact: true,
          });
          await expect(trigger).toBeVisible();
          await expect(trigger).toHaveAttribute("href", `/${locale}/operations`);
        }
        await expect(page.locator("form[method=get], ul[aria-label]")).toHaveCount(0);
        await expect(page.getByText(noDefaultError)).toHaveCount(0);
        if (javaScriptEnabled)
          await page.screenshot({
            path: info.outputPath(`inventory-no-grant-${locale}.png`),
            fullPage: true,
          });
      }
    });

    test("M-140: each host's 404 keeps its status and names the way back", async ({
      page,
    }, info) => {
      const cases: {
        host: HostContext;
        path: string;
        dir: "ltr" | "rtl";
        heading: string;
        links: [string, string][];
        phone: boolean;
      }[] = [
        {
          host: "public",
          path: "/en/no-such-page",
          dir: "ltr",
          heading: "Page not found",
          links: [
            ["Search properties", "/en/properties"],
            ["Go to the home page", "/en"],
          ],
          phone: true,
        },
        {
          host: "public",
          path: "/bg/no-such-page",
          dir: "ltr",
          heading: "Страницата не е намерена",
          links: [
            ["Търсене на имоти", "/bg/properties"],
            ["Към началната страница", "/bg"],
          ],
          phone: true,
        },
        {
          host: "public",
          path: "/he/no-such-page",
          dir: "rtl",
          heading: "הדף לא נמצא",
          links: [
            ["חיפוש נכסים", "/he/properties"],
            ["לדף הבית", "/he"],
          ],
          phone: true,
        },
        {
          host: "client",
          path: "/en/no-such-page",
          dir: "ltr",
          heading: "Page not found",
          links: [["Back to my deals", "/en/overview"]],
          phone: true,
        },
        {
          host: "client",
          path: "/bg/no-such-page",
          dir: "ltr",
          heading: "Страницата не е намерена",
          links: [["Към моите сделки", "/bg/overview"]],
          phone: true,
        },
        {
          host: "client",
          path: "/he/no-such-page",
          dir: "rtl",
          heading: "הדף לא נמצא",
          links: [["חזרה לעסקאות שלי", "/he/overview"]],
          phone: true,
        },
        {
          host: "staff",
          path: "/en/no-such-page",
          dir: "ltr",
          heading: "Page not found",
          links: [["Back to Today", "/en/today"]],
          phone: false,
        },
        {
          host: "staff",
          path: "/bg/no-such-page",
          dir: "ltr",
          heading: "Страницата не е намерена",
          links: [["Обратно към „Днес“", "/bg/today"]],
          phone: false,
        },
      ];
      for (const { host, path, dir, heading, links, phone } of cases) {
        const response = await page.goto(hostUrl(host, path));
        expect(response?.status(), `${host} ${path}`).toBe(404);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
        const main = page.getByRole("main");
        for (const [name, href] of links)
          await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
        await expect(main.locator('a[href="tel:+359879696870"]')).toHaveCount(phone ? 1 : 0);
        if (javaScriptEnabled && path.startsWith("/en/"))
          await page.screenshot({ path: info.outputPath(`not-found-${host}.png`), fullPage: true });
      }
    });
  });

test("M-003: every workspace rail destination answers a member without grants", async ({
  page,
  context,
}) => {
  await newStaffMember(context);
  for (const path of ["today", "inquiries", "cases", "inventory", "calendar", "tasks"]) {
    const response = await page.goto(hostUrl("staff", `/en/${path}`));
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(page.getByText(noDefaultError), path).toHaveCount(0);
  }
});

test.describe("M-140 a missing record names itself and its list", () => {
  test("public listing, client deal and staff deal answer 404 with their parents", async ({
    page,
    context,
  }) => {
    const missing = randomUUID();
    const client = await createClient(db);
    await session(context, "client", client.id);
    await newStaffMember(context);
    const records: { host: HostContext; path: string; body: string; links: [string, string][] }[] =
      [
        {
          host: "public",
          path: "/en/properties/MS-999999999999/ms-999999999999",
          body: "We could not find this property.",
          links: [["Search properties", "/en/properties"]],
        },
        {
          host: "client",
          path: `/bg/overview/${missing}`,
          body: "Не намерихме тази сделка.",
          links: [["Към моите сделки", "/bg/overview"]],
        },
        {
          host: "staff",
          path: `/en/cases/${missing}`,
          body: "We could not find this deal.",
          links: [
            ["Back to deals", "/en/cases"],
            ["Back to Today", "/en/today"],
          ],
        },
      ];
    for (const { host, path, body, links } of records) {
      const response = await page.goto(hostUrl(host, path));
      expect(response?.status(), path).toBe(404);
      const main = page.getByRole("main");
      // Drawn after hydration: Next serves a page-thrown 404 as an empty error document.
      await expect(main.getByText(body)).toBeVisible();
      for (const [name, href] of links)
        await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
      await expect(main).not.toContainText(missing);
    }
  });
});

test.describe("M-046 navigation skeleton", () => {
  test("a plain link shows the destination's skeleton until the next page arrives", async ({
    page,
    context,
  }) => {
    await newStaffMember(context);
    await page.goto(hostUrl("staff", "/en/inventory"));
    // Playwright pauses every page query while a document navigation is pending, so the page
    // that is still shown records what it draws in the tab's sessionStorage, read on arrival.
    await page.evaluate(() => {
      new MutationObserver(() => {
        const status = document.querySelector("[data-navigation-loading] [role=status]");
        const content = document.querySelector<HTMLElement>("[data-route-content]");
        if (status && content?.hidden && !sessionStorage.getItem("m046"))
          sessionStorage.setItem(
            "m046",
            JSON.stringify({
              status: status.textContent,
              busy: Boolean(status.querySelector('[aria-busy="true"]')),
              contentHidden: content.hidden,
              contentInert: content.inert,
            }),
          );
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    // The server answers late: long enough for any skeleton to be drawn first.
    await page.route(
      (url) => url.pathname === "/en/today",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    await page
      .locator("[data-permission-state]")
      .getByRole("link", { name: "Back to Today" })
      .click({ noWaitAfter: true });
    await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-navigation-loading]")).toHaveCount(0);
    expect(
      JSON.parse((await page.evaluate(() => sessionStorage.getItem("m046"))) ?? "null"),
    ).toEqual({
      status: expect.stringContaining("Loading the list…"),
      busy: true,
      contentHidden: true,
      contentInert: true,
    });
  });

  test("a workspace rail link shows it during client-side navigation", async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== "chromium-desktop", "The rail is the wide-screen navigation.");
    await newStaffMember(context);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Every read of Today waits, prefetches included, until the skeleton has been seen.
    await page.route(
      (url) => url.pathname === "/en/today",
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await page.goto(hostUrl("staff", "/en/inventory"));
    await page
      .getByRole("navigation", { name: "Workspace" })
      .first()
      .getByRole("link", { name: "Today" })
      .click();
    const loading = page.locator("[data-navigation-loading]");
    await expect(loading.getByRole("status")).toContainText("Loading the list…");
    await expect(page.locator("[data-route-content]")).toBeHidden();
    await page.screenshot({ path: info.outputPath("skeleton-today.png"), fullPage: true });
    release();
    await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
    await expect(loading).toHaveCount(0);
    await expect(page.locator("[data-route-content]")).toBeVisible();
  });
});
