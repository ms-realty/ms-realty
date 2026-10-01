import { createRequire } from "node:module";
import { sha256, sourceIdentity } from "./manifest";

// A narrow bridge to jsdom's public constructor and standard DOM document only.
// No scripts/resources or jsdom-specific window APIs are enabled or consumed.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => { window: { document: Document } };
};

/** Source-only extraction: never execute scripts, submit forms, translate or infer sold from archives. */
export function extractLiveSource(html: string, url: string) {
  sourceIdentity(url);
  const document = new JSDOM(html, { url }).window.document;
  const title = document.title;
  const parked =
    /Срок регистрации домена истек|domain registration has expired|domain is expired/i.test(title);
  const archive = document.querySelector("#scroll-to.row");
  const archiveColumn =
    archive?.parentElement?.classList.contains("col-lg-9") &&
    (archive.querySelector(".propbox") ||
      archive.parentElement.querySelector(".category_objects_description"))
      ? archive.parentElement
      : null;
  const primary = parked
    ? null
    : (document.querySelector(".post_content, .post_content_default") ?? archiveColumn);
  primary?.querySelectorAll("script,style,noscript").forEach((element) => {
    element.remove();
  });
  if (primary === archiveColumn)
    primary?.querySelectorAll("form").forEach((element) => {
      element.remove();
    });
  const chunks: string[] = [];
  if (primary) {
    const walker = document.createTreeWalker(primary, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      chunks.push(node.textContent ?? "");
  }
  const body = chunks.join(" ").replace(/\s+/gu, " ").trim();
  const scope = primary?.classList.contains("post_content")
    ? "class:post_content"
    : primary?.classList.contains("post_content_default")
      ? "class:post_content_default"
      : primary === archiveColumn && primary
        ? "column:archive_main"
        : "missing_main_content";
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].flatMap((link) => {
    try {
      const identity = sourceIdentity(link.href);
      if (
        /^\/wp-(?:content|includes)\//u.test(identity.path) ||
        /\.(?:jpe?g|png|webp|gif|svg|pdf|xml|css|js)$/iu.test(identity.path)
      )
        return [];
      return [{ url: link.href, id: identity.id }];
    } catch {
      return [];
    }
  });
  const gallery = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      ".archimg_single_listing a.popup[href], .single_post_gallery a.popup[href]",
    ),
  ];
  const imageElements = gallery.length
    ? gallery
    : [...(primary?.querySelectorAll<HTMLImageElement>('img[src*="/wp-content/uploads/"]') ?? [])];
  const images = imageElements.flatMap((image) => {
    const raw = image.getAttribute(image.tagName === "A" ? "href" : "src");
    if (!raw) return [];
    try {
      const parsed = new URL(raw, url);
      // The old theme may wrap a public photo in timthumb. Preserve the actual source photo.
      const original = parsed.searchParams.get("src") ?? parsed.href;
      const photo = new URL(original, url);
      sourceIdentity(photo.href);
      if (!photo.pathname.startsWith("/wp-content/uploads/")) return [];
      return [
        {
          url: photo.href,
          alt: image.getAttribute("alt") ?? image.querySelector("img")?.alt ?? "",
        },
      ];
    } catch {
      return [];
    }
  });
  const fields = [...(primary?.querySelectorAll(".propslist") ?? [])]
    .map((field) => ({
      label: field.querySelector(".proptitle")?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
      value:
        field
          .querySelector(".propval, .current_price")
          ?.textContent?.replace(/\s+/gu, " ")
          .trim() ?? "",
    }))
    .filter((field) => field.label && field.value);
  const reference = fields.find((field) => /^(?:ID\s*)?№\s*:/u.test(field.label))?.value ?? null;
  const contentLinks = [...(primary?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])].flatMap(
    (link) => {
      try {
        sourceIdentity(link.href);
        const text = link.textContent?.replace(/\s+/gu, " ").trim();
        return text ? [{ url: link.href, text }] : [];
      } catch {
        return [];
      }
    },
  );
  return {
    title,
    h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    description:
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
    locale: document.documentElement.lang || null,
    parked,
    content_scope: scope,
    extracted_body_text: body,
    text_sha256: sha256(body),
    images: images.filter(
      (image, index) => images.findIndex((other) => other.url === image.url) === index,
    ),
    links: links.filter(
      (link, index) => links.findIndex((other) => other.id === link.id) === index,
    ),
    // A visible source status needs field-level verification. Archive/freeze labels are not status.
    sold: null,
    listing_reference: reference && /^\d+$/u.test(reference) ? reference : null,
    source_fields: fields,
    content_links: contentLinks.filter(
      (link, index) =>
        contentLinks.findIndex((other) => other.url === link.url && other.text === link.text) ===
        index,
    ),
  };
}
