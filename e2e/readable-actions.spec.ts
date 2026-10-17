// Primary actions must stay readable, and every design-token utility used in screens must resolve
// to real CSS. Guards the slice-0 fix: `text-on-action` and nine other roles once compiled to
// nothing, which left three submit buttons with ~1.1:1 label contrast.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Readable-action browser tests require a disposable database");

const seedEnv = {
  ...process.env,
  AUTH_SECRET: process.env.E2E_AUTH_SECRET,
  DATABASE_URL: url,
  CANONICAL_ORIGIN: "https://makler-realty.com",
};
const seed = <T>(script: string, ...args: string[]): T =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", script, ...args],
      {
        encoding: "utf8",
        env: seedEnv,
      },
    ).trim(),
  ) as T;

/** WCAG contrast of an element's text against the first opaque background behind it. */
async function labelContrast(target: Locator) {
  return target.evaluate((element) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const rgb = (value: string): Rgba | null => {
      const parts = (value.match(/rgba?\(([^)]+)\)/)?.[1] ?? "")
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length < 3) return null;
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    };
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = ({ r, g, b }: Rgba) =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const text = rgb(getComputedStyle(element).color);
    let node: Element | null = element;
    let background: Rgba | null = null;
    while (node) {
      const candidate = rgb(getComputedStyle(node).backgroundColor);
      if (candidate && candidate.a > 0.95) {
        background = candidate;
        break;
      }
      node = node.parentElement;
    }
    background ??= { r: 255, g: 255, b: 255, a: 1 };
    if (!text) return { ratio: 0, text: "unknown", background: "unknown" };
    const hi = Math.max(lum(text), lum(background));
    const lo = Math.min(lum(text), lum(background));
    return {
      ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      text: getComputedStyle(element).color,
      background: `rgb(${background.r}, ${background.g}, ${background.b})`,
    };
  });
}

async function contrastViolations(page: Page, scope?: string) {
  // options() replaces the whole run-options object, so it must come before withRules(); the other
  // order drops runOnly and axe runs every rule.
  const builder = new AxeBuilder({ page })
    .options({ iframes: false })
    .withRules(["color-contrast"]);
  if (scope) builder.include(scope);
  const result = await Promise.race([
    builder.analyze(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("axe color-contrast did not finish in 30 s")), 30000),
    ),
  ]);
  return result.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")));
}

/** Optional evidence for reviewers: one JSON file per key and project, plus element screenshots. */
function saveEvidence(key: string, project: string, value: unknown) {
  const dir = process.env.READABLE_ACTIONS_EVIDENCE;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}-${project}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

async function record(
  page: Page,
  key: string,
  button: Locator,
  info: { project: { name: string } },
  scope?: string,
) {
  await expect(button).toBeVisible();
  const contrast = await labelContrast(button);
  const axe = await contrastViolations(page, scope);
  saveEvidence(key, info.project.name, { contrast, axeColorContrast: axe });
  await button.screenshot({
    path: join(
      process.env.READABLE_ACTIONS_EVIDENCE ?? "test-results",
      `${key}-${info.project.name}.png`,
    ),
  });
  expect(contrast.ratio, `${key}: ${JSON.stringify(contrast)}`).toBeGreaterThanOrEqual(4.5);
  expect(axe, `${key}: axe color-contrast`).toEqual([]);
}

for (const variant of ["intake", "locale"] as const) {
  test(`O32 ${variant}: the source review action is readable`, async ({ context, page }, info) => {
    const data = seed<{ token: string }>("src/features/ai/testing/proposal-seed.ts", variant);
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: data.token,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto(hostUrl("staff", `/en/operations/assistance/${variant}`));
    await record(
      page,
      `o32-${variant}-submit`,
      page.locator("form button[type=submit].bg-action").first(),
      info,
    );
  });
}

