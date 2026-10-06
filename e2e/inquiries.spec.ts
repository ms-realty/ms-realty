// O02 inquiries queue (Figma 11:4257 · 18:2905, O02MINE, O02UNCLAIMED): scopes, two-line
// rows, the open conversation beside the queue on wide screens and its own route below, a
// POST-only search and truthful empty states, with JavaScript on and off. Synthetic records
// in this run's disposable database, visible only through record-scoped grants.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, type Request, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { workCopy } from "../src/features/work/copy";
import { inboxScopes } from "../src/features/work/inquiry-row";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("O02 browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

const en = workCopy("en");

async function staff(name: string) {
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: name })
    .returning();
  if (!party) throw new Error("Party fixture missing");
  const [principal] = await db
    .insert(schema.principals)
    .values({
      partyId: party.id,
      kind: "staff",
      issuer: "urn:ms-realty:staff",
      subject: randomUUID(),
      email: `${randomUUID()}@example.test`,
      displayName: name,
    })
    .returning();
  if (!principal) throw new Error("Principal fixture missing");
  await db.insert(schema.staffMemberships).values({ principalId: principal.id });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: principal.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: "staff",
    principalId: principal.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
  return { id: principal.id, name, token };
}

/** Five open conversations the broker may read; the colleague may read only their own. */
async function fixture() {
  const key = randomBytes(4).toString("hex");
  const broker = await staff(`O02 broker ${key}`);
  const colleague = await staff(`O02 colleague ${key}`);
  const listing = `MS-O02-${key}`;
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000);
  const inserted = await db
    .insert(schema.inquiries)
    .values(
      [
        {
          name: "Alex",
          state: "received" as const,
          coverageQueue: "agency",
          purpose: "viewing_request" as const,
          preferredLocale: "bg" as const,
          context: { listing: { reference: listing, title: "Synthetic flat" } },
          createdAt: ago(180),
        },
        {
          name: "Nikol",
          state: "assigned" as const,
          ownerId: broker.id,
          purpose: "question" as const,
          preferredLocale: "en" as const,
          createdAt: ago(150),
        },
        {
          name: "Mira",
          state: "awaiting_client" as const,
          ownerId: broker.id,
          purpose: "callback" as const,
          preferredLocale: "ru" as const,
          createdAt: ago(120),
        },
        {
          name: "Petar",
          state: "suspected_spam" as const,
          coverageQueue: "agency",
          purpose: "question" as const,
          createdAt: ago(90),
        },
        {
          name: "Elena",
          state: "assigned" as const,
          ownerId: colleague.id,
          purpose: "seller_consultation" as const,
          preferredLocale: "bg" as const,
          createdAt: ago(60),
        },
      ].map(({ name, ...row }, index) => ({
        ...row,
        reference: `RQ-O02-${key}-${index}`,
        source: "website" as const,
        submissionKey: randomUUID(),
        payloadDigest: "synthetic-o02",
        preferredName: `O02 ${key} ${name}`,
        message: `Synthetic O02 conversation ${index}.`,
      })),
    )
    .returning({ id: schema.inquiries.id });
  const ids = inserted.map((row) => row.id);
  const elena = ids[4];
  if (ids.length !== 5 || !elena) throw new Error("Inquiry fixtures missing");
  const read = (principalId: string, recordId: string) => ({
    principalId,
    capability: "inquiry.read" as const,
    recordType: "inquiry",
    recordId,
    reason: "Synthetic O02 queue fixture",
  });
  await db
    .insert(schema.grants)
    .values([...ids.map((id) => read(broker.id, id)), read(colleague.id, elena)]);
  return { key, listing, broker, colleague, ids, name: (who: string) => `O02 ${key} ${who}` };
}

async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
const rows = (page: Page) =>
  page.getByRole("list", { name: en.queue.list, exact: true }).getByRole("listitem");
const views = (page: Page) => page.getByRole("navigation", { name: en.queue.views });
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

