import { pathToFileURL } from "node:url";

export async function probePublicHold(fetchImpl = fetch) {
  const urls = ["makler-realty.com", "www.makler-realty.com", "makler-realty.ru", "www.makler-realty.ru"].flatMap((host) =>
    ["/", ...["bg", "en", "de", "nl", "ru", "el", "he"].map((locale) => `/${locale}`), "/bg/imoti/MS-CRAWL-0001", "/portfolio/", "/administrator", "/unknown-public-page"].map((path) => `https://${host}${path}`),
  );
  const checks = await Promise.all(urls.map(async (url) => {
    const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    const pass = response.status === 503 && response.headers.get("x-robots-tag")?.includes("noindex") && Number(response.headers.get("retry-after")) > 0 && text.includes('data-locale="bg"');
    return { url, status: response.status, pass: Boolean(pass) };
  }));
  const report = { kind: "public_construction_hold", checked_at: new Date().toISOString(), pass: checks.every((check) => check.pass), checks };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) throw new Error("The public construction hold is incomplete");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await probePublicHold();
