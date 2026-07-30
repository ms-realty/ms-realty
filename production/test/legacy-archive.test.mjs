import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildLegacyArchiveFromFile } from "../lib/legacy-archive.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRow({ url, url_type = "page", content_scope = "class:post_content_default", extracted_body_text, ...rest }) {
  return {
    status: 200,
    url,
    source_domain: "makler-realty.com",
    url_type,
    content_scope,
    text_sha256: sha256(extracted_body_text),
    response_sha256: sha256("response:" + url),
    captured_at_utc: "2026-07-29T12:39:33+00:00",
    extracted_body_text,
    ...rest,
  };
}

test("legacy archive keeps exact primary page and post bodies only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-legacy-archive-"));
  const sourcePath = path.join(root, "content-inventory.jsonl");
  const pageUrl = "https://makler-realty.com/a";
  const rawPageText = "  Оригинален\nтекст без редакция  ";
  const fallbackText = "fallback text must not be archived";

  fs.writeFileSync(
    sourcePath,
    [
      sourceRow({ url: "https://makler-realty.ru/z", url_type: "post", content_scope: "class:post_content", extracted_body_text: "Публикация." }),
      sourceRow({ url: pageUrl, extracted_body_text: rawPageText }),
      sourceRow({ url: pageUrl, extracted_body_text: "Duplicate URL must not replace the first source row." }),
      sourceRow({ url: "https://makler-realty.com/fallback", content_scope: "document_text_fallback", extracted_body_text: fallbackText }),
      sourceRow({ url: "https://makler-realty.com/taxonomy", url_type: "taxonomy", extracted_body_text: "Taxonomy must not be archived." }),
      sourceRow({ url: "https://makler-realty.com/listing", url_type: "listing", extracted_body_text: "Listing must not be archived." }),
      sourceRow({ url: "https://makler-realty.com/not-found", status: 404, extracted_body_text: "Non-200 must not be archived." }),
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );

  try {
    const archive = buildLegacyArchiveFromFile(sourcePath);
    assert.deepEqual(archive, buildLegacyArchiveFromFile(sourcePath));
    assert.deepEqual(archive.summary, {
      source_rows: 7,
      eligible_rows: 3,
      archive_rows: 2,
      excluded_rows: 4,
      duplicate_url_rows: 1,
    });
    assert.deepEqual(
      archive.entries.map((entry) => entry.source_url),
      [pageUrl, "https://makler-realty.ru/z"],
    );
    assert.deepEqual(archive.entries[0], {
      archive_id: sha256(pageUrl),
      source_url: pageUrl,
      source_domain: "makler-realty.com",
      source_type: "page",
      content_scope: "class:post_content_default",
      text_sha256: sha256(rawPageText),
      response_sha256: sha256("response:" + pageUrl),
      captured_at_utc: "2026-07-29T12:39:33+00:00",
      extracted_body_text: rawPageText,
    });
    assert.equal(JSON.stringify(archive).includes(fallbackText), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
