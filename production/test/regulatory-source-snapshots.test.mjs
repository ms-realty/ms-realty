import assert from "node:assert/strict";
import test from "node:test";
import {
  approveRegulatorySourceSnapshot,
  buildRegulatorySourceSnapshot,
  compareRegulatorySourceSnapshots,
} from "../lib/regulatory-source-snapshots.mjs";

const sourceIds = ["bg_cadastre", "gr_cadastre"];

function digest(char) {
  return `sha256:${char.repeat(64)}`;
}

function receipt(sourceId, char, fetchedAt = "2026-07-30T08:00:00.000Z") {
  return {
    sourceId,
    receiptRef: `receipt://${sourceId}/${char}`,
    contentDigest: digest(char),
    fetchedAt,
  };
}

function snapshot(receipts, capturedAt = "2026-07-30T09:00:00.000Z") {
  return buildRegulatorySourceSnapshot({ sourceIds, receipts, capturedAt });
}

function approvedSnapshot(receipts = [receipt("bg_cadastre", "a"), receipt("gr_cadastre", "b")]) {
  return approveRegulatorySourceSnapshot(snapshot(receipts), {
    professionalRef: "professional://lawyer/bg-gr-1",
    evidenceRef: "evidence://review/2026-07-30",
    approvedAt: "2026-07-30T10:00:00.000Z",
  });
}

test("regulatory source snapshots use a stable digest independent of receipt order", () => {
  const first = snapshot([receipt("bg_cadastre", "a"), receipt("gr_cadastre", "b")]);
  const reordered = snapshot([receipt("gr_cadastre", "b"), receipt("bg_cadastre", "a")]);

  assert.deepEqual(first, reordered);
  assert.equal(first.sources.map((source) => source.source_id).join(","), "bg_cadastre,gr_cadastre");
  assert.match(first.source_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.snapshot_id, `regulatory-source-${first.source_digest.slice(7, 23)}`);
});

test("comparison flags changed source content and only its jurisdiction", () => {
  const approved = approvedSnapshot();
  const current = snapshot([receipt("bg_cadastre", "c"), receipt("gr_cadastre", "b")], "2026-07-31T09:00:00.000Z");
  const comparison = compareRegulatorySourceSnapshots({
    approvedSnapshot: approved,
    currentSnapshot: current,
    now: "2026-07-31T10:00:00.000Z",
    maxAgeDays: 7,
  });

  assert.deepEqual(comparison.changed_source_ids, ["bg_cadastre"]);
  assert.deepEqual(comparison.failed_source_ids, []);
  assert.deepEqual(comparison.stale_source_ids, []);
  assert.deepEqual(comparison.affected_jurisdictions, ["BG"]);
  assert.equal(comparison.requires_professional_review, true);
});

test("comparison independently flags failed and stale regulatory sources", () => {
  const approved = approvedSnapshot();
  const current = snapshot(
    [
      receipt("bg_cadastre", "a", "2026-06-01T08:00:00.000Z"),
      {
        sourceId: "gr_cadastre",
        status: "failed",
        receiptRef: "receipt://gr_cadastre/timeout",
        fetchedAt: "2026-07-30T08:00:00.000Z",
        failureCode: "timeout",
      },
    ],
    "2026-07-30T09:00:00.000Z",
  );
  const comparison = compareRegulatorySourceSnapshots({
    approvedSnapshot: approved,
    currentSnapshot: current,
    now: "2026-07-30T10:00:00.000Z",
    maxAgeDays: 7,
  });

  assert.deepEqual(comparison.failed_source_ids, ["gr_cadastre"]);
  assert.deepEqual(comparison.stale_source_ids, ["bg_cadastre"]);
  assert.deepEqual(comparison.affected_jurisdictions, ["BG", "GR"]);
  assert.equal(comparison.sources.find((source) => source.source_id === "gr_cadastre").reasons[0], "timeout");
});

test("approval is explicit professional evidence and cannot approve a failed snapshot", () => {
  const unapproved = snapshot([receipt("bg_cadastre", "a"), receipt("gr_cadastre", "b")]);
  assert.throws(
    () =>
      compareRegulatorySourceSnapshots({
        approvedSnapshot: unapproved,
        currentSnapshot: unapproved,
        now: "2026-07-30T10:00:00.000Z",
      }),
    /professional approval reference and evidence/i,
  );
  assert.throws(
    () => approveRegulatorySourceSnapshot(unapproved, { evidenceRef: "evidence://review", approvedAt: "2026-07-30T10:00:00.000Z" }),
    /approval reference/i,
  );
  const incomplete = buildRegulatorySourceSnapshot({
    sourceIds,
    receipts: [receipt("bg_cadastre", "a")],
    capturedAt: "2026-07-30T09:00:00.000Z",
  });
  assert.throws(
    () =>
      approveRegulatorySourceSnapshot(incomplete, {
        professionalRef: "professional://lawyer/bg-gr-1",
        evidenceRef: "evidence://review/2026-07-30",
        approvedAt: "2026-07-30T10:00:00.000Z",
      }),
    /failed sources/i,
  );
});

test("source snapshots reject raw fetched material and retain only references and digests", () => {
  assert.throws(
    () =>
      snapshot([
        { ...receipt("bg_cadastre", "a"), html: "<html>raw official page</html>" },
        receipt("gr_cadastre", "b"),
      ]),
    /unsupported field/i,
  );
  assert.throws(
    () => snapshot([{ ...receipt("bg_cadastre", "a"), receiptRef: "<html>raw official page</html>" }, receipt("gr_cadastre", "b")]),
    /opaque reference/i,
  );
  const result = snapshot([receipt("bg_cadastre", "a"), receipt("gr_cadastre", "b")]);
  assert.equal(JSON.stringify(result).includes("raw official page"), false);
  assert.equal(Object.hasOwn(result.sources[0], "html"), false);
});
