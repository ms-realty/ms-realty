import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createSitePageContentService, SITE_PAGE_CONTENT_COLLECTIONS } from "../lib/site-page-content.mjs";

const enabled = process.env.MS_REALTY_RUN_SITE_PAGE_POSTGRES === "1";
const editor = { id: "cms-test-editor", roles: ["editor"], can_mutate: true };
const owner = { id: "cms-test-owner", roles: ["admin"], can_mutate: true };
const copy = { title: "Продайте имота си", description: "Свържете се с MS Realty.", h1: "Продайте имота си", intro: "Разкажете ни за имота си." };

async function loopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function selected(state, principal = editor) {
  return { principal, locale: state.locale, expectedVersion: state.version, revisionId: state.draft.revision_id, contentHash: state.draft.content_hash };
}

// Starts only a disposable cluster owned by this test. It never reads a runtime
// DATABASE_URL, uses an existing server, installs binaries or changes services.
test("seller content persists through Payload/Postgres restart and rejects concurrent saves", {
  skip: enabled ? false : "set MS_REALTY_RUN_SITE_PAGE_POSTGRES=1 and MS_REALTY_SITE_PAGE_TEST_PG_BIN to run the disposable Postgres test",
  timeout: 60_000,
}, async () => {
  const bin = process.env.MS_REALTY_SITE_PAGE_TEST_PG_BIN;
  assert.ok(bin && path.isAbsolute(bin), "Set the installed PostgreSQL bin directory explicitly");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-site-page-test-"));
  const data = path.join(directory, "data");
  const log = path.join(directory, "postgres.log");
  const port = await loopbackPort();
  const command = (name, args) => {
    const result = spawnSync(path.join(bin, name), args, { encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, `${name} failed: ${result.error?.message || ""}\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  };
  const start = () => command("pg_ctl", ["-D", data, "-l", log, "-w", "-t", "15", "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c shared_buffers=16MB -c max_connections=12`, "start"]);
  const stop = () => command("pg_ctl", ["-D", data, "-w", "-t", "15", "-m", "fast", "stop"]);
  let payload;
  const closePayload = async () => {
    // The installed adapter retains a startup client and destroy does not end
    // its pool. Release this test's clients only after all test calls settle.
    const closing = payload;
    payload = null;
    for (const client of closing.db.pool.checkedOut) client.release();
    await closing.db.pool.end();
    await closing.destroy();
  };
  try {
    command("initdb", ["-D", data, "-U", "cms_test", "-A", "trust", "--no-locale", "-E", "UTF8"]);
    start();
    const [{ BasePayload, buildConfig }, { postgresAdapter }, migration, { default: pg }] = await Promise.all([
      import("payload"), import("@payloadcms/db-postgres"), import("../../migrations/20260914_120000_site_page_content.ts"), import("pg"),
    ]);
    class TestPool extends pg.Pool {
      checkedOut = new Set();
      constructor(options) {
        super(options);
        this.on("acquire", (client) => this.checkedOut.add(client));
        this.on("release", (_error, client) => this.checkedOut.delete(client));
      }
    }
    const openPayload = async () => new BasePayload().init({
      config: buildConfig({
        admin: { disable: true },
        collections: [...SITE_PAGE_CONTENT_COLLECTIONS],
        db: postgresAdapter({ pg: { ...pg, Pool: TestPool }, pool: { connectionString: `postgres://cms_test@127.0.0.1:${port}/postgres`, max: 4 }, push: false }),
        secret: randomBytes(32).toString("hex"),
        telemetry: false,
        typescript: { autoGenerate: false },
        logger: { options: { level: "silent" } },
      }),
      disableOnInit: true,
    });
    payload = await openPayload();
    // Execute the exact migration rather than relying on development schema push.
    await migration.up({ db: payload.db.drizzle, payload });
    await migration.up({ db: payload.db.drizzle, payload });
    const cms = createSitePageContentService({ payload });
    const draft = await cms.saveDraft({ principal: editor, content: copy, expectedVersion: 0 });
    assert.equal(await cms.readPublished(), null);
    const review = await cms.submitForReview(selected(draft));
    const approved = await cms.approveRevision({ ...selected(review), contentReviewed: true, evidenceRefs: ["Agency copy reviewed"] });
    const live = await cms.publishRevision({ ...selected(approved, owner), confirm: true });
    assert.equal(live.readback_verified, true);
    assert.deepEqual((await cms.readPublished()).content, copy);
    await assert.rejects(payload.create({ collection: "site_page_revisions", data: draft.draft, overrideAccess: false }), { status: 403 });

    // Both real transactions read the same page version before either writes.
    const find = payload.find;
    const arrivals = new Set();
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    payload.find = async (args) => {
      const result = await find(args);
      if (args.collection === "site_pages" && args.req?.transactionID && !arrivals.has(args.req.transactionID)) {
        arrivals.add(args.req.transactionID);
        if (arrivals.size === 2) release();
        await barrier;
      }
      return result;
    };
    let outcomes;
    try {
      outcomes = await Promise.allSettled(["Първо заглавие", "Второ заглавие"].map((h1) => cms.saveDraft({
        principal: editor, expectedVersion: live.version, content: { ...copy, h1 },
      })));
    } finally { payload.find = find; }
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(outcomes));
    const rejected = outcomes.find((result) => result.status === "rejected");
    assert.equal(rejected.reason.status, 409);
    const latest = outcomes.find((result) => result.status === "fulfilled").value;
    const revisions = await payload.find({ collection: "site_page_revisions", overrideAccess: true, pagination: false, depth: 0 });
    assert.equal(revisions.docs.length, 2, "the losing transaction must not leave an orphan revision");
    assert.equal((await cms.readPublished()).revision_id, live.published.revision_id);

    await migration.down({ db: payload.db.drizzle, payload });
    await closePayload();
    stop();
    start();
    payload = await openPayload();
    const restarted = createSitePageContentService({ payload });
    const readback = await restarted.readDraft({ principal: editor });
    assert.equal(readback.version, latest.version);
    assert.equal(readback.draft.revision_id, latest.draft.revision_id);
    assert.equal(readback.published.revision_id, live.published.revision_id);
    assert.deepEqual((await restarted.readPublished()).content, copy);
    await assert.rejects(restarted.publishRevision({ ...selected(live, owner), confirm: true }), { status: 409 });
    assert.equal(await restarted.readPublished({ locale: "he" }), null);
    if (process.env.MS_REALTY_SITE_PAGE_PLAYWRIGHT_MODULE) {
      const browserModule = process.env.MS_REALTY_SITE_PAGE_PLAYWRIGHT_MODULE;
      assert.ok(path.isAbsolute(browserModule), "Select an installed Playwright module explicitly; no browser is downloaded by this test");
      const [{ chromium }, { exerciseSellerPageBrowser }] = await Promise.all([
        import(pathToFileURL(browserModule).href), import("./helpers/site-page-browser-journey.mjs"),
      ]);
      const publication = await exerciseSellerPageBrowser({ payload, chromium });
      await closePayload();
      stop();
      start();
      payload = await openPayload();
      assert.deepEqual(await createSitePageContentService({ payload }).readPublished(), publication, "the browser-published revision survives restart");
    }
  } finally {
    if (payload) await closePayload();
    if (fs.existsSync(path.join(data, "postmaster.pid"))) stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
