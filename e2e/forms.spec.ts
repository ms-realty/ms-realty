// S1b / UI07, UI28, S11–S17: real Server Action + useActionState, native HTML and receipt.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();
const scanning = new WeakSet<Page>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Next's development overlay and axe's temporary contrast probes use inline styles.
    // Ignore only these traced tool sources, never application CSP or React errors.
    const styleProbe = message.text().startsWith("Applying inline style violates");
    const source = message.location().url;
    if (styleProbe && (source.includes("next-devtools") || (scanning.has(page) && source === "")))
      return;
    errors.push(message.text());
  });
});

async function scanAccessibility(page: Page) {
  scanning.add(page);
  try {
    return await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
  } finally {
    scanning.delete(page);
  }
}
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test("UI05 pending keeps width and prevents a second submission while the real response is delayed", async ({
  page,
}) => {
  await page.goto("/en/design/forms");
  await page
    .getByRole("textbox", { name: "Practice subject", exact: true })
    .fill("Pending practice example");
  let release: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submitted = 0;
  await page.route("**/en/design/forms", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted += 1;
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  const button = page.getByRole("button", { name: "Check practice form", exact: true });
  const width = (await button.boundingBox())?.width;
  await button.click();
  const pending = page.getByRole("button", { name: "Checking practice form…", exact: true });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  expect((await pending.boundingBox())?.width).toBe(width);
  await pending.click({ force: true });
  await expect(
    page.getByRole("textbox", { name: "Practice subject", exact: true }),
  ).toHaveAttribute("readonly", "");
  expect(submitted).toBe(1);
  release?.();
  await expect(page.getByRole("heading", { name: "Practice form checked" })).toBeVisible();
});

test("UI06 field: a 52 px canvas control under a 14/20 label; an error keeps the 1 px border in red with a 14/20 message 8 px under it", async ({
  page,
}) => {
  await page.goto("/en/design/forms");
  const subject = page.getByRole("textbox", { name: "Practice subject", exact: true });
  const look = () =>
    subject.evaluate((input) => {
      const label = input.closest(".group")?.querySelector("label");
      const error = document.getElementById(`${input.id}-error`);
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const text = label ? getComputedStyle(label) : null;
      const message = error ? getComputedStyle(error) : null;
      return {
        height: box.height,
        fill: style.backgroundColor,
        border: `${style.borderTopWidth} ${style.borderTopColor}`,
        label: text && `${text.fontSize}/${text.lineHeight} ${text.fontWeight}`,
        labelGap: label?.nextElementSibling
          ? label.nextElementSibling.getBoundingClientRect().top -
            label.getBoundingClientRect().bottom
          : null,
        errorGap: error ? error.getBoundingClientRect().top - box.bottom : null,
        errorText: message && `${message.fontSize}/${message.lineHeight} ${message.fontWeight}`,
      };
    });
  // Figma UI06 Input (6:74): 52 px on the canvas fill, label 14/20 semibold, 8 px apart.
  expect(await look()).toEqual({
    height: 52,
    fill: "rgb(248, 247, 243)",
    border: "1px rgb(104, 122, 111)",
    label: "14px/20px 600",
    labelGap: 8,
    errorGap: null,
    errorText: null,
  });
  await subject.fill("ab");
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  await expect(subject).toHaveAttribute("aria-invalid", "true");
  // UI06 Error (6:68, 6:67) and O12 694:13318: the 1 px border in the error colour, the
  // 14/20 medium message 8 px under the field, and the same 52 px row. Polled: the border
  // colour eases in over the 150 ms colour transition.
  await expect.poll(look).toMatchObject({
    height: 52,
    border: "1px rgb(161, 42, 37)",
    errorGap: 8,
    errorText: "14px/20px 500",
  });
});

test("UI07 textarea: a 144 px writing surface with 16 px padding and the 8 px panel radius", async ({
  page,
}) => {
  await page.goto("/en/design/forms");
  const note = page.getByRole("textbox", { name: "Practice note (optional)", exact: true });
  const look = () =>
    note.evaluate((area) => {
      const style = getComputedStyle(area);
      return {
        height: area.getBoundingClientRect().height,
        padding: style.padding,
        radius: style.borderTopLeftRadius,
        fill: style.backgroundColor,
        border: `${style.borderTopWidth} ${style.borderTopColor}`,
      };
    });
  // Figma UI07 Textarea (6:85): at least 144 px, 16 px padding, the 8 px panel radius.
  expect(await look()).toEqual({
    height: 144,
    padding: "16px",
    radius: "8px",
    fill: "rgb(248, 247, 243)",
    border: "1px rgb(104, 122, 111)",
  });
  await note.fill("x".repeat(2001));
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  await expect(note).toHaveAttribute("aria-invalid", "true");
  // An error only recolours the 1 px border (polled through the colour transition); the
  // surface keeps its padding and 144 px.
  await expect.poll(look).toMatchObject({
    height: 144,
    padding: "16px",
    border: "1px rgb(161, 42, 37)",
  });
});

test("S11 validation retains input, repeats focus recovery and opens a confirmed practice receipt", async ({
  page,
  context,
}) => {
  await page.goto("/en/design/forms");
  const subject = page.getByRole("textbox", { name: "Practice subject", exact: true });
  const note = page.getByRole("textbox", { name: "Practice note (optional)", exact: true });
  const operation = await page.locator('[name="_operationId"]').inputValue();
  expect(operation).toMatch(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{32}$/);
  await subject.fill("ab");
  await note.fill("Preserve this fictional practice text");
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  const summary = page.getByRole("region", { name: "Check the form" });
  await expect(summary).toBeFocused();
  await expect(subject).toHaveValue("ab");
  await expect(note).toHaveValue("Preserve this fictional practice text");
  await expect(page.locator('[name="_operationId"]')).toHaveValue(operation);
  await summary.getByRole("link").click();
  await expect(subject).toBeFocused();
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  await expect(summary).toBeFocused();
  const accessibility = await scanAccessibility(page);
  expect(accessibility.violations).toEqual([]);
  await subject.fill("Fictional subject");
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  const receipt = page.getByRole("heading", { name: "Practice form checked" });
  await expect(receipt).toBeFocused();
  await page.getByRole("link", { name: "Open practice receipt" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice form checked");
  const receiptUrl = page.url();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice form checked");
  const cookie = (await context.cookies()).find((entry) => entry.name === "msr_form_specimen");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/en/design/forms");
  expect(cookie?.sameSite).toBe("Lax");
  expect(Buffer.from(cookie?.value.split(".")[0] ?? "", "base64url").toString()).not.toContain(
    "Fictional subject",
  );
  await context.clearCookies();
  await page.goto(receiptUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "We could not confirm the result.",
  );
  await expect(page.getByText("Practice form checked", { exact: true })).toHaveCount(0);
});

test("S14 revision conflict preserves values and requires reviewed reapply with a new server identity", async ({
  page,
}) => {
  await page.goto("/en/design/forms?scenario=conflict");
  const subject = page.getByRole("textbox", { name: "Practice subject", exact: true });
  const note = page.getByRole("textbox", { name: "Practice note (optional)", exact: true });
  const originalOperation = await page.locator('[name="_operationId"]').inputValue();
  await subject.fill("My fictional revision");
  await note.fill("Keep this note during comparison");
  await page.getByRole("button", { name: "Check practice form", exact: true }).click();
  await expect(page.getByText("Current text: A fictional practice draft")).toBeVisible();
  await expect(subject).toHaveValue("My fictional revision");
  await expect(note).toHaveValue("Keep this note during comparison");
  await expect(page.locator('[name="_expectedRevision"]')).toHaveValue("1");
  const newOperation = await page.locator('[name="_reapplyOperationId"]').inputValue();
  expect(newOperation).not.toBe(originalOperation);
  await expect(page.getByRole("heading", { name: "Practice form checked" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reapply my reviewed text" }).click();
  await expect(page.getByRole("heading", { name: "Practice form checked" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open practice receipt" })).toHaveAttribute(
    "href",
    `/en/design/forms/receipt?operation=${encodeURIComponent(newOperation)}`,
  );
});

test("S11 Hebrew form keeps logical layout and accessible error associations", async ({ page }) => {
  await page.goto("/he/design/forms");
  await page.getByRole("button", { name: "בדיקת טופס התרגול", exact: true }).click();
  await expect(page.getByRole("region", { name: "בדקו את הטופס" })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const accessibility = await scanAccessibility(page);
  expect(accessibility.violations).toEqual([]);
});

test.describe("AT01 native HTML form baseline", () => {
  test.use({ javaScriptEnabled: false });
  test("validation retains input and correction produces a reopenable receipt without JavaScript", async ({
    page,
  }) => {
    await page.goto("/en/design/forms");
    await expect(page.getByText(/This form also works without JavaScript/)).toBeVisible();
    const subject = page.getByRole("textbox", { name: "Practice subject", exact: true });
    const note = page.getByRole("textbox", { name: "Practice note (optional)", exact: true });
    const operation = await page.locator('[name="_operationId"]').inputValue();
    await subject.fill("ab");
    await note.fill("Keep native form text");
    await page.getByRole("button", { name: "Check practice form", exact: true }).click();
    await expect(page.getByRole("region", { name: "Check the form" })).toBeVisible();
    await expect(subject).toHaveValue("ab");
    await expect(note).toHaveValue("Keep native form text");
    await expect(page.locator('[name="_operationId"]')).toHaveValue(operation);
    expect(page.url()).not.toContain("Keep");
    await subject.fill("Native form example");
    await page.getByRole("button", { name: "Check practice form", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Practice form checked" })).toBeVisible();
    await page.getByRole("link", { name: "Open practice receipt" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice form checked");
  });

  test("conflict shows both versions and explicit reapply works without JavaScript", async ({
    page,
  }) => {
    await page.goto("/en/design/forms?scenario=conflict");
    await page
      .getByRole("textbox", { name: "Practice subject", exact: true })
      .fill("Native conflict example");
    await page.getByRole("button", { name: "Check practice form", exact: true }).click();
    await expect(page.getByText("Current text: A fictional practice draft")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Practice subject", exact: true })).toHaveValue(
      "Native conflict example",
    );
    await page.getByRole("button", { name: "Reapply my reviewed text" }).click();
    await expect(page.getByRole("heading", { name: "Practice form checked" })).toBeVisible();
  });
});
