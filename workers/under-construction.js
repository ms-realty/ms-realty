/**
 * "Under construction" placeholder for the public makler-realty.com site.
 *
 * It owns every public path on the zone. Admin, API, media and the SEO files
 * are handed to the ms-realty Worker over a service binding, which passes the
 * original Request through unchanged - same Host, same cookies, no extra hop -
 * so operators keep working while the public site is closed.
 *
 * Deploy:  npx wrangler deploy -c wrangler.under-construction.jsonc
 * Retire:  npx wrangler delete -c wrangler.under-construction.jsonc
 *          (the ms-realty routes underneath take the traffic back)
 */

// ponytail: 503 + Retry-After is the correct signal for a placeholder that will
// be replaced by the real home page at the same URL - crawlers come back
// instead of indexing this. Set to 200 to run it as a normal coming-soon page.
const STATUS = 503;
const RETRY_AFTER_SECONDS = 7 * 24 * 60 * 60;

// locales/registry.json: source_locale + x_default.
const DEFAULT_LOCALE = "bg";

const PHONE_TEXT = "+359 879 69 68 70";
const PHONE_HREF = "tel:+359879696870";
const EMAIL = "ms.realty.bg@gmail.com";

// The public locale set from locales/registry.json. Copy is agency-neutral and
// makes no property claims, and the page is noindex, so AGENTS.md's
// human-approval-before-indexing rule is not in play.
const LOCALES = [
  {
    code: "bg",
    name: "Български",
    dir: "ltr",
    title: "MS Realty - сайтът е в изработка",
    heading: "Сайтът е в изработка",
    body: "Работим по новия сайт на MS Realty. Скоро ще бъдем отново онлайн.",
    contact: "Дотогава се свържете с нас:",
  },
  {
    code: "en",
    name: "English",
    dir: "ltr",
    title: "MS Realty - website under construction",
    heading: "Our website is under construction",
    body: "We are building the new MS Realty website. We will be back online shortly.",
    contact: "In the meantime, get in touch:",
  },
  {
    code: "de",
    name: "Deutsch",
    dir: "ltr",
    title: "MS Realty - Website im Aufbau",
    heading: "Unsere Website befindet sich im Aufbau",
    body: "Wir arbeiten an der neuen MS-Realty-Website. Wir sind in Kürze wieder online.",
    contact: "In der Zwischenzeit erreichen Sie uns hier:",
  },
  {
    code: "nl",
    name: "Nederlands",
    dir: "ltr",
    title: "MS Realty - website in aanbouw",
    heading: "Onze website is in aanbouw",
    body: "We werken aan de nieuwe website van MS Realty. We zijn binnenkort weer online.",
    contact: "Neem in de tussentijd contact met ons op:",
  },
  {
    code: "ru",
    name: "Русский",
    dir: "ltr",
    title: "MS Realty - сайт в разработке",
    heading: "Сайт находится в разработке",
    body: "Мы работаем над новым сайтом MS Realty. Скоро он снова будет доступен.",
    contact: "А пока свяжитесь с нами:",
  },
  {
    code: "el",
    name: "Ελληνικά",
    dir: "ltr",
    title: "MS Realty - ο ιστότοπος είναι υπό κατασκευή",
    heading: "Ο ιστότοπός μας είναι υπό κατασκευή",
    body: "Ετοιμάζουμε τον νέο ιστότοπο της MS Realty. Θα επανέλθουμε σύντομα.",
    contact: "Στο μεταξύ, επικοινωνήστε μαζί μας:",
  },
  {
    code: "he",
    name: "עברית",
    dir: "rtl",
    title: "MS Realty - האתר בבנייה",
    heading: "האתר שלנו בבנייה",
    body: "אנחנו בונים את האתר החדש של MS Realty. נשוב לאוויר בקרוב.",
    contact: "בינתיים, אפשר ליצור איתנו קשר:",
  },
];

/** Best supported locale for an Accept-Language header, DEFAULT_LOCALE otherwise. */
export function pickLocale(acceptLanguage, fallback = DEFAULT_LOCALE) {
  const supported = new Set(LOCALES.map((locale) => locale.code));
  const ranked = String(acceptLanguage || "")
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";");
      const quality = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return {
        code: tag.toLowerCase().split("-")[0],
        q: quality ? Number.parseFloat(quality.slice(2)) : 1,
      };
    })
    .filter((entry) => supported.has(entry.code) && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.length > 0 ? ranked[0].code : fallback;
}

