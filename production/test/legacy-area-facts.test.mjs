import assert from "node:assert/strict";
import test from "node:test";
import { resolveAreaProposal } from "../scripts/apply-legacy-area-facts.mjs";

// Guards the one decision in the applier that publishes a number: which rows of
// the legacy area map may become listing edits without a human.
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
    field: "land_area_sqm",
    value: 4047,
    decided_by: "extractor",
  });
});

test("a row held for review never applies on its own", () => {
  assert.equal(resolveAreaProposal(heldApartment, undefined), null);
  assert.equal(resolveAreaProposal({ ...readyPlot, status: "review" }, undefined), null);
  assert.equal(resolveAreaProposal({ ...readyPlot, proposed_sqm: null }, undefined), null);
});

test("a reviewer decision releases a held row and can restate the value", () => {
  assert.deepEqual(resolveAreaProposal(heldApartment, { action: "assign", target_field: "usable_area_sqm" }), {
    field: "usable_area_sqm",
    value: 59.21,
    decided_by: "override",
  });
  assert.deepEqual(
    resolveAreaProposal(heldApartment, { action: "assign", target_field: "built_area_sqm", area_sqm: 50.65 }),
    { field: "built_area_sqm", value: 50.65, decided_by: "override" },
  );
});

test("a reviewer can withhold a row the extractor was ready to apply", () => {
  assert.equal(resolveAreaProposal(readyPlot, { action: "skip", reason: "plot resurveyed" }), null);
});

test("an override without a decision holds the row rather than guessing", () => {
  assert.equal(resolveAreaProposal(readyPlot, { reason: "looking into it" }), null);
  assert.equal(resolveAreaProposal(heldApartment, { action: "assign" }), null);
  assert.equal(resolveAreaProposal(heldApartment, { action: "assign", target_field: "built_area_sqm", area_sqm: "n/a" }), null);
});
