import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveAreaProposal, run } from "../scripts/apply-legacy-area-facts.mjs";

// Guards the one decision in the applier that publishes a number: which rows of
// the legacy area map may become listing edits without a human, and what a
// reviewed decision is allowed to say.
const readyPlot = {
  new_reference: "MS-CRAWL-0036",
  status: "ready",
  target_field: "land_area_sqm",
  proposed_sqm: 4047,
  review_reasons: [],
};
const heldApartment = {
  new_reference: "MS-CRAWL-0007",
  status: "review",
  target_field: null,
  proposed_sqm: 59.21,
  review_reasons: ["field_choice_required"],
};

test("a resolved row applies with the field the extractor could prove", () => {
  assert.deepEqual(resolveAreaProposal(readyPlot, undefined), {
    facts: { land_area_sqm: 4047 },
    decided_by: "extractor",
  });
});

test("a row held for review never applies on its own", () => {
  assert.equal(resolveAreaProposal(heldApartment, undefined), null);
  assert.equal(resolveAreaProposal({ ...readyPlot, status: "review" }, undefined), null);
  assert.equal(resolveAreaProposal({ ...readyPlot, proposed_sqm: null }, undefined), null);
});

test("a reviewer decision states the facts it releases", () => {
  assert.deepEqual(resolveAreaProposal(heldApartment, { action: "assign", facts: { usable_area_sqm: 59.21 } }), {
    facts: { usable_area_sqm: 59.21 },
    decided_by: "override",
  });
});

test("a house whose legacy post published both areas releases both", () => {
  assert.deepEqual(
    resolveAreaProposal(
      { ...heldApartment, new_reference: "MS-CRAWL-0015" },
      { action: "assign", facts: { built_area_sqm: 110, land_area_sqm: 350 } },
    ),
    { facts: { built_area_sqm: 110, land_area_sqm: 350 }, decided_by: "override" },
  );
});

test("stated facts win over the single-field form and the extractor's value", () => {
  assert.deepEqual(
    resolveAreaProposal(heldApartment, {
      action: "assign",
      facts: { land_area_sqm: 1180 },
      target_field: "built_area_sqm",
      area_sqm: 60,
    }),
    { facts: { land_area_sqm: 1180 }, decided_by: "override" },
  );
});

test("the older single-field decision still resolves", () => {
  assert.deepEqual(resolveAreaProposal(heldApartment, { action: "assign", target_field: "usable_area_sqm" }), {
    facts: { usable_area_sqm: 59.21 },
    decided_by: "override",
  });
  assert.deepEqual(
    resolveAreaProposal(heldApartment, { action: "assign", target_field: "built_area_sqm", area_sqm: 50.65 }),
    { facts: { built_area_sqm: 50.65 }, decided_by: "override" },
  );
});

test("a reviewer can withhold a row the extractor was ready to apply", () => {
  assert.equal(resolveAreaProposal(readyPlot, { action: "skip", reason: "plot resurveyed" }), null);
  assert.equal(
    resolveAreaProposal(readyPlot, { action: "skip", facts: { land_area_sqm: 4047 } }),
    null,
    "a withheld row stays withheld even when the file still carries its numbers",
  );
});

test("an override without a usable decision holds the row rather than guessing", () => {
  assert.equal(resolveAreaProposal(readyPlot, { reason: "looking into it" }), null);
  assert.equal(resolveAreaProposal(heldApartment, { action: "assign" }), null);
  assert.equal(resolveAreaProposal(heldApartment, { action: "assign", facts: {} }), null);
  assert.equal(resolveAreaProposal(heldApartment, { action: "assign", target_field: "built_area_sqm", area_sqm: "n/a" }), null);
});

test("one unusable number holds the whole decision", () => {
  assert.equal(
    resolveAreaProposal(heldApartment, { action: "assign", facts: { built_area_sqm: 110, land_area_sqm: null } }),
    null,
    "half a decision is not the decision that was reviewed",
  );
});

// The write path: a run against a scratch ledger, so the real one is untouched.
const AREA_MAP = {
  records: [
    { ...readyPlot, property_family: "plot", legacy_domain: "makler-realty.com", legacy_post_id: 11, source_meta_key: "wtf_area", area: { raw: "4047" }, total_area: { raw: null } },
    {
      new_reference: "MS-CRAWL-0015",
      status: "review",
      target_field: null,
      proposed_sqm: 110,
      review_reasons: ["field_choice_required"],
      property_family: "house",
      legacy_domain: "makler-realty.com",
      legacy_post_id: 22,
      source_meta_key: "wtf_area",
      area: { raw: "110" },
      total_area: { raw: "350" },
    },
    { ...heldApartment, property_family: "apartment", legacy_domain: "makler-realty.ru", legacy_post_id: 33, source_meta_key: "wtf_area", area: { raw: "59,21" }, total_area: { raw: null } },
  ],
};
const OVERRIDES = {
  "MS-CRAWL-0015": { action: "assign", confidence: "high", reason: "both areas are labelled", facts: { built_area_sqm: 110, land_area_sqm: 350 } },
  "MS-CRAWL-0007": { action: "skip", confidence: "high", reason: "the range spans several units" },
};

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-area-"));
  const write = (name, value) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };
  return {
    dir,
    mapPath: write("map.json", AREA_MAP),
    overridesPath: write("overrides.json", OVERRIDES),
    ledgerFilePath: path.join(dir, "listing-edits.jsonl"),
  };
}

test("a dry run writes nothing", () => {
  const paths = scratch();
  try {
    const result = run({ apply: false, ...paths });
    assert.equal(result.planned.length, 2);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.applied, 0);
    assert.equal(fs.existsSync(paths.ledgerFilePath), false, "the dry run must not create a ledger");
  } finally {
    fs.rmSync(paths.dir, { recursive: true, force: true });
  }
});

test("applying writes one pending-review edit per decision, and repeats without duplicating", () => {
  const paths = scratch();
  try {
    const first = run({ apply: true, ...paths });
    assert.equal(first.applied, 2);
    const rows = fs
      .readFileSync(paths.ledgerFilePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      rows.map((row) => row.id),
      ["legacy-area-MS-CRAWL-0036", "legacy-area-MS-CRAWL-0015"],
    );
    const house = rows.find((row) => row.id === "legacy-area-MS-CRAWL-0015");
    assert.deepEqual(house.property_patch, { built_area_sqm: 110, land_area_sqm: 350 });
    assert.equal(house.review_source, "legacy_wordpress_postmeta");
    assert.match(house.review_notes, /wtf_area='110', wtf_total_area='350'/);
    for (const entry of house.property_fact_verification) {
      assert.equal(entry.state, "entered_pending_review", "a recovered area is never a confirmed fact");
    }
    const second = run({ apply: true, ...paths });
    assert.equal(second.applied, 0, "a second run adds nothing");
    assert.equal(fs.readFileSync(paths.ledgerFilePath, "utf8").split("\n").filter(Boolean).length, 2);
  } finally {
    fs.rmSync(paths.dir, { recursive: true, force: true });
  }
});
