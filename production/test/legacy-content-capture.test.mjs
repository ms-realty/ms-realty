import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCmsSeed } from "../lib/runtime.mjs";
import {
  loadLegacyContentCaptures,
  restoredDescriptionFor,
  TRUNCATED_DESCRIPTION_MIN_CHARS,
} from "../lib/legacy-content-capture.mjs";

const CAP = ("Апартамент в центъра. ".repeat(50)).slice(0, TRUNCATED_DESCRIPTION_MIN_CHARS + 5).trim();
const BODY = `Меню Начало ${CAP} и още едно изречение. https://youtu.be/abc Tweet Име Email Телефон Съобщение Изпрати`;

function captureFile(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "legacy-capture-")), "content-inventory.jsonl");
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return file;
}

test("a description cut at the import cap is completed from the legacy capture", () => {
  const file = captureFile([
    { url_type: "listing", status: 200, url: "https://example.test/listing/capped", extracted_body_text: BODY },
    { url_type: "page", status: 200, url: "https://example.test/about", extracted_body_text: "Ignored" },
  ]);
  const captures = loadLegacyContentCaptures(file);

  const restored = restoredDescriptionFor(
    { source_url: "https://example.test/listing/capped", facts: { description: CAP } },
    captures,
  );

  assert.equal(restored, `${CAP} и още едно изречение.`);
  assert.ok(!restored.includes("Tweet"));
  assert.ok(!restored.includes("http"));
  assert.equal(captures.has("https://example.test/about"), false);
});

test("a page that changed after the description was taken is left alone", () => {
  const captures = loadLegacyContentCaptures(
    captureFile([{ url_type: "listing", status: 200, url: "https://example.test/listing/moved", extracted_body_text: BODY }]),
  );

  assert.equal(
    restoredDescriptionFor(
      { source_url: "https://example.test/listing/moved", facts: { description: `${CAP.slice(0, -20)}съвсем друг край` } },
      captures,
    ),
    null,
  );
  assert.equal(
    restoredDescriptionFor({ source_url: "https://example.test/listing/moved", facts: { description: "Кратко." } }, captures),
    null,
  );
  assert.equal(restoredDescriptionFor({ source_url: "https://example.test/listing/absent", facts: { description: CAP } }, captures), null);
});

test("the shipped catalogue keeps no description cut at the import cap", () => {
  const captures = loadLegacyContentCaptures();
  const listings = loadCmsSeed().records.filter((record) => record.collection === "listings");
  const outstanding = listings.filter((record) => restoredDescriptionFor(record, captures));

  assert.deepEqual(outstanding, []);
});