// Same no-JavaScript path as e2e/document-requests.spec.ts: the staff form is a native POST.
test.describe("C09 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("C09: the client document upload action is readable", async ({
    context,
    browser,
    page,
  }, info) => {
    test.setTimeout(120000);
    const f = seed<{
      caseId: string;
      staffToken: string;
      clientToken: string;
      participantId: string;
      policyId: string;
    }>("src/server/documents/request-browser-seed.ts");
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: f.staffToken,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/document-requests`));
    const create = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Request a document", exact: true }) });
    await create.getByLabel("Recipient", { exact: true }).selectOption(f.participantId);
    await create.getByLabel("Approved process policy", { exact: true }).selectOption(f.policyId);
    const title = `Readable action ${randomUUID().slice(0, 6)}`;
    await create.getByLabel("Request title", { exact: true }).fill(title);
    await create.getByLabel("Why this document is needed", { exact: true }).fill("Check the plan");
    await create.getByLabel("What to provide", { exact: true }).fill("One readable PDF plan");
    await create
      .getByLabel("Acceptable alternatives", { exact: true })
      .fill("Discuss it with your broker");
    await create
      .getByLabel("Request expires (Europe/Sofia)", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await create.getByRole("button", { name: "Request a document", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    const connection = postgres(url, { max: 1 });
    const [request] = await drizzle(connection, { schema })
      .select({ id: schema.documentRequests.id })
      .from(schema.documentRequests)
      .where(
        and(eq(schema.documentRequests.caseId, f.caseId), eq(schema.documentRequests.title, title)),
      );
    await connection.end();
    if (!request) throw new Error("Document request was not persisted");
    // Measurement (contrast evaluate, axe) needs page JavaScript; only the staff form runs without it.
    const clientContext = await browser.newContext({
      ...info.project.use,
      javaScriptEnabled: true,
    });
    try {
      await clientContext.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const client = await clientContext.newPage();
      await test.step("open the client request", () =>
        client.goto(hostUrl("client", `/en/documents/requests/${request.id}`), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }));
      await record(
        client,
        "c09-upload-submit",
        client.getByRole("button", { name: "Upload and scan" }),
        info,
      );
    } finally {
      await clientContext.close();
    }
  });
});

test("design-token utilities used by screens resolve to real CSS", async ({
  context,
  page,
}, info) => {
  const data = seed<{ token: string }>("src/features/ai/testing/proposal-seed.ts", "intake");
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: data.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const sample = async (target: string) => {
    await page.goto(target);
    return page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const pick = (selector: string, read: (s: CSSStyleDeclaration) => string) =>
        [...document.querySelectorAll(selector)].map((el) => read(getComputedStyle(el)));
      return {
        bodyColor: body.color,
        section: pick(".text-section", (s) => s.fontSize),
        reading: pick(".max-w-reading", (s) => s.maxWidth),
        card: pick(".rounded-card", (s) => s.borderTopLeftRadius),
        accent: pick(".text-accent", (s) => s.color),
      };
    });
  };
  const pages = {
    clientAccess: await sample(hostUrl("client", "/en/access")),
    publicInquire: await sample(hostUrl("public", "/en/inquire")),
    staffAssistance: await sample(hostUrl("staff", "/en/operations/assistance")),
  };
  saveEvidence("utilities", info.project.name, pages);
  const all = Object.values(pages);
  const sections = all.flatMap((p) => p.section);
  const readings = all.flatMap((p) => p.reading);
  const cards = all.flatMap((p) => p.card);
  const accents = all.flatMap((p) => p.accent.map((color) => ({ color, body: p.bodyColor })));
  expect(
    sections.length + readings.length + cards.length,
    "sample found no token utilities",
  ).toBeGreaterThan(0);
  for (const size of sections) expect(Number.parseFloat(size)).toBeGreaterThanOrEqual(20);
  for (const width of readings) expect(width).not.toBe("none");
  for (const radius of cards) expect(radius).not.toBe("0px");
  for (const { color, body } of accents) expect(color).not.toBe(body);
});
