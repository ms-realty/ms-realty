// O03 / F18 step 4: link an owned inquiry to an existing authorized Case (C02), reviewed on
// O03L and recorded on O03LR (Figma 20:1055 / 25:2228 and 20:1175 / 25:2279). Fixtures are
// synthetic and self-seeded on the disposable browser database; not live release evidence.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { inquiryLinkCopy } from "../src/features/cases/inquiry-link-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

const copy = inquiryLinkCopy("bg");

type Fixture = {
  staffId: string;
  token: string;
  colleagueToken: string;
  inquiryId: string;
  inquiryReference: string;
  partyId: string;
  taskId: string;
  caseA: { id: string; reference: string };
  caseB: { id: string; reference: string };
  lonelyInquiryId: string;
};

function seed() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/cases/inquiry-link-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ),
  ) as Fixture;
}

async function signedIn(browser: Browser, token: string, options: BrowserContextOptions) {
  const context = await browser.newContext(options);
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
  return { context, page: await context.newPage() };
}

// Only the failed-read test holds Case participants exclusively, and only in its isolated run.
// Every other test here still reads candidates under this shared lock, so even a run that
// includes it never renders O03 into that window.
const gate = "e2e-o03-case-candidates";
const readingCandidates = (run: () => Promise<void>) =>
  connection.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock_shared(hashtext(${gate}))`;
    await run();
  });

const inquiryPage = (id: string) => hostUrl("staff", `/bg/inquiries/${id}`);
const reviewPage = (inquiryId: string, caseId: string) =>
  hostUrl("staff", `/bg/inquiries/${inquiryId}/link?case=${caseId}`);
const submit = (page: Page) => page.getByRole("button", { name: copy.submit, exact: true });
const operationKey = (page: Page) => page.locator('input[name="_operationId"]').inputValue();

async function fits(page: Page) {
  const width = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

/** What C02 must leave alone: the inquiry's source, its task promise, participants and grants. */
async function recorded(f: Fixture) {
  const [inquiry] = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.id, f.inquiryId));
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, f.taskId));
  if (!inquiry || !task) throw new Error("Missing synthetic inquiry or task");
  const participants = await db
    .select({ id: schema.caseParticipants.id, partyId: schema.caseParticipants.partyId })
    .from(schema.caseParticipants)
    .where(eq(schema.caseParticipants.caseId, f.caseA.id))
    .orderBy(asc(schema.caseParticipants.id));
  const inquiryPartyCases = await db
    .select({ id: schema.caseParticipants.id })
    .from(schema.caseParticipants)
    .where(eq(schema.caseParticipants.partyId, f.partyId));
  const grants = await db
    .select({ id: schema.grants.id })
    .from(schema.grants)
    .where(and(eq(schema.grants.principalId, f.staffId), isNull(schema.grants.revokedAt)))
    .orderBy(asc(schema.grants.id));
  return { inquiry, task, participants, inquiryPartyCases, grants };
}

/** The C02 integration-test scope: Case B is readable, but only Case A may be changed. */
async function scopedAccess(f: Fixture) {
  await db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, f.staffId));
  const scoped = [
    { capability: "inquiry.read", recordType: "inquiry", recordId: f.inquiryId },
    { capability: "inquiry.respond", recordType: "inquiry", recordId: f.inquiryId },
    { capability: "task.manage", recordType: "task", recordId: f.taskId },
    { capability: "case.read", recordType: "case", recordId: f.caseA.id },
    { capability: "case.read", recordType: "case", recordId: f.caseB.id },
    { capability: "case.transition", recordType: "case", recordId: f.caseA.id },
  ] as const;
  await db.insert(schema.grants).values(
    scoped.map((grant) => ({
      ...grant,
      principalId: f.staffId,
      reason: "Synthetic O03 scoped access",
    })),
  );
}

for (const javaScriptEnabled of [true, false]) {
  const mode = javaScriptEnabled ? "hydrated" : "native";

  test(`O03 / F18: ${mode} review links the owned inquiry to an existing Case and keeps its party, receipt and promise`, async ({
    browser,
  }, info) => {
    const f = seed();
    const { context, page } = await signedIn(browser, f.token, {
      ...info.project.use,
      javaScriptEnabled,
    });
    try {
      await readingCandidates(async () => {
        await page.goto(inquiryPage(f.inquiryId));
        const section = page.locator("[data-inquiry-case-link]");
        await expect(section.getByRole("heading", { level: 2, name: copy.title })).toBeVisible();
        const rowA = section.locator(`[data-case-candidate="${f.caseA.id}"]`);
        const rowB = section.locator(`[data-case-candidate="${f.caseB.id}"]`);
        for (const text of [
          f.caseA.reference,
          "Synthetic buyer case",
          copy.stages.needs_agreed,
          copy.basisContact,
        ])
          await expect(rowA).toContainText(text);
        for (const text of [f.caseB.reference, "Synthetic seller case", copy.stages.assessment])
          await expect(rowB).toContainText(text);
        // The two choices stay distinct: a Case row reviews a link, this opens Case creation.
        await expect(section.getByRole("link", { name: copy.create, exact: true })).toHaveAttribute(
          "href",
          `/bg/cases/new?inquiry=${f.inquiryId}`,
        );
        await fits(page);
        if (javaScriptEnabled) await accessible(page);
        const before = await recorded(f);
        expect(before.inquiry.caseId).toBeNull();

        await rowA.getByRole("link").click();
        await expect(page).toHaveURL(reviewPage(f.inquiryId, f.caseA.id));
        await expect(page.getByRole("heading", { level: 1, name: copy.linkTitle })).toBeVisible();
        await expect(page.getByRole("main")).toContainText(f.caseA.reference);
        await expect(
          page.getByRole("heading", { level: 2, name: copy.effectsTitle }),
        ).toBeVisible();
        for (const effect of [
          copy.effectJoins.replace("{case}", f.caseA.reference),
          copy.effectVisible.replace("{case}", f.caseA.reference),
          copy.effectKept,
          copy.effectNot,
          copy.matchWarning,
        ])
          await expect(page.getByText(effect, { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: copy.back, exact: true })).toHaveAttribute(
          "href",
          `/bg/inquiries/${f.inquiryId}`,
        );
        await fits(page);
        if (javaScriptEnabled) await accessible(page);
        expect((await recorded(f)).inquiry).toEqual(before.inquiry);

        await submit(page).click();
        await expect(page.getByRole("heading", { level: 1, name: copy.resultTitle })).toBeVisible();
        await expect(page).toHaveURL(/\/bg\/inquiries\/[0-9a-f-]+\/link\?key=/);
        await expect(page.getByRole("heading", { level: 2 })).toHaveText(
          copy.resultHeading.replace("{case}", f.caseA.reference),
        );
        await expect(page.getByText(copy.resultNote, { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: copy.openCase, exact: true })).toHaveAttribute(
          "href",
          `/bg/cases/${f.caseA.id}`,
        );
        await expect(page.getByRole("link", { name: new RegExp(copy.nextStep) })).toHaveAttribute(
          "href",
          `/bg/tasks/${f.taskId}`,
        );
        await fits(page);
        if (javaScriptEnabled) await accessible(page);
        await page.screenshot({ path: info.outputPath(`o03lr-${mode}.png`), fullPage: true });

        const after = await recorded(f);
        const { caseId, state, version, updatedAt, ...source } = after.inquiry;
        const {
          caseId: _was,
          state: _from,
          version: _v,
          updatedAt: _at,
          ...original
        } = before.inquiry;
        expect({ caseId, state, version }).toEqual({
          caseId: f.caseA.id,
          state: "linked_to_case",
          version: before.inquiry.version + 1,
        });
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.inquiry.updatedAt.getTime());
        expect(source).toEqual(original);
        expect(after.task).toMatchObject({
          caseId: f.caseA.id,
          ownerId: f.staffId,
          promisedToClient: true,
          dueAt: before.task.dueAt,
          title: before.task.title,
        });
        expect(after.participants).toEqual(before.participants);
        expect(after.inquiryPartyCases).toEqual([]);
        expect(after.grants).toEqual(before.grants);

        // A linked inquiry offers no second link.
        await page.getByRole("link", { name: copy.backToInquiry, exact: true }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: f.inquiryReference }),
        ).toBeVisible();
        await expect(page.locator("[data-inquiry-case-link]")).toHaveCount(0);
      });
    } finally {
      await context.close();
    }
  });

  test(`O03 / F18: ${mode} a Case without transition access is not linkable and a revoked submit is refused`, async ({
    browser,
  }, info) => {
    const f = seed();
    await scopedAccess(f);
    const { context, page } = await signedIn(browser, f.token, {
      ...info.project.use,
      javaScriptEnabled,
    });
    try {
      await readingCandidates(async () => {
        await page.goto(inquiryPage(f.inquiryId));
        const section = page.locator("[data-inquiry-case-link]");
        const rowB = section.locator(`[data-case-candidate="${f.caseB.id}"]`);
        await expect(rowB).toContainText(f.caseB.reference);
        await expect(rowB).toContainText(`${copy.notLinkable} · ${copy.reasonAccess}`);
        await expect(rowB.getByRole("link")).toHaveCount(0);
        // Scoped access cannot create a Case, so only the existing-Case choice is offered.
        await expect(section.getByRole("link", { name: copy.create, exact: true })).toHaveCount(0);
        await fits(page);
        if (javaScriptEnabled) await accessible(page);
        await section.screenshot({ path: info.outputPath(`o03-not-linkable-${mode}.png`) });

        await section.locator(`[data-case-candidate="${f.caseA.id}"]`).getByRole("link").click();
        await expect(submit(page)).toBeVisible();
        const before = await recorded(f);
        await db
          .update(schema.grants)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.grants.principalId, f.staffId),
              eq(schema.grants.capability, "case.transition"),
            ),
          );
        await submit(page).click();
        // Hydrated, the action's own refusal; native, the re-read review names the same gap.
        await expect(
          page.getByText(javaScriptEnabled ? copy.denied : copy.reasonAccess, { exact: true }),
        ).toBeVisible();
        await expect(submit(page)).toHaveCount(0);
        if (javaScriptEnabled) await accessible(page);
        await page.screenshot({
          path: info.outputPath(`o03l-refused-${mode}.png`),
          fullPage: true,
        });
        const after = await recorded(f);
        expect(after.inquiry).toEqual(before.inquiry);
        expect(after.task).toEqual(before.task);
      });
    } finally {
      await context.close();
    }
  });

  test(`O03 / F18: ${mode} a Case changed after review is a conflict that links nothing and reloads fresh`, async ({
    browser,
  }, info) => {
    const f = seed();
    const { context, page } = await signedIn(browser, f.token, {
      ...info.project.use,
      javaScriptEnabled,
    });
    try {
      await readingCandidates(async () => {
        await page.goto(reviewPage(f.inquiryId, f.caseA.id));
        await expect(submit(page)).toBeVisible();
        const staleKey = await operationKey(page);
        await db
          .update(schema.cases)
          .set({ version: sql`${schema.cases.version} + 1` })
          .where(eq(schema.cases.id, f.caseA.id));
        await submit(page).click();
        await expect(page.getByText(copy.conflict, { exact: true })).toBeVisible();
        await expect(submit(page)).toHaveCount(0);
        expect((await recorded(f)).inquiry.caseId).toBeNull();
        if (javaScriptEnabled) await accessible(page);
        await page.screenshot({
          path: info.outputPath(`o03l-conflict-${mode}.png`),
          fullPage: true,
        });

        // The refused attempt keeps its own truthful status; it never turns into a link.
        const status = await context.newPage();
        await status.goto(
          hostUrl("staff", `/bg/inquiries/${f.inquiryId}/link?key=${encodeURIComponent(staleKey)}`),
        );
        await expect(status.getByText(copy.statusFailed, { exact: true })).toBeVisible();
        await status.close();

        await page.getByRole("link", { name: copy.reloadReview, exact: true }).click();
        await expect(page).toHaveURL(reviewPage(f.inquiryId, f.caseA.id));
        expect(await operationKey(page)).not.toBe(staleKey);
        await submit(page).click();
        await expect(page.getByRole("heading", { level: 1, name: copy.resultTitle })).toBeVisible();
        expect((await recorded(f)).inquiry.caseId).toBe(f.caseA.id);
      });
    } finally {
      await context.close();
    }
  });
}

test("O03 / F18: other owners and tasks already in another Case explain why a Case cannot be linked", async ({
  browser,
}, info) => {
  const f = seed();
  const colleague = await signedIn(browser, f.colleagueToken, { ...info.project.use });
  const owner = await signedIn(browser, f.token, { ...info.project.use });
  try {
    await readingCandidates(async () => {
      // Another broker sees the same suggestions but only the inquiry's owner may link it.
      await colleague.page.goto(inquiryPage(f.inquiryId));
      const shared = colleague.page.locator("[data-inquiry-case-link]");
      await expect(shared).toContainText(copy.reasonOwner);
      await expect(shared.locator("[data-case-candidate]")).toHaveCount(2);
      await expect(shared.locator("[data-case-candidate] a")).toHaveCount(0);
      await expect(shared.locator(`[data-case-candidate="${f.caseA.id}"]`)).toContainText(
        copy.notLinkable,
      );
      await colleague.page.goto(reviewPage(f.inquiryId, f.caseA.id));
      await expect(colleague.page.getByText(copy.reasonOwner, { exact: true })).toBeVisible();
      await expect(submit(colleague.page)).toHaveCount(0);

      // A follow-up already bound to Case B leaves only Case B linkable for the owner.
      await db
        .update(schema.tasks)
        .set({ caseId: f.caseB.id })
        .where(eq(schema.tasks.id, f.taskId));
      await owner.page.goto(inquiryPage(f.inquiryId));
      const section = owner.page.locator("[data-inquiry-case-link]");
      await expect(section.locator(`[data-case-candidate="${f.caseA.id}"]`)).toContainText(
        `${copy.notLinkable} · ${copy.reasonTask}`,
      );
      await expect(
        section.locator(`[data-case-candidate="${f.caseB.id}"]`).getByRole("link"),
      ).toHaveAttribute("href", `/bg/inquiries/${f.inquiryId}/link?case=${f.caseB.id}`);
      await accessible(owner.page);
    });
  } finally {
    await colleague.context.close();
    await owner.context.close();
  }
});

test("O03 / F18: the result shows only the actor's own link; other keys, inquiries and Cases show nothing", async ({
  browser,
}, info) => {
  const f = seed();
  const owner = await signedIn(browser, f.token, { ...info.project.use });
  const colleague = await signedIn(browser, f.colleagueToken, { ...info.project.use });
  try {
    await readingCandidates(async () => {
      // Not one of this inquiry's suggestions: nothing about that Case is shown.
      await owner.page.goto(reviewPage(f.lonelyInquiryId, f.caseA.id));
      await expect(owner.page.getByText(copy.notCandidate, { exact: true })).toBeVisible();
      await expect(owner.page.getByRole("main")).not.toContainText(f.caseA.reference);
      await expect(submit(owner.page)).toHaveCount(0);

      // Every render issues its own key; this one is never submitted.
      const spare = await owner.context.newPage();
      await spare.goto(reviewPage(f.inquiryId, f.caseA.id));
      const unused = await operationKey(spare);
      await spare.close();
      await owner.page.goto(reviewPage(f.inquiryId, f.caseA.id));
      expect(await operationKey(owner.page)).not.toBe(unused);
      await submit(owner.page).click();
      await expect(
        owner.page.getByRole("heading", { level: 1, name: copy.resultTitle }),
      ).toBeVisible();
      const result = new URL(owner.page.url());
      const key = result.searchParams.get("key") ?? "";

      // Another broker who can read the inquiry still cannot read this staff member's receipt.
      await colleague.page.goto(result.toString());
      await expect(colleague.page.getByText(copy.statusMissing, { exact: true })).toBeVisible();
      await expect(colleague.page.getByRole("main")).not.toContainText(f.caseA.reference);
      // An issued key that was never submitted has no recorded link either.
      await owner.page.goto(
        hostUrl("staff", `/bg/inquiries/${f.inquiryId}/link?key=${encodeURIComponent(unused)}`),
      );
      await expect(owner.page.getByText(copy.statusMissing, { exact: true })).toBeVisible();
      // A key is bound to its own inquiry, and a made-up key is not a key at all.
      for (const target of [
        `/bg/inquiries/${f.lonelyInquiryId}/link?key=${encodeURIComponent(key)}`,
        `/bg/inquiries/${f.inquiryId}/link?key=${randomUUID()}`,
      ]) {
        const response = await owner.page.goto(hostUrl("staff", target));
        expect(response?.status()).toBe(404);
      }
      // The linked inquiry's review now only says so and points to its Case.
      await owner.page.goto(reviewPage(f.inquiryId, f.caseB.id));
      await expect(owner.page.getByText(copy.alreadyLinked, { exact: true })).toBeVisible();
      await expect(
        owner.page.getByRole("link", { name: copy.openCase, exact: true }),
      ).toHaveAttribute("href", `/bg/cases/${f.caseA.id}`);
      await expect(submit(owner.page)).toHaveCount(0);
    });
  } finally {
    await owner.context.close();
    await colleague.context.close();
  }
});

test("O03 / F18: the review and result routes require a staff session", async ({ page }) => {
  for (const path of [
    `/bg/inquiries/${randomUUID()}/link?case=${randomUUID()}`,
    `/bg/inquiries/${randomUUID()}/link?key=missing`,
  ]) {
    await page.goto(hostUrl("staff", path));
    await expect(page).toHaveURL(hostUrl("staff", "/bg/access"));
  }
});

test("O03 / F18: a failed candidate read never reads as no matching Case", async ({
  browser,
}, info) => {
  // The fault locks case_participants, which other workers' Case reads share, so like the O01
  // failed-read case (today-unavailable.spec.ts) it runs only in a separate single-worker run
  // after the parallel suite, in one engine, which is enough for server-rendered state:
  //   E2E_O03_UNAVAILABLE=1 npx playwright test e2e/inquiry-case-link.spec.ts --workers=1 --project=chromium-desktop --grep "a failed candidate read"
  test.skip(
    process.env.E2E_O03_UNAVAILABLE !== "1" ||
      info.config.workers !== 1 ||
      info.project.name !== "chromium-desktop",
    "Locks a shared table: use the isolated single-worker run after the parallel suite.",
  );
  const f = seed();
  const { context, page } = await signedIn(browser, f.token, { ...info.project.use });
  try {
    const section = page.locator("[data-inquiry-case-link]");
    await readingCandidates(async () => {
      await page.goto(inquiryPage(f.lonelyInquiryId));
      await expect(section.locator('[data-candidates="empty"]')).toContainText(copy.emptyTitle);
      await expect(section.getByText(copy.failedTitle, { exact: true })).toHaveCount(0);
      await expect(section.locator("[data-case-candidate]")).toHaveCount(0);
      await section.screenshot({ path: info.outputPath("o03-empty.png") });
    });

    // The candidate read is the only O03 query that touches Case participants. Holding them
    // makes it fail fast (its statement timeout) while the rest of the page still renders.
    await connection.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${gate}))`;
      await tx`lock table case_participants in access exclusive mode`;
      await page.goto(inquiryPage(f.inquiryId));
      await expect(section.locator('[data-candidates="failed"]')).toContainText(copy.failedTitle);
    });
    await expect(section.getByText(copy.emptyTitle, { exact: true })).toHaveCount(0);
    await expect(section.locator("[data-case-candidate]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: f.inquiryReference })).toBeVisible();
    await accessible(page);
    await section.screenshot({ path: info.outputPath("o03-failed.png") });

    await readingCandidates(async () => {
      await section.getByRole("link", { name: copy.reload, exact: true }).click();
      await expect(section.locator("[data-case-candidate]")).toHaveCount(2);
    });
  } finally {
    await context.close();
  }
});

