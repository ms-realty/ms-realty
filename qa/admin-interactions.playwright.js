// Start PORT=4324 node production/scripts/run-browser-qa-server.mjs, then use
// playwright-cli run-code --filename qa/admin-interactions.playwright.js.
// Isolated QA only: these checks never authenticate against a real account.
async (page) => {
  const base = "http://127.0.0.1:4324";
  if (!page.url().startsWith(base + "/")) throw new Error("Open the local QA server first");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "ms_admin", value: "payload.browser.qa", domain: "127.0.0.1", path: "/" }]);
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + "/admin/today?locale=en&welcome=1");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  if (await page.locator("[data-workspace-welcome]").isVisible()) throw new Error("Dismiss did not hide the welcome banner");
  await page.locator("details").filter({ has: page.locator("[data-workspace-onboarding]") }).locator("summary").first().click();
  await page.locator("[data-workspace-onboarding-dismiss]").click();
  if (await page.locator("[data-workspace-onboarding]").isVisible()) throw new Error("Hide checklist failed");
  await page.reload();
  if (await page.locator("[data-workspace-welcome]").isVisible() || await page.locator("[data-workspace-onboarding]").isVisible()) throw new Error("Dismissed panels reappeared after reload");

  await page.goto(base + "/admin/settings?locale=en");
  if (await page.locator("main form:visible").count()) throw new Error("Settings exposes every form before selection");
  const settings = page.locator("details[data-settings-section]");
  for (let i = 0; i < await settings.count(); i++) {
    await settings.nth(i).locator("summary").first().click();
    if (!await settings.nth(i).evaluate(el => el.open)) throw new Error("Settings disclosure failed");
    await settings.nth(i).locator("summary").first().click();
  }
  await page.goto(base + "/admin/settings?locale=en#settings-agency");
  if (!await page.locator("#settings-agency").evaluate(el => el.open)) throw new Error("Settings deep link failed");

  await page.goto(base + "/admin/connect?locale=en");
  if (await page.locator('[data-provider="ai"] a[href*="action=start"]').count() !== 1) throw new Error("OpenRouter connect action is missing");
  await page.locator('[data-connection-details="google"] summary').click();
  if (!await page.getByRole("button", { name: "Disconnect", exact: true }).isVisible()) throw new Error("Manage connection did not reveal disconnect");
  await page.locator('[data-connection-details="google"] summary').click();
  if (await page.getByRole("button", { name: "Disconnect", exact: true }).isVisible()) throw new Error("Manage connection did not collapse");

  await page.goto(base + "/admin/listings/edit?listingId=MS-00815&locale=en");
  const assist = page.locator("[data-hermes-assist]").first();
  const target = page.locator("#" + await assist.getAttribute("data-hermes-assist-target"));
  const original = await target.inputValue();
  const endpoint = await assist.getAttribute("data-hermes-assist-endpoint");
  // The browser review lifecycle is tested with a deterministic draft. Provider
  // authorization and real model availability have separate runtime checks.
  await page.route("**" + endpoint, route => route.fulfill({ json: { text: "QA proposed text", human_approval_required: true, can_publish: false } }));
  await assist.click();
  await page.locator("[data-hermes-proposal]").waitFor();
  if (await target.inputValue() !== original) throw new Error("Suggestion overwrote text without review");
  await page.locator("[data-hermes-proposal] button").nth(1).click();
  if (await page.locator("[data-hermes-proposal]").count() || await target.inputValue() !== original) throw new Error("Discard failed");
  await assist.click();
  await page.locator("[data-hermes-proposal] button").first().click();
  if (await target.inputValue() !== "QA proposed text") throw new Error("Apply suggestion failed");
  await page.unroute("**" + endpoint);

  page.once("dialog", dialog => dialog.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/admin/today?locale=en");
  const menu = page.locator("[data-admin-mobile-nav]");
  await menu.locator("summary").first().click();
  await page.locator("[data-admin-mobile-nav-close]").click();
  if (await menu.evaluate(el => el.open)) throw new Error("Close mobile menu failed");
  await menu.locator("summary").first().click();
  await page.keyboard.press("Escape");
  if (await menu.evaluate(el => el.open)) throw new Error("Escape did not close mobile menu");
  if (errors.length) throw new Error("Admin script errors: " + errors.join("; "));
  return { passed: ["dismiss", "hide checklist", "persist dismissal", "settings disclosure", "settings deep link", "OpenRouter action", "manage connection", "review suggestion", "discard suggestion", "apply suggestion", "close menu", "Escape menu"], pageErrors: errors };
}