export function renderPage(activeCode) {
  const active = LOCALES.find((locale) => locale.code === activeCode) ?? LOCALES[0];
  const sections = LOCALES.map(
    (locale) => `
      <section data-locale="${locale.code}" data-title="${locale.title}" lang="${locale.code}" dir="${locale.dir}"${
        locale.code === active.code ? "" : " hidden"
      }>
        <h1>${locale.heading}</h1>
        <p class="lede">${locale.body}</p>
        <p class="contact-label">${locale.contact}</p>
      </section>`,
  ).join("");
  const buttons = LOCALES.map(
    (locale) =>
      `<button type="button" data-lang="${locale.code}" lang="${locale.code}"${
        locale.code === active.code ? ' aria-current="true"' : ""
      }>${locale.name}</button>`,
  ).join("");

  return `<!doctype html>
<html lang="${active.code}" dir="${active.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${active.title}</title>
<style>
:root {
  color-scheme: light;
  --canvas: #FAF7F1;
  --surface: #FFFFFF;
  --text-strong: #241F18;
  --text-body: #3A3227;
  --text-muted: #948263;
  --border: #E6DCCB;
  --brick: #C42D2D;
  --ink: #2E2E2E;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--canvas);
  color: var(--text-body);
  font: 400 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  width: min(560px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 48px 40px 32px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(36, 31, 24, .04), 0 12px 32px rgba(36, 31, 24, .06);
}
img.mark { width: 132px; height: auto; margin: 0 auto 32px; }
h1 {
  margin: 0 0 12px;
  font-family: Georgia, "Noto Serif", serif;
  font-size: clamp(24px, 5vw, 30px);
  line-height: 1.25;
  color: var(--text-strong);
}
p { margin: 0; }
.lede { color: var(--text-body); }
.contact-label { margin-top: 28px; color: var(--text-muted); font-size: 15px; }
.contact { margin: 8px 0 0; display: grid; gap: 4px; font-size: 18px; }
.contact a { color: var(--ink); text-decoration: none; font-weight: 600; }
.contact a:hover { text-decoration: underline; text-underline-offset: 3px; }
.contact a.phone { color: var(--brick); }
nav {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 8px;
}
nav button {
  border: 0;
  background: none;
  padding: 4px 8px;
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
}
nav button:hover { color: var(--text-strong); background: var(--canvas); }
nav button[aria-current] { color: var(--text-strong); font-weight: 600; }
:focus-visible { outline: 2px solid var(--brick); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <img class="mark" src="${LOGO}" width="172" height="88" alt="MS Realty">
  ${sections}
  <p class="contact">
    <a class="phone" href="${PHONE_HREF}">${PHONE_TEXT}</a>
    <a href="mailto:${EMAIL}">${EMAIL}</a>
  </p>
  <nav aria-label="Language">${buttons}</nav>
</main>
<noscript><style>nav { display: none; }</style></noscript>
<script>
document.querySelector("nav").addEventListener("click", (event) => {
  const code = event.target.closest("[data-lang]")?.dataset.lang;
  if (!code) return;
  for (const section of document.querySelectorAll("[data-locale]")) {
    section.hidden = section.dataset.locale !== code;
    if (!section.hidden) {
      document.title = section.dataset.title;
      document.documentElement.lang = code;
      document.documentElement.dir = section.dir;
    }
  }
  for (const button of document.querySelectorAll("[data-lang]")) {
    if (button.dataset.lang === code) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
});
</script>
</body>
</html>`;
}

// First path segment of everything that must keep reaching the app: the admin
// UI and its assets, the API, both media prefixes (owned + legacy WordPress),
// the media ingest boundary, MCP, and the SEO files - AGENTS.md requires crawl
// parity for makler-realty.com, so robots.txt and sitemap.xml stay the app's
// answer rather than this Worker's.
const SERVICE_PATHS = [
  "/admin",
  "/api",
  "/payload-admin",
  "/graphql",
  "/graphql-playground",
  "/mcp",
  "/media",
  "/wp-content",
  "/__media",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

/** True for app-owned paths, matched on segment boundaries so /administrator is public. */
export function isServicePath(pathname) {
  return SERVICE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** makler-realty.ru is the Russian edition; every other host defaults to the source locale. */
export function defaultLocaleForHost(hostname) {
  return String(hostname || "").toLowerCase().endsWith(".ru") ? "ru" : DEFAULT_LOCALE;
}

/** The locale a public URL already names, so a deep link keeps its language. */
export function localeFromPath(pathname) {
  const first = String(pathname || "").split("/")[1]?.toLowerCase();
  return LOCALES.some((locale) => locale.code === first) ? first : "";
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (env?.APP && isServicePath(pathname)) return env.APP.fetch(request);
    const locale =
      localeFromPath(pathname) ||
      pickLocale(request.headers.get("accept-language"), defaultLocaleForHost(new URL(request.url).hostname));
    return new Response(renderPage(locale), {
      status: STATUS,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": String(RETRY_AFTER_SECONDS),
        "x-robots-tag": "noindex, nofollow",
        vary: "Accept-Language",
      },
    });
  },
};

// makler-realty-design-system/project/assets/logo-ms-realty.png, inlined so the
// page is a single request with no origin and no asset binding to keep alive.
const LOGO = "data:image/png;base64,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";
