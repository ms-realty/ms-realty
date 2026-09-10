// Run against the isolated browser QA server with playwright-cli run-code.
async (page) => {
  const base = await page.evaluate(() => location.origin);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Use the local QA server");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/qa-image-fallback", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><main data-react-public-ui="search"><img id="photo" src="/hero/sandanski-town-1280.avif" srcset="/qa-broken.webp 640w" sizes="640px"></main><script src="/vendor/ms-realty-public.js"></script>',
  }));
  await page.route("**/qa-broken.webp", route => route.fulfill({ status: 404, body: "missing" }));
  try {
    await page.goto(base + "/qa-image-fallback");
    await page.waitForFunction(() => {
      const image = document.getElementById("photo");
      return image.complete && image.naturalWidth > 0 && !image.hasAttribute("srcset");
    });
    if (!await page.locator("#photo").isVisible()) throw new Error("Recovered original is hidden");
    if (await page.locator("#photo").getAttribute("src") !== "/hero/sandanski-town-1280.avif") throw new Error("Original source changed");
    if (errors.length) throw new Error(errors.join("; "));
    return { originalFallback: "passed", pageErrors: errors };
  } finally {
    await page.unroute("**/qa-image-fallback");
    await page.unroute("**/qa-broken.webp");
  }
}