test("O03 / F18: candidates, review and result fit 320, 390 and 1440 without horizontal scroll", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "one engine measures every width");
  test.setTimeout(120_000);
  const f = seed();
  const widths = [1440, 390, 320] as const;
  const visit = async (width: number, run: (page: Page) => Promise<void>) => {
    const { context, page } = await signedIn(browser, f.token, {
      viewport: { width, height: 900 },
    });
    try {
      await run(page);
    } finally {
      await context.close();
    }
  };
  await readingCandidates(async () => {
    for (const width of widths)
      await visit(width, async (page) => {
        await page.goto(inquiryPage(f.inquiryId));
        await expect(page.locator("[data-case-candidate]")).toHaveCount(2);
        await fits(page);
        await page.screenshot({ path: info.outputPath(`o03-${width}.png`), fullPage: true });
        await page.goto(reviewPage(f.inquiryId, f.caseA.id));
        await expect(submit(page)).toBeVisible();
        await fits(page);
        await accessible(page);
        await page.screenshot({ path: info.outputPath(`o03l-${width}.png`), fullPage: true });
      });
    let result = "";
    await visit(1440, async (page) => {
      await page.goto(reviewPage(f.inquiryId, f.caseA.id));
      await submit(page).click();
      await expect(page.getByRole("heading", { level: 1, name: copy.resultTitle })).toBeVisible();
      result = page.url();
    });
    for (const width of widths)
      await visit(width, async (page) => {
        await page.goto(result);
        await expect(page.getByRole("heading", { level: 1, name: copy.resultTitle })).toBeVisible();
        await fits(page);
        await accessible(page);
        await page.screenshot({ path: info.outputPath(`o03lr-${width}.png`), fullPage: true });
      });
  });
});
