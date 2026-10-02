import { expect, it } from "vitest";
import { extractLiveSource } from "./capture";

it("retains the recorded WordPress sitemap HTML and its source URLs without executing content", () => {
  const html =
    '<title>XML Sitemap</title><div id="intro"><h1>XML Sitemap</h1><p>Original source explanation</p></div><div id="content"><table><tr><th>URL</th><th>Priority</th><th>Change frequency</th><th>Last modified (GMT)</th></tr><tr><td><a href="/original-page/">https://makler-realty.com/original-page/</a></td><td>60%</td><td>Weekly</td><td>2026-10-01 06:47</td></tr></table></div><div id="footer">Source attribution</div><script>throw Error("executed")</script>';
  const source = extractLiveSource(html, "https://makler-realty.com/sitemap-misc.html");
  expect(source.content_scope).toBe("column:sitemap_main");
  expect(source.extracted_body_text).toBe(
    "XML Sitemap Original source explanation URL Priority Change frequency Last modified (GMT) https://makler-realty.com/original-page/ 60% Weekly 2026-10-01 06:47 Source attribution",
  );
  expect(source.content_links).toEqual([
    {
      url: "https://makler-realty.com/original-page/",
      text: "https://makler-realty.com/original-page/",
    },
  ]);
  expect(source.sold).toBeNull();
  expect(source.extracted_body_text).not.toContain("executed");
  expect(extractLiveSource(html, "https://makler-realty.com/unknown-page/").content_scope).toBe(
    "missing_main_content",
  );
  expect(
    extractLiveSource(
      html.replace("Priority", "Unknown column"),
      "https://makler-realty.com/sitemap-misc.html",
    ).content_scope,
  ).toBe("missing_main_content");
});

it("retains the source article archive while excluding navigation, sidebar and executable chrome", () => {
  const source = extractLiveSource(
    '<html lang="bg"><title>Published news</title><nav>Navigation</nav><div class="row"><div class="col-lg-9"><div><div class="post category_articles"><div class="title"><h2><a href="/original-news/">Original article</a></h2></div><div class="entry"><p>Original summary and facts.</p></div></div><form>Search control</form><script>unsafe()</script></div></div><aside>Sidebar</aside></div></html>',
    "https://makler-realty.com/category/news/",
  );
  expect(source.content_scope).toBe("column:articles_main");
  expect(source.extracted_body_text).toBe("Original article Original summary and facts.");
  expect(source.content_links).toEqual([
    { url: "https://makler-realty.com/original-news/", text: "Original article" },
  ]);
  expect(
    extractLiveSource(
      '<html><title>Unknown</title><aside><div class="post category_articles">Sidebar</div></aside><div class="col-lg-9"><div><h1>Not Found</h1></div></div></html>',
      "https://makler-realty.com/missing/",
    ).content_scope,
  ).toBe("missing_main_content");
});

it("captures the source document title independently from h1 and preserves the untrimmed head description", () => {
  const description = `  ${"Original source description. ".repeat(20)}  `;
  const source = extractLiveSource(
    `<html lang="en"><head><title>Original listing | Source brand</title><meta name="description" content="${description}"></head><body><div class="post_content"><h1>Original heading</h1><p>Source body</p></div></body></html>`,
    "https://makler-realty.com/en/listing/original/",
  );
  expect(source.title).toBe("Original listing | Source brand");
  expect(source.h1).toBe("Original heading");
  expect(source.description).toBe(description);
});

it("preserves safe published external, email and telephone content links without broadening legacy crawl discovery", () => {
  const source = extractLiveSource(
    '<html lang="en"><title>Source</title><nav><a href="https://outside.example/chrome">Chrome</a></nav><div class="post_content_default"><a href="https://outside.example/legal?lang=en#terms">Published terms</a><a href="http://outside.example/original">Original HTTP</a><a href="mailto:public@example.test?subject=Viewing">Published email</a><a href="tel:+359000000000">Published telephone</a><a href="/en/guide/">Legacy guide</a><a href="https://outside.example/unlabelled"></a><a href="javascript:alert(1)">Script</a><a href="data:text/html,unsafe">Data</a><a href="blob:https://outside.example/private">Blob</a><a href="https://user:password@outside.example/">Credentials</a></div></html>',
    "https://makler-realty.com/en/page/",
  );
  expect(source.content_links).toEqual([
    { url: "https://outside.example/legal?lang=en#terms", text: "Published terms" },
    { url: "http://outside.example/original", text: "Original HTTP" },
    { url: "mailto:public@example.test?subject=Viewing", text: "Published email" },
    { url: "tel:+359000000000", text: "Published telephone" },
    { url: "https://makler-realty.com/en/guide/", text: "Legacy guide" },
    { url: "https://outside.example/unlabelled", text: "https://outside.example/unlabelled" },
  ]);
  expect(source.links.map((link) => link.url)).toEqual(["https://makler-realty.com/en/guide/"]);
});

