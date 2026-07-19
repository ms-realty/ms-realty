import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readAuditLog } from "../lib/audit-log.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { fromRoot } from "../lib/paths.mjs";
import {
  appendListingPublicationSchedule,
  assertListingPublicationSchedules,
  buildListingPublicationScheduleQueue,
  cancelListingPublicationSchedule,
  executeDueListingPublicationSchedules,
  readListingPublicationSchedules,
} from "../lib/listing-publication-schedules.mjs";

function files() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-publication-schedules-"));
  const output = {
    schedules: path.join(directory, "publication-schedules.jsonl"),
    edits: path.join(directory, "listing-edits.jsonl"),
    translations: path.join(directory, "translation-tasks.jsonl"),
  };
  for (const file of Object.values(output)) fs.writeFileSync(file, "");
  return output;
}

test("publication schedules are human-owned, future-dated, single-open, cancellable, and retry-safe", () => {
  const paths = files();
  const seed = loadCmsSeed();
  const input = {
    id: "publication-schedule-review-1",
    listingId: "MS-CRAWL-0001",
    action: "unpublish",
    scheduledAt: "2026-07-20T10:00:00.000Z",
    actor: "content_editor",
    note: "Retain the legacy URL as an archived listing page.",
  };
  const created = appendListingPublicationSchedule(seed, input, {
    filePath: paths.schedules,
    createdAt: "2026-07-19T10:00:00.000Z",
  });
  assert.equal(created.target_status, "archived");
  assert.equal(created.idempotent, false);
  assert.equal(
    appendListingPublicationSchedule(seed, input, {
      filePath: paths.schedules,
      createdAt: "2026-07-21T10:00:00.000Z",
    }).idempotent,
    true,
  );
  assert.throws(
    () =>
      appendListingPublicationSchedule(seed, { ...input, note: "A different request using the same id." }, {
        filePath: paths.schedules,
        createdAt: "2026-07-19T10:00:00.000Z",
      }),
    /already in use/,
  );
  assert.throws(
    () =>
      appendListingPublicationSchedule(
        seed,
        {
          listingId: "MS-CRAWL-0001",
          action: "publish",
          scheduledAt: "2026-07-21T10:00:00.000Z",
          actor: "content_editor",
        },
        { filePath: paths.schedules, createdAt: "2026-07-19T10:00:00.000Z" },
      ),
    /Cancel the existing/,
  );
  assert.throws(
    () =>
      appendListingPublicationSchedule(
        seed,
        {
          listingId: "MS-CRAWL-0002",
          action: "publish",
          scheduledAt: "2026-07-21T10:00:00.000Z",
          actor: "hermes_agent",
        },
        { filePath: paths.schedules, createdAt: "2026-07-19T10:00:00.000Z" },
      ),
    /Hermes cannot/,
  );
  assert.equal(buildListingPublicationScheduleQueue(readListingPublicationSchedules(paths.schedules), { now: "2026-07-19T12:00:00Z" }).summary.upcoming, 1);

  const cancelled = cancelListingPublicationSchedule(
    { scheduleId: input.id, actor: "content_editor", reason: "Owner changed the launch date." },
    { filePath: paths.schedules, cancelledAt: "2026-07-19T12:00:00Z" },
  );
  assert.equal(cancelled.idempotent, false);
  assert.equal(
    cancelListingPublicationSchedule(
      { scheduleId: input.id, actor: "content_editor", reason: "Owner changed the launch date." },
      { filePath: paths.schedules, cancelledAt: "2026-07-19T12:00:00Z" },
    ).idempotent,
    true,
  );
  const rows = readListingPublicationSchedules(paths.schedules);
  assertListingPublicationSchedules(rows);
  assert.equal(buildListingPublicationScheduleQueue(rows, { now: "2026-07-21T12:00:00Z" }).summary.cancelled, 1);
});

test("due publication execution appends an attributed listing edit and preserves the archived URL record", () => {
  const paths = files();
  const seed = loadCmsSeed();
  appendListingPublicationSchedule(
    seed,
    {
      id: "publication-unpublish-due-1",
      listingId: "MS-CRAWL-0001",
      action: "unpublish",
      scheduledAt: "2026-07-20T10:00:00.000Z",
      actor: "content_editor",
    },
    { filePath: paths.schedules, createdAt: "2026-07-19T10:00:00.000Z" },
  );

  const result = executeDueListingPublicationSchedules({
    seed,
    schedules: readListingPublicationSchedules(paths.schedules),
    executor: "content_editor",
    now: "2026-07-20T10:00:00.000Z",
    scheduleFilePath: paths.schedules,
    listingEditFilePath: paths.edits,
    translationLedgerPath: paths.translations,
  });
  assert.equal(result.executed, 1);
  assert.equal(result.results[0].event.approved_by, "content_editor");
  assert.equal(result.results[0].event.resulting_status, "archived");
  assert.equal(readListingEdits(paths.edits).length, 1);
  const archived = applyListingEdits(seed, readListingEdits(paths.edits)).records.find((row) => row.id === "MS-CRAWL-0001");
  assert.equal(archived.facts.listing_status, "archived");
  assert.ok(archived.source_url, "the retained source-backed listing record remains addressable");
  assertListingPublicationSchedules(readListingPublicationSchedules(paths.schedules));

  const retry = executeDueListingPublicationSchedules({
    seed: applyListingEdits(seed, readListingEdits(paths.edits)),
    schedules: readListingPublicationSchedules(paths.schedules),
    executor: "content_editor",
    now: "2026-07-20T10:05:00.000Z",
    scheduleFilePath: paths.schedules,
    listingEditFilePath: paths.edits,
    translationLedgerPath: paths.translations,
  });
  assert.equal(retry.executed, 0);
  assert.equal(readListingEdits(paths.edits).length, 1);
});

test("publication scheduler CLI executes only due human-approved changes and is retry-safe", () => {
  const paths = { ...files(), audit: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-publication-audit-")), "audit.jsonl") };
  fs.writeFileSync(paths.audit, "");
  appendListingPublicationSchedule(
    loadCmsSeed(),
    {
      id: "publication-cli-due-1",
      listingId: "MS-CRAWL-0002",
      action: "unpublish",
      scheduledAt: "2026-07-20T10:00:00.000Z",
      actor: "content_editor",
    },
    { filePath: paths.schedules, createdAt: "2026-07-19T10:00:00.000Z" },
  );
  const run = () =>
    spawnSync(process.execPath, [fromRoot("production", "scripts", "run-listing-publication-schedules.mjs")], {
      cwd: fromRoot(),
      encoding: "utf8",
      env: {
        ...process.env,
        MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH: paths.schedules,
        MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.edits,
        MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translations,
        MS_REALTY_AUDIT_LOG_PATH: paths.audit,
        MS_REALTY_LISTING_PUBLICATION_EXECUTOR: "publication_scheduler",
        MS_REALTY_LISTING_PUBLICATION_AT: "2026-07-20T10:00:00.000Z",
      },
    });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).executed, 1);
  assert.equal(readListingEdits(paths.edits).length, 1);
  assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), ["listing_publication_executed"]);

  const retry = run();
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).executed, 0);
  assert.equal(readListingEdits(paths.edits).length, 1);
  assert.equal(readAuditLog(paths.audit).length, 1);
});
