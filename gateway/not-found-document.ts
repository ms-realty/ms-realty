import bg from "../messages/bg/errors.json" with { type: "json" };
import de from "../messages/de/errors.json" with { type: "json" };
import el from "../messages/el/errors.json" with { type: "json" };
import en from "../messages/en/errors.json" with { type: "json" };
import he from "../messages/he/errors.json" with { type: "json" };
import nl from "../messages/nl/errors.json" with { type: "json" };
import ru from "../messages/ru/errors.json" with { type: "json" };
import { isPublicLocale, sourceLocale, staffLocales } from "../src/domain/ids";

const copy = { bg, de, el, en, he, nl, ru };
const inspectionLimit = 256 * 1024;
type Surface = "public" | "client" | "staff";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );

/** Match the current empty recovery shell conservatively; a future rendered body passes through. */
function blankNextDocument(document: string): boolean {
  if (!/<html\s+id=(["'])__next_error__\1\s*>/i.test(document)) return false;
  const body = /<body(?:\s[^>]*)?>([\s\S]*?)<\/body\s*>/i.exec(document)?.[1];
  if (body === undefined) return false;
  return (
    body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<div\s+hidden(?:=(?:""|''))?\s*>\s*<\/div\s*>/gi, "")
      .trim() === ""
  );
}

function recoveryDocument(path: string, surface: Surface, csp: string | null): string {
  const requested = path.split("/")[1] ?? "";
  const locale =
    isPublicLocale(requested) &&
    (surface !== "staff" || (staffLocales as readonly string[]).includes(requested))
      ? requested
      : sourceLocale;
  const text = copy[locale].notFound;
  const home = `/${locale}${surface === "client" ? "/overview" : surface === "staff" ? "/today" : ""}`;
  // Reuse the origin's style nonce; a stricter policy without a nonce gets readable plain HTML.
  const nonce = /(?:^|;)\s*style-src\s+[^;]*'nonce-([A-Za-z0-9+/_=-]+)'/.exec(csp ?? "")?.[1];
  const style =
    nonce || !csp
      ? `<style${nonce ? ` nonce="${nonce}"` : ""}>body{margin:0;background:#fff;color:#192e27;font:1rem/1.6 system-ui,sans-serif}header,main{max-width:42rem;margin-inline:auto;padding:1.5rem;overflow-wrap:anywhere}header{border-bottom:1px solid #d6dfd9}img{display:block;width:8rem;height:auto}h1{font-size:2rem;line-height:1.25}a{display:inline-flex;align-items:center;min-height:2.75rem;color:#214f3c;font-weight:600}a:focus-visible{outline:3px solid #214f3c;outline-offset:4px}</style>`
      : "";
  return `<!DOCTYPE html><html lang="${locale}" dir="${locale === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(text.title)}</title><link rel="icon" href="/brand/logo-ms-realty.png">${style}</head><body><header><a href="${home}"><img src="/brand/logo-ms-realty.png" width="128" alt="MS Realty"></a></header><main id="main-content"><h1>${escapeHtml(text.title)}</h1><p>${escapeHtml(text.body)}</p><a href="${home}">${escapeHtml(text.home)}</a></main></body></html>`;
}

/**
 * Next's page-thrown notFound() can return a real 404 whose HTML is blank until hydration
 * (vercel/next.js#99287). Recover only that document after the origin has decided the status.
 * No resource or authorization reads happen here. RSC, actions and already rendered 404s
 * keep their original bodies. Delete this shim after the three-host no-JS regression passes
 * against a fixed Next release without it.
 */
export async function recoverNotFoundDocument(
  request: Request,
  response: Response,
  path: string,
  surface: Surface,
): Promise<Response> {
  if (
    request.method !== "GET" ||
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-action") ||
    request.headers.get("accept")?.includes("text/x-component") ||
    response.status !== 404 ||
    !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "") ||
    !response.body
  )
    return response;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  // Never buffer arbitrary origin HTML. If it exceeds the bound, resume its original stream.
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      reader.releaseLock();
      // Keep the origin's status and headers even if its body disconnects. Replay any
      // inspected bytes before propagating the stream error to the response consumer.
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const buffered = chunks.shift();
            if (buffered) controller.enqueue(buffered);
            else controller.error(error);
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, response);
    }
    if (chunk.done) break;
    chunks.push(chunk.value);
    length += chunk.value.byteLength;
    if (length > inspectionLimit) {
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const buffered = chunks.shift();
          if (buffered) {
            controller.enqueue(buffered);
            return;
          }
          try {
            const next = await reader.read();
            if (next.done) {
              reader.releaseLock();
              controller.close();
            } else controller.enqueue(next.value);
          } catch (error) {
            reader.releaseLock();
            controller.error(error);
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            reader.releaseLock();
          }
        },
      });
      return new Response(body, response);
    }
  }
  reader.releaseLock();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!blankNextDocument(new TextDecoder().decode(bytes))) return new Response(bytes, response);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "content-md5", "digest"])
    headers.delete(name);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "private, no-store");
  return new Response(recoveryDocument(path, surface, headers.get("content-security-policy")), {
    status: 404,
    statusText: response.statusText,
    headers,
  });
}