it("preserves actual main text, locale, title and public photos without running scripts or submitting forms", () => {
  const source = extractLiveSource(
    '<html lang="ru-RU"><head><title>Source title</title></head><body><nav>Chrome</nav><main class="post_content_default"><h1>Source title</h1><p>Original body &amp; facts.</p><script>throw Error("run")</script><img src="/wp-content/uploads/photo.jpg" alt="Source caption"></main></body></html>',
    "https://makler-realty.ru/page/",
  );
  expect(source).toMatchObject({
    title: "Source title",
    locale: "ru-RU",
    content_scope: "class:post_content_default",
    extracted_body_text: "Source title Original body & facts.",
    sold: null,
  });
  expect(source.images).toEqual([
    { url: "https://makler-realty.ru/wp-content/uploads/photo.jpg", alt: "Source caption" },
  ]);
  expect(source.extracted_body_text).not.toMatch(/Chrome|run/);
});
it("retains full listing gallery URLs and literal source fields, excluding thumbnail and chrome duplicates", () => {
  const source = extractLiveSource(
    '<html lang="bg-BG"><head><title>Original listing</title></head><body><img src="/wp-content/uploads/contact.png"><div class="archimg_single_listing"><a class="popup" href="/wp-content/uploads/962-1-680x510.jpg"><img src="/wp-content/uploads/962-1-72x72.jpg" alt="Original photo"></a></div><div class="single_post_gallery"><a class="popup" href="/wp-content/uploads/962-1-680x510.jpg"><img src="/wp-content/uploads/962-1-72x72.jpg"></a><a class="popup" href="/wp-content/uploads/962-2-510x680.jpg"></a></div><div class="post_content"><div class="propslist"><span class="proptitle">№:</span><span class="propval">962</span></div><div class="propslist"><span class="proptitle">Цена:</span><span class="current_price">450 €</span></div></div></body></html>',
    "https://makler-realty.com/listing/original/",
  );
  expect(source.listing_reference).toBe("962");
  expect(source.source_fields).toEqual([
    { label: "№:", value: "962" },
    { label: "Цена:", value: "450 €" },
  ]);
  expect(source.images.map((image) => image.url)).toEqual([
    "https://makler-realty.com/wp-content/uploads/962-1-680x510.jpg",
    "https://makler-realty.com/wp-content/uploads/962-2-510x680.jpg",
  ]);
  expect(source.sold).toBeNull();
});
it("a NIC expiration response and a 200 with no main content cannot impersonate a source body", () => {
  const parked = extractLiveSource(
    '<title>Срок регистрации домена истек</title><div class="post_content">Parking text</div>',
    "http://makler-realty.ru/",
  );
  expect(parked.parked).toBe(true);
  expect(parked.extracted_body_text).toBe("");
  expect(
    extractLiveSource("<title>Site</title><nav>Menu only</nav>", "https://makler-realty.com/")
      .content_scope,
  ).toBe("missing_main_content");
});
it("the source archive column preserves taxonomy description, listing summaries and pagination without sidebar/header chrome", () => {
  const source = extractLiveSource(
    '<html lang="bg-BG"><title>Апартамент</title><body><header>Site navigation</header><aside>Partner contacts</aside><div class="col-lg-9"><div class="row" id="scroll-to"><div class="propbox"><h3><a href="/listing/exact/">Original listing</a></h3><span>450 €</span></div></div><div class="category_objects_description"><h1>Апартамент</h1><p>Source category description</p></div><a href="/category-type/apartment/page/2/">2</a><form>Search control text</form></div></body></html>',
    "https://makler-realty.com/category-type/apartment/",
  );
  expect(source.content_scope).toBe("column:archive_main");
  expect(source.extracted_body_text).toBe(
    "Original listing 450 € Апартамент Source category description 2",
  );
  expect(source.content_links).toEqual([
    { url: "https://makler-realty.com/listing/exact/", text: "Original listing" },
    { url: "https://makler-realty.com/category-type/apartment/page/2/", text: "2" },
  ]);
  expect(source.extracted_body_text).not.toMatch(/navigation|Partner|Search/);
});
