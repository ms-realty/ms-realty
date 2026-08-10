import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  accessForGeneratedCollection,
  adminRoleFieldAccess,
  adminsCollectionAccess,
  caseWorkspaceBoundaryHook,
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

function payloadRequest(user, related = {}) {
  const calls = [];
  const request = {
    user,
    payload: {
      async find(input) {
        calls.push(input);
        const clauses = input.where.and;
        const id = clauses.find((clause) => clause.id)?.id.equals;
        const workspaceId = clauses.find((clause) => clause.workspace_id)?.workspace_id.equals;
        const doc = related[`${input.collection}:${id}`];
        return { docs: doc?.workspace_id === workspaceId ? [doc] : [] };
      },
    },
  };
  return { calls, request };
}

const caseBoundary = caseWorkspaceBoundaryHook({
  fields: [
    { name: "workspace_id", type: "text" },
    { name: "case", type: "relationship", relationTo: "realty_cases" },
    { name: "source_event", type: "relationship", relationTo: "realty_case_events" },
    { name: "external", type: "relationship", relationTo: "listings" },
  ],
});

function assertForbidden(run) {
  return assert.rejects(run, (error) => error?.name === "APIError" && error?.status === 403);
}

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

test("brokers may create cases only inside an assigned workspace", async () => {
  const allowed = { workspace_id: "ws-sandanski" };
  assert.equal(await caseBoundary({ data: allowed, operation: "create", req: payloadRequest(broker).request }), allowed);
  await assertForbidden(() =>
    caseBoundary({ data: { workspace_id: "ws-other" }, operation: "create", req: payloadRequest(broker).request }),
  );
  await assertForbidden(() =>
    caseBoundary({ data: allowed, operation: "create", req: payloadRequest(brokerNoScope).request }),
  );
});

test("brokers cannot move a case across workspace boundaries", async () => {
  const unchanged = { status: "active" };
  assert.equal(
    await caseBoundary({
      data: unchanged,
      operation: "update",
      originalDoc: { workspace_id: "ws-sandanski" },
      req: payloadRequest(broker).request,
    }),
    unchanged,
  );
  await assertForbidden(() =>
    caseBoundary({
      data: { workspace_id: "ws-other" },
      operation: "update",
      originalDoc: { workspace_id: "ws-sandanski" },
      req: payloadRequest(broker).request,
    }),
  );
  await assertForbidden(() =>
    caseBoundary({
      data: unchanged,
      operation: "update",
      originalDoc: { workspace_id: "ws-other" },
      req: payloadRequest(broker).request,
    }),
  );
});

test("case relationships must resolve inside the document workspace", async () => {
  const sameWorkspace = payloadRequest(broker, {
    "realty_cases:case-1": { id: "case-1", workspace_id: "ws-sandanski" },
    "realty_case_events:event-1": { id: "event-1", workspace_id: "ws-sandanski" },
  });
  const data = { workspace_id: "ws-sandanski", case: { id: "case-1" }, source_event: "event-1", external: "listing-1" };
  assert.equal(await caseBoundary({ data, operation: "create", req: sameWorkspace.request }), data);
  assert.deepEqual(
    sameWorkspace.calls.map(({ collection, depth, overrideAccess }) => ({ collection, depth, overrideAccess })),
    [
      { collection: "realty_cases", depth: 0, overrideAccess: true },
      { collection: "realty_case_events", depth: 0, overrideAccess: true },
    ],
    "only Realty Case relationships are checked through an unfiltered internal lookup",
  );

  const foreign = payloadRequest(broker, {
    "realty_cases:case-2": { id: "case-2", workspace_id: "ws-other" },
  });
  await assertForbidden(() =>
    caseBoundary({
      data: { workspace_id: "ws-sandanski", case: "case-2" },
      operation: "create",
      req: foreign.request,
    }),
  );
  await assertForbidden(() =>
    caseBoundary({
      data: { status: "active" },
      operation: "update",
      originalDoc: { workspace_id: "ws-sandanski", case: "case-2" },
      req: foreign.request,
    }),
  );
});

test("admin and internal projector writes preserve their existing authority path", async () => {
  const foreign = { workspace_id: "ws-other", case: "case-foreign" };
  assert.equal(await caseBoundary({ data: foreign, operation: "create", req: payloadRequest(admin).request }), foreign);
  assert.equal(await caseBoundary({ data: foreign, operation: "create", req: payloadRequest(undefined).request }), foreign);
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
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    MS_REALTY_PUBLIC_ORIGIN: process.env.MS_REALTY_PUBLIC_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
  };
  process.env.NODE_ENV = "production";
  process.env.PAYLOAD_SECRET = "build-only-secret-not-used-at-runtime-0123456789";
  process.env.DATABASE_URL = "postgresql://build:build@127.0.0.1:5432/build_only";
  process.env.MS_REALTY_PUBLIC_ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";
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
    assert.equal(bySlug.realty_cases.hooks.beforeValidate.length, 1, "workspace boundary hook is wired");
    assert.equal(bySlug.realty_case_events.access.update(req(admin)), false, "append-only update preserved");
    assert.deepEqual(bySlug.admins.auth.cookies, { sameSite: "Lax", secure: true });
    assert.equal(bySlug.admins.auth.maxLoginAttempts, 5);
    assert.equal(bySlug.admins.auth.tokenExpiration, 2 * 60 * 60);
    assert.equal(bySlug.admins.auth.useSessions, true);
    assert.equal(config.graphQL.disable, true);
    assert.equal(config.graphQL.disablePlaygroundInProduction, true);
    assert.equal(config.serverURL, "https://ms-realty.ms-realty-bg.workers.dev");
    assert.deepEqual(config.csrf, ["https://ms-realty.ms-realty-bg.workers.dev"]);
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("production config import fails closed on missing or placeholder runtime credentials", () => {
  const configUrl = new URL("../../payload.config.js", import.meta.url).href;
  const run = (overrides = {}) => {
    const env = { ...process.env, NODE_ENV: "production", ...overrides };
    for (const key of ["PAYLOAD_SECRET", "DATABASE_URL"]) {
      if (env[key] === undefined) delete env[key];
    }
    return spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(configUrl)})`], {
      cwd: new URL("../..", import.meta.url),
      encoding: "utf8",
      env,
    });
  };

  const missingSecret = run({ DATABASE_URL: "postgresql://payload:payload@127.0.0.1:5432/payload", PAYLOAD_SECRET: undefined });
  assert.notEqual(missingSecret.status, 0);
  assert.match(missingSecret.stderr, /PAYLOAD_SECRET/);

  const placeholderSecret = run({
    DATABASE_URL: "postgresql://payload:payload@127.0.0.1:5432/payload",
    PAYLOAD_SECRET: "replace-with-a-real-payload-secret",
  });
  assert.notEqual(placeholderSecret.status, 0);
  assert.match(placeholderSecret.stderr, /PAYLOAD_SECRET/);

  const missingDatabase = run({
    DATABASE_URL: undefined,
    PAYLOAD_SECRET: "production-payload-secret-with-at-least-32-bytes",
  });
  assert.notEqual(missingDatabase.status, 0);
  assert.match(missingDatabase.stderr, /DATABASE_URL/);

  const configured = run({
    DATABASE_URL: "postgresql://payload:payload@127.0.0.1:5432/payload",
    MS_REALTY_PUBLIC_ORIGIN: "https://ms-realty.ms-realty-bg.workers.dev",
    PAYLOAD_SECRET: "production-payload-secret-with-at-least-32-bytes",
  });
  assert.equal(configured.status, 0, configured.stderr);
});
