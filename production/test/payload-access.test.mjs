import test from "node:test";
import assert from "node:assert/strict";
import {
  accessForGeneratedCollection,
  adminRoleFieldAccess,
  adminsCollectionAccess,
  caseCollectionAccess,
  contentCollectionAccess,
  hasRole,
  isAdmin,
  referenceCollectionAccess,
  translationCollectionAccess,
  workspaceScopedAccess,
} from "../lib/payload-access.mjs";

const req = (user) => ({ req: { user } });
const admin = { id: "a1", role: "admin" };
const broker = { id: "b1", role: "broker", workspace_ids: ["ws-sandanski"] };
const brokerNoScope = { id: "b2", role: "broker" };
const editor = { id: "e1", role: "editor" };
const translator = { id: "t1", role: "translator" };

test("only admins manage operator accounts", () => {
  assert.equal(adminsCollectionAccess.create(req(admin)), true);
  assert.equal(adminsCollectionAccess.delete(req(admin)), true);
  for (const user of [broker, editor, translator, undefined]) {
    assert.equal(adminsCollectionAccess.create(req(user)), false);
    assert.equal(adminsCollectionAccess.delete(req(user)), false);
  }
});

test("non-admins may read and update only their own operator record", () => {
  assert.equal(adminsCollectionAccess.read(req(admin)), true);
  assert.deepEqual(adminsCollectionAccess.read(req(broker)), { id: { equals: "b1" } });
  assert.deepEqual(adminsCollectionAccess.update(req(editor)), { id: { equals: "e1" } });
  assert.equal(adminsCollectionAccess.read(req(undefined)), false);
});

test("the role field is not self-writable (no privilege escalation)", () => {
  assert.equal(adminRoleFieldAccess.create(req(admin)), true);
  assert.equal(adminRoleFieldAccess.update(req(admin)), true);
  for (const user of [broker, editor, translator]) {
    assert.equal(adminRoleFieldAccess.update(req(user)), false);
  }
});

test("content is role-gated for writes, readable to all operators", () => {
  assert.equal(contentCollectionAccess.read(req(translator)), true);
  assert.equal(contentCollectionAccess.read(req(undefined)), false);
  assert.equal(contentCollectionAccess.create(req(editor)), true);
  assert.equal(contentCollectionAccess.create(req(admin)), true);
  assert.equal(contentCollectionAccess.create(req(broker)), false);
  assert.equal(contentCollectionAccess.create(req(translator)), false);
  assert.equal(contentCollectionAccess.delete(req(editor)), false);
  assert.equal(contentCollectionAccess.delete(req(admin)), true);
});

test("translations additionally admit translators", () => {
  assert.equal(translationCollectionAccess.create(req(translator)), true);
  assert.equal(translationCollectionAccess.update(req(translator)), true);
  assert.equal(translationCollectionAccess.create(req(broker)), false);
  assert.equal(accessForGeneratedCollection("listing_translations"), translationCollectionAccess);
  assert.equal(accessForGeneratedCollection("listings"), contentCollectionAccess);
});

test("reference data (locales) is admin-write, all-read", () => {
  assert.equal(referenceCollectionAccess.update(req(admin)), true);
  assert.equal(referenceCollectionAccess.update(req(editor)), false);
  assert.equal(referenceCollectionAccess.read(req(translator)), true);
});

test("cases are workspace-scoped: admin sees all, broker sees only assigned, others none", () => {
  assert.equal(caseCollectionAccess.read(req(admin)), true);
  assert.deepEqual(caseCollectionAccess.read(req(broker)), { workspace_id: { in: ["ws-sandanski"] } });
  assert.equal(caseCollectionAccess.read(req(brokerNoScope)), false, "a broker with no workspace sees nothing");
  assert.equal(caseCollectionAccess.read(req(editor)), false);
  assert.equal(caseCollectionAccess.read(req(undefined)), false);

  assert.equal(caseCollectionAccess.create(req(broker)), true);
  assert.equal(caseCollectionAccess.create(req(editor)), false);
  assert.equal(caseCollectionAccess.delete(req(broker)), false);
  assert.equal(caseCollectionAccess.delete(req(admin)), true);
});

test("workspaceScopedAccess normalizes a single string workspace id", () => {
  const access = workspaceScopedAccess();
  assert.deepEqual(access(req({ role: "broker", workspace_ids: "ws-1" })), { workspace_id: { in: ["ws-1"] } });
  assert.deepEqual(access(req({ role: "broker", workspace_ids: ["ws-1", " ", "ws-2"] })), {
    workspace_id: { in: ["ws-1", "ws-2"] },
  });
});

test("helper predicates guard against missing users", () => {
  assert.equal(isAdmin(req(undefined)), false);
  assert.equal(hasRole("admin")(req(null)), false);
  assert.equal(hasRole("admin", "broker")(req(broker)), true);
});

test("config wires shared access onto admins, content, and case collections", async () => {
  const previous = { PAYLOAD_SECRET: process.env.PAYLOAD_SECRET, DATABASE_URL: process.env.DATABASE_URL };
  process.env.PAYLOAD_SECRET = "build-only-secret-not-used-at-runtime-0123456789";
  process.env.DATABASE_URL = "postgresql://build:build@127.0.0.1:5432/build_only";
  try {
    const mod = await import("../../payload.config.js");
    const config = await (typeof mod.default?.then === "function" ? mod.default : Promise.resolve(mod.default));
    const bySlug = Object.fromEntries(config.collections.map((c) => [c.slug, c]));

    // admins: create is admin-only
    assert.equal(bySlug.admins.access.create(req(broker)), false);
    assert.equal(bySlug.admins.access.create(req(admin)), true);
    // listings: editor writes, broker does not
    assert.equal(bySlug.listings.access.create(req(editor)), true);
    assert.equal(bySlug.listings.access.create(req(broker)), false);
    // realty_cases: broker read is workspace-scoped; append-only update preserved
    assert.deepEqual(bySlug.realty_cases.access.read(req(broker)), { workspace_id: { in: ["ws-sandanski"] } });
    assert.equal(bySlug.realty_case_events.access.update(req(admin)), false, "append-only update preserved");
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
