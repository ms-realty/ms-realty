import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { updateNextAction } from "./commands";
import { readCaseMessages } from "./queries";
import { readStaffCaseContacts } from "./staff-contacts";
import { caseFixture } from "./testing";
import { readCaseTimeline } from "./timeline";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("O05/O26 records exact next-action attribution internally and keeps audit separately authorized", async () => {
  const f = await caseFixture(t.db);
  const before = await readCaseTimeline(t.db, f.staff.session, f.record.id);
  expect(before.audit).toBeNull();
  const changed = await updateNextAction(t.db, f.staff.session, {
    id: f.record.id,
    expectedVersion: f.record.version,
    operationId: randomUUID(),
    nextAction: "Human-reviewed next action",
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    clientSummary: "Curated client summary",
    reason: "Internal synthetic reason",
  });
  const view = await readCaseTimeline(t.db, f.staff.session, f.record.id);
  expect(
    view.activity.find((entry) => entry.messageKey === "case.next_action_recorded")?.params,
  ).toMatchObject({
    nextAction: "Human-reviewed next action",
    reason: "Internal synthetic reason",
    previousRevision: f.record.version,
    revision: changed.outcome.version,
  });
  expect(JSON.stringify(await readCaseMessages(t.db, f.client.session, f.record.id))).not.toContain(
    "Internal synthetic reason",
  );
  await expect(readCaseTimeline(t.db, f.client.session, f.record.id)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(readStaffCaseContacts(t.db, f.client.session, f.record.id)).rejects.toMatchObject({
    code: "forbidden",
  });
  await t.db.insert(grants).values({
    principalId: f.staff.id,
    capability: "audit.read",
    recordType: "case",
    recordId: f.record.id,
    reason: "Synthetic scoped audit access",
  });
  expect(
    (await readCaseTimeline(t.db, f.staff.session, f.record.id)).audit?.some(
      (entry) => entry.action === "case.next_action_recorded",
    ),
  ).toBe(true);
});
