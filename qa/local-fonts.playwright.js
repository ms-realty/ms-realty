// Start the isolated QA server, then playwright-cli run-code --filename this file.
async (page) => {
  const base = await page.evaluate(() => location.origin);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Use the isolated local QA server");
  const errors = [];
  const fontFailures = [];
  const remoteFonts = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url()); });
  page.on("response", response => { if (/\.woff2(?:\?|$)/.test(response.url()) && !response.ok()) fontFailures.push(response.status()); });
  await page.context().addCookies([{ name: "ms_admin", value: "payload.browser.qa", domain: "127.0.0.1", path: "/" }]);
  const results = [];
  for (const [route, locale, sample] of [
    ["/bg", "bg", "Недвижими имоти"], ["/ru", "ru", "Недвижимость"],
    ["/el", "el", "Ακίνητα"], ["/he", "he", "נדלן"],
    ["/en", "en", "Properties"], ["/de", "de", "Immobilien"], ["/nl", "nl", "Woningen"],
    ["/admin/connect?locale=bg", "bg", "Свързване"], ["/admin/login?locale=en", "en", "Sign in"],
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(base + route);
    if (!response.ok()) throw new Error(route + " HTTP " + response.status());
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(({ locale, sample }) => ({
      lang: document.documentElement.lang,
      direction: getComputedStyle(document.documentElement).direction,
      bodyFont: getComputedStyle(document.body).fontFamily,
      loaded: document.fonts.check('400 16px "' + (locale === "he" ? "Noto Sans Hebrew" : "Commissioner") + '"', sample),
      failed: Array.from(document.fonts).filter(font => font.status === "error").map(font => font.family),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }), { locale, sample });
    if (!result.loaded || result.failed.length || result.overflow || result.lang !== locale || (locale === "he" && result.direction !== "rtl")) throw new Error(route + " " + JSON.stringify(result));
    results.push({ route, ...result });
    if (locale === "he" && route === "/he") await page.screenshot({ path: "output/playwright/fonts-hebrew-mobile.png" });
    if (route.startsWith("/admin/connect")) await page.screenshot({ path: "output/playwright/fonts-admin-mobile.png" });
  }
  if (remoteFonts.length || fontFailures.length || errors.length) throw new Error(JSON.stringify({ remoteFonts, fontFailures, errors }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/bg");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "output/playwright/fonts-home-desktop.png" });
  return { kind: "local_font_browser_proof", results, remoteFonts, fontFailures, errors };
}