for (const javaScriptEnabled of [true, false])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O02 scopes, two-line rows and the open conversation keep their place", async ({
      page,
      context,
    }) => {
      const f = await fixture();
      await signIn(context, f.broker.token);
      await page.goto(hostUrl("staff", "/en/inquiries"));
      await expect(page.getByRole("heading", { level: 1, name: en.inbox })).toBeVisible();
      await expect(page.getByText(en.scopeLeads.all, { exact: true })).toBeVisible();
      expect(await views(page).getByRole("link").allTextContents()).toEqual(
        inboxScopes.map((scope) => en.scopes[scope]),
      );
      await expect(views(page).getByRole("link", { name: "All", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Oldest first. Line one: name and listing or intent; line two: status, age, language, owner.
      await expect(rows(page)).toHaveCount(5);
      await expect(rows(page).nth(0)).toContainText(`${f.name("Alex")} · ${f.listing}`);
      await expect(rows(page).nth(0)).toContainText(
        "Received 3 hours ago · Preferred language: Bulgarian · Accountable owner: Agency coverage",
      );
      await expect(rows(page).nth(1)).toContainText(`${f.name("Nikol")} · Question`);
      await expect(rows(page).nth(1)).toContainText(
        `Assigned · Received 2 hours ago · Preferred language: English · Accountable owner: ${f.broker.name}`,
      );
      await expect(rows(page).nth(3)).toContainText(
        `${f.name("Petar")} · QuestionSuspected spam · Received 1 hour ago · Accountable owner: Agency coverage`,
      );
      await expect(rows(page).nth(4)).toContainText(`Accountable owner: ${f.colleague.name}`);
      await expect(rows(page).nth(1).getByRole("link")).toHaveAttribute(
        "href",
        `/en/inquiries/${f.ids[1]}?view=all`,
      );
      await expect(page.getByText(en.queue.open, { exact: true })).toBeVisible();

      for (const [scope, names] of [
        ["unassigned", ["Alex", "Petar"]],
        ["mine", ["Nikol", "Mira"]],
        ["awaiting", ["Mira"]],
        ["review", ["Petar"]],
      ] as const) {
        await views(page).getByRole("link", { name: en.scopes[scope], exact: true }).click();
        await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries?view=${scope}`));
        await expect(
          views(page).getByRole("link", { name: en.scopes[scope], exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(page.getByText(en.scopeLeads[scope], { exact: true })).toBeVisible();
        await expect(rows(page)).toHaveCount(names.length);
        for (const [index, name] of names.entries())
          await expect(rows(page).nth(index)).toContainText(f.name(name));
      }

      await views(page).getByRole("link", { name: "Unclaimed", exact: true }).click();
      await rows(page).nth(0).getByRole("link").click();
      await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${f.ids[0]}?view=unassigned`));
      await expect(
        page.getByRole("heading", { level: 1, name: `RQ-O02-${f.key}-0`, exact: true }),
      ).toBeVisible();
      const queue = page.locator("[data-inquiry-queue]");
      const back = page.getByRole("link", { name: en.queue.back, exact: true });
      if (wide(page)) {
        // Desktop split: the queue stays beside the conversation, scope kept, row marked.
        await expect(queue).toBeVisible();
        await expect(back).toBeHidden();
        await expect(queue.getByRole("link", { name: "Unclaimed", exact: true })).toHaveAttribute(
          "aria-current",
          "true",
        );
        await expect(queue.locator(`[data-inquiry-id="${f.ids[0]}"] a`)).toHaveAttribute(
          "aria-current",
          "page",
        );
        await queue.locator(`[data-inquiry-id="${f.ids[3]}"] a`).click();
        await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${f.ids[3]}?view=unassigned`));
        await expect(queue.locator(`[data-inquiry-id="${f.ids[3]}"] a`)).toHaveAttribute(
          "aria-current",
          "page",
        );
        await expect(queue.locator(`[data-inquiry-id="${f.ids[0]}"] a`)).not.toHaveAttribute(
          "aria-current",
        );
        // A scope change keeps the open conversation.
        await queue.getByRole("link", { name: "All", exact: true }).click();
        await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${f.ids[3]}?view=all`));
        await expect(
          page.getByRole("heading", { level: 1, name: `RQ-O02-${f.key}-3`, exact: true }),
        ).toBeVisible();
        await expect(queue.locator("[data-inquiry-id]")).toHaveCount(5);
      } else {
        // Narrow screens: the conversation is its own route and returns to the same row.
        await expect(queue).toHaveCount(1);
        await expect(queue).toBeHidden();
        await expect(back).toHaveAttribute(
          "href",
          `/en/inquiries?view=unassigned#inquiry-${f.ids[0]}`,
        );
        await back.click();
        await expect(page).toHaveURL(
          hostUrl("staff", `/en/inquiries?view=unassigned#inquiry-${f.ids[0]}`),
        );
        await expect(
          views(page).getByRole("link", { name: "Unclaimed", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(page.locator(`[data-inquiry-id="${f.ids[0]}"]`)).toBeInViewport();
      }
    });

    test("O02 search sends the term only in a POST body", async ({ page, context }) => {
      const f = await fixture();
      await signIn(context, f.broker.token);
      const requests: Request[] = [];
      page.on("request", (request) => requests.push(request));
      await page.goto(hostUrl("staff", "/en/inquiries?view=mine"));
      const field = page.getByLabel(en.queue.search, { exact: true });
      const submit = page.getByRole("button", { name: en.queue.searchSubmit, exact: true });

      // A blank or one-character term is refused inline, and the queue stays in view.
      await submit.click();
      await expect(page.getByText(en.queue.searchBlank, { exact: true })).toBeVisible();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(rows(page)).toHaveCount(2);
      await field.fill("N");
      await submit.click();
      await expect(page.getByText(en.queue.searchShort, { exact: true })).toBeVisible();
      await expect(rows(page)).toHaveCount(2);

      const term = `${f.name("Ni")}`;
      await field.fill(term);
      await submit.click();
      await expect(
        page.getByRole("heading", { name: en.queue.results, exact: true }),
      ).toBeVisible();
      const found = page.getByRole("list", { name: en.queue.results }).getByRole("listitem");
      await expect(found).toHaveCount(1);
      await expect(found).toContainText(`${f.name("Nikol")} · RQ-O02-${f.key}-1`);
      await expect(found.getByRole("link")).toHaveAttribute(
        "href",
        `/en/inquiries/${f.ids[1]}?view=mine`,
      );
      await expect(page.getByRole("list", { name: en.queue.list, exact: true })).toHaveCount(0);
      await expect(field).toHaveValue(term);
      expect(page.url()).not.toContain(f.key);
      for (const href of await page
        .locator("a[href]")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")))
        expect(href).not.toContain(f.key);
      const carried = requests.filter((request) =>
        request.postDataBuffer()?.toString("utf8").includes(f.key),
      );
      expect(carried.length).toBeGreaterThan(0);
      expect(carried.every((request) => request.method() === "POST")).toBe(true);
      expect(requests.filter((request) => request.url().includes(f.key))).toEqual([]);

      await field.fill(`${term}-nothing`);
      await submit.click();
      await expect(page.getByText(en.queue.noResults, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: en.queue.clearSearch, exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/inquiries?view=mine"));
      await expect(rows(page)).toHaveCount(2);
      await expect(field).toHaveValue("");

      await field.fill(term);
      await submit.click();
      await page
        .getByRole("list", { name: en.queue.results })
        .getByRole("link", { name: new RegExp(f.name("Nikol")) })
        .click();
      await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${f.ids[1]}?view=mine`));
      await expect(
        page.getByRole("heading", { level: 1, name: `RQ-O02-${f.key}-1`, exact: true }),
      ).toBeVisible();
      expect(requests.filter((request) => request.url().includes(f.key))).toEqual([]);
    });
  });

test("O02 empty scopes say what is known, in EN, BG and RU", async ({
  page,
  context,
}, testInfo) => {
  const f = await fixture();
  await signIn(context, f.colleague.token);
  await page.goto(hostUrl("staff", "/en/inquiries?view=unassigned"));
  await expect(
    page.getByRole("heading", { name: en.scopeEmpty.unassigned, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(en.scopeEmptyNotes.unassigned, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: en.queue.checkCoverage, exact: true }),
  ).toHaveAttribute("href", "/en/coverage");
  await expect(page.getByRole("list", { name: en.queue.list, exact: true })).toHaveCount(0);
  await expect(page.getByText(en.queue.open, { exact: true })).toHaveCount(0);

  // O02UNCLAIMED words exactly as designed; then the review scope in BG and RU.
  await page.goto(hostUrl("staff", "/bg/inquiries?view=unassigned"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Запитвания", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Разговори, които със сигурност са свободни.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Няма потвърдени непоети разговори", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Неясният отговорник не означава свободен разговор. Проверете заместването, преди да го поемете.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Проверка на заместването", exact: true }),
  ).toHaveAttribute("href", "/bg/coverage");
  await page.screenshot({ path: testInfo.outputPath("o02-unclaimed-empty.png"), fullPage: true });
  for (const locale of ["bg", "ru"] as const) {
    const copy = workCopy(locale);
    await page.goto(hostUrl("staff", `/${locale}/inquiries?view=review`));
    await expect(
      page.getByRole("heading", { level: 1, name: copy.inbox, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(copy.scopeLeads.review, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: copy.scopeEmpty.review, exact: true }),
    ).toBeVisible();
    const scopes = page.getByRole("navigation", { name: copy.queue.views });
    expect(await scopes.getByRole("link").allTextContents()).toEqual(
      inboxScopes.map((scope) => copy.scopes[scope]),
    );
    await expect(
      scopes.getByRole("link", { name: copy.scopes.review, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel(copy.queue.search, { exact: true })).toBeVisible();
  }

  // The colleague's only readable conversation is the whole of "Mine".
  const ru = workCopy("ru");
  await page.goto(hostUrl("staff", "/ru/inquiries?view=mine"));
  const mine = page.getByRole("list", { name: ru.queue.list, exact: true }).getByRole("listitem");
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText(`${f.name("Elena")} · Консультация продавца`);
  await expect(mine).toContainText("Назначено · Получено 1 час назад");
  await expect(page.getByText(ru.queue.open, { exact: true })).toBeVisible();
});

test("O02 fits the viewport and passes axe, also beside an open conversation", async ({
  page,
  context,
}, testInfo) => {
  const f = await fixture();
  await signIn(context, f.broker.token);
  // The queue and its search hydrate over the server HTML without a mismatch or a crash.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const check = async (name: string) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`o02-${name}.png`), fullPage: true });
  };
  for (const [name, path] of [
    ["all", "/bg/inquiries"],
    ["open", `/bg/inquiries/${f.ids[1]}?view=mine`],
    ["unclaimed", "/bg/inquiries?view=unassigned"],
  ] as const) {
    await page.goto(hostUrl("staff", path));
    await check(name);
  }
  await page.goto(hostUrl("staff", "/en/inquiries?view=mine"));
  await page.getByLabel(en.queue.search, { exact: true }).fill(f.name("Mi"));
  await page.getByRole("button", { name: en.queue.searchSubmit, exact: true }).click();
  await expect(page.getByRole("heading", { name: en.queue.results, exact: true })).toBeVisible();
  await check("search");
  expect(
    errors.filter((text) => /hydrat|did not match|React error|unrecognized/i.test(text)),
  ).toEqual([]);
});
