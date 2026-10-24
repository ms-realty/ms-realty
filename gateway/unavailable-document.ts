import tokens from "../design/tokens.json" with { type: "json" };
import bg from "../messages/bg/errors.json" with { type: "json" };
import de from "../messages/de/errors.json" with { type: "json" };
import el from "../messages/el/errors.json" with { type: "json" };
import en from "../messages/en/errors.json" with { type: "json" };
import he from "../messages/he/errors.json" with { type: "json" };
import nl from "../messages/nl/errors.json" with { type: "json" };
import ru from "../messages/ru/errors.json" with { type: "json" };
import { isPublicLocale, sourceLocale } from "../src/domain/ids";

const copy = { bg, de, el, en, he, nl, ru };
const colors = tokens.color;
const style = `body{margin:0;background:${colors.canvas.$value.hex};color:${colors.text.$value.hex};font:1rem/1.625 system-ui,sans-serif}header,main{box-sizing:border-box;max-inline-size:42.5rem;margin-inline:auto;padding-inline:1.25rem;overflow-wrap:anywhere}header{padding-block:2rem;font-weight:600}main{padding-block:clamp(2rem,8vh,6rem)}h1{font-size:clamp(1.75rem,4vw,2rem);line-height:1.25;margin-block:0 1rem}p{margin-block:0 1.5rem}.receipt{color:${colors["text-muted"].$value.hex};margin-block:2rem 0}a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-block-size:2.75rem;padding:.75rem 1.25rem;border-radius:.375rem;background:${colors.action.$value.hex};color:${colors["text-inverse"].$value.hex};font-weight:600;text-decoration:none}a:hover{background:${colors["action-hover"].$value.hex}}a:focus-visible{outline:3px solid ${colors.focus.$value.hex};outline-offset:3px}@media(forced-colors:active){a{border:1px solid ButtonText}}`;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );

/** A browser document for a closed gateway; no resource reads, retries or release changes. */
export async function withUnavailableDocument(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status !== 503) return response;
  const path = new URL(request.url).pathname;
  const requestedLocale = path.split("/")[1] ?? "";
  const locale = isPublicLocale(requestedLocale) ? requestedLocale : sourceLocale;
  const resourcePath = isPublicLocale(requestedLocale) ? path.slice(locale.length + 1) : path;
  const destination = request.headers.get("sec-fetch-dest");
  if (
    request.method !== "GET" ||
    !request.headers
      .get("accept")
      ?.split(",")
      .some((part) => {
        const [type, ...parameters] = part.trim().toLowerCase().split(";");
        return type === "text/html" && !parameters.some((p) => /^\s*q=0(?:\.0*)?\s*$/.test(p));
      }) ||
    (destination && destination !== "document") ||
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-action") ||
    request.headers.get("accept")?.includes("text/x-component") ||
    /^\/(?:api(?:\/|$)|__|_next(?:\/|$))/.test(resourcePath) ||
    /^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")
  )
    return response;

  const text = copy[locale];
  const hash = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(style))),
    ),
  );
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "content-md5", "digest"])
    headers.delete(name);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  );
  // An empty href reloads this document, preserving its path/query without reflecting a token
  // into HTML. It is always GET: a previous save/send can only be retried from its receipt.
  const html = `<!DOCTYPE html><html lang="${locale}" dir="${locale === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(text.unavailable.title)} · MS Realty</title><style>${style}</style></head><body><header><bdi>MS Realty</bdi></header><main id="main-content"><h1>${escapeHtml(text.unavailable.title)}</h1><p>${escapeHtml(text.unavailable.body)}</p><a href="">${escapeHtml(text.generic.retry)}</a><p class="receipt">${escapeHtml(text.recovery.actionOutcome)}</p></main></body></html>`;
  return new Response(html, { status: 503, headers });
}
