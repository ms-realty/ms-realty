import assert from "node:assert/strict";
import test from "node:test";
import { createSitePageContentService, normalizeSellerPageContent, SITE_PAGE_CONTENT_COLLECTIONS } from "../lib/site-page-content.mjs";

const editor = { id: "editor-one", roles: ["editor"], can_mutate: true };
const owner = { id: "owner-one", roles: ["admin"], can_mutate: true };
const broker = { id: "broker-one", roles: ["broker"], can_mutate: true };
const translator = { id: "translator-one", roles: ["translator"], can_mutate: true };
const copy = { title: "Продайте имота си с MS Realty", description: "Свържете се с нашия брокер.", h1: "Продайте имота си", intro: "Разкажете ни за имота си в Сандански." };

function matches(row, where) {
  return where.and ? where.and.every((clause) => matches(row, clause)) : Object.entries(where).every(([key, condition]) => row[key] === condition.equals);
}

// Models the Local API subset and transaction boundaries, not Postgres itself.
// The opt-in integration test separately checks the real adapter and database.
class PagePayload {
  rows = { site_pages: [], site_page_revisions: [] };
  generation = 0;
  nextId = 1;
  transactions = new Map();
  calls = [];
  failOperation = null;
  commitOutcomeUnknown = false;
  commitWithoutApply = false;
  db = {
    beginTransaction: async (options) => {
      assert.equal(options.isolationLevel, "serializable");
      const id = this.nextId++;
      this.transactions.set(id, { rows: structuredClone(this.rows), generation: this.generation });
      return id;
    },
    commitTransaction: async (id) => {
      const transaction = this.transactions.get(id);
      if (transaction.generation !== this.generation) throw Object.assign(new Error("concurrent write"), { code: "40001" });
      if (this.commitWithoutApply) { this.transactions.delete(id); return; }
      this.rows = transaction.rows;
      this.generation++;
      this.transactions.delete(id);
      if (this.commitOutcomeUnknown) throw new Error("commit response lost");
    },
    rollbackTransaction: async (id) => { this.transactions.delete(id); },
  };

  records(req) { return req ? this.transactions.get(req.transactionID).rows : this.rows; }
  record(operation, args) {
    this.calls.push({ operation, ...structuredClone({ collection: args.collection, data: args.data, transactionID: args.req?.transactionID }) });
    assert.equal(args.overrideAccess, true);
    if (operation !== "find") assert.ok(args.req?.transactionID, "every write belongs to the same transaction");
    if (this.failOperation === `${operation}:${args.collection}`) throw new Error("storage connection lost");
  }
  async find(args) {
    this.record("find", args);
    return { docs: structuredClone(this.records(args.req)[args.collection].filter((row) => matches(row, args.where))) };
  }
  async create(args) {
    this.record("create", args);
    const row = { id: this.nextId++, ...structuredClone(args.data), createdAt: "2026-09-14T10:00:00.000Z" };
    this.records(args.req)[args.collection].push(row);
    return structuredClone(row);
  }
  async update(args) {
    this.record("update", args);
    const rows = this.records(args.req)[args.collection];
    const index = rows.findIndex((row) => row.id === args.id);
    assert.notEqual(index, -1);
    rows[index] = { ...rows[index], ...structuredClone(args.data) };
    return structuredClone(rows[index]);
  }
}

function service(payload = new PagePayload()) {
  return { payload, cms: createSitePageContentService({ payload, now: () => "2026-09-14T11:00:00.000Z" }) };
}

function selected(state, principal = editor) {
  return { principal, locale: state.locale, expectedVersion: state.version, revisionId: state.draft.revision_id, contentHash: state.draft.content_hash };
}

async function approve(cms, draft) {
  const review = await cms.submitForReview(selected(draft, draft.locale === "bg" ? editor : translator));
  return cms.approveRevision({ ...selected(review), contentReviewed: true, translationReviewed: review.locale !== "bg", evidenceRefs: ["Agency seller copy reviewed by owner"] });
}

async function publish(cms, state) {
  const approved = await approve(cms, state);
  return cms.publishRevision({ ...selected(approved, owner), confirm: true });
}

async function publishedBg(cms) {
  return publish(cms, await cms.saveDraft({ principal: editor, locale: "bg", content: copy, expectedVersion: 0 }));
}

test("content collections reject all direct Payload reads and writes, including admin access", async () => {
  assert.deepEqual(SITE_PAGE_CONTENT_COLLECTIONS.map((collection) => collection.slug), ["site_pages", "site_page_revisions"]);
  for (const collection of SITE_PAGE_CONTENT_COLLECTIONS) {
    for (const user of [owner, editor, broker, translator, null]) {
      for (const action of ["read", "create", "update", "delete"]) assert.equal(collection.access[action]({ req: { user } }), false);
    }
  }
});

test("save and private preview cannot publish copy or change route/indexing identity", async () => {
  const { cms, payload } = service();
  assert.equal(await cms.readPublished(), null);
  assert.equal((await cms.readDraft({ principal: broker })).version, 0);
  const draft = await cms.saveDraft({ principal: editor, expectedVersion: 0, content: copy, actor: "spoofed-owner" });
  assert.equal(draft.draft.status, "draft");
  assert.equal(draft.draft.created_by, editor.id);
  assert.equal(draft.version, 1);
  assert.equal(await cms.readPublished(), null);
  const preview = await cms.previewRevision(selected(draft, broker));
  assert.deepEqual(preview.content, copy);
  assert.equal(preview.preview, true);
  assert.equal(preview.robots, "noindex,nofollow");
  assert.equal(preview.cache_control, "private,no-store");
  assert.equal(preview.indexable, undefined);
  preview.content.h1 = "Changed client-side";
  assert.equal((await cms.readDraft({ principal: editor })).draft.content.h1, copy.h1);
  assert.equal(payload.rows.site_page_revisions.length, 1);
  for (const field of ["canonical", "slug", "path", "indexable", "robots", "form_action"]) {
    assert.throws(() => normalizeSellerPageContent({ ...copy, [field]: "changed" }), { status: 400 });
  }
});

test("editor review and owner publication persist exact approval and support fresh-service readback", async () => {
  const { cms, payload } = service();
  const live = await publishedBg(cms);
  assert.equal(live.version, 4);
  assert.equal(live.readback_verified, true);
  assert.equal(live.draft.approval.operator_id, editor.id);
  assert.equal(live.draft.publication.operator_id, owner.id);
  assert.equal(live.draft.publication.content_hash, live.draft.approval.content_hash);
  assert.equal(live.published.revision_id, live.draft.revision_id);
  const restarted = createSitePageContentService({ payload });
  const readback = await restarted.readPublished({ locale: "bg" });
  assert.deepEqual(readback.content, copy);
  assert.equal(readback.revision_id, live.published.revision_id);
  assert.equal(readback.published_at, "2026-09-14T11:00:00.000Z");
  assert.equal(readback.created_by, undefined, "public readback does not disclose operator identities or private review references");
  assert.equal(readback.indexable, undefined, "publication does not grant indexing permission");
});

test("new drafts preserve live copy and earlier content revisions; stale selections cannot publish", async () => {
  const { cms, payload } = service();
  const original = await publishedBg(cms);
  const next = await cms.saveDraft({ principal: editor, content: { ...copy, h1: "Ново заглавие" }, expectedVersion: original.version });
  assert.equal((await cms.readPublished()).content.h1, copy.h1);
  assert.notEqual(next.draft.revision_id, original.draft.revision_id);
  assert.equal(next.draft.approval, undefined);
  assert.equal(payload.rows.site_page_revisions.length, 2);
  assert.deepEqual(payload.rows.site_page_revisions[0].content, copy);
  await assert.rejects(cms.publishRevision({ ...selected(original, owner), confirm: true }), { status: 409, code: "site_page_version_conflict" });
  await assert.rejects(cms.publishRevision({ ...selected(original, owner), expectedVersion: next.version, confirm: true }), { status: 409, code: "site_page_revision_conflict" });
  await assert.rejects(cms.previewRevision({ ...selected(next), contentHash: "wrong" }), { status: 409, code: "site_page_revision_conflict" });
  await assert.rejects(cms.publishRevision({ ...selected(next, owner), confirm: true }), { status: 409, code: "site_page_approval_required" });
});

test("human review, evidence and explicit publication cannot be skipped", async () => {
  const { cms } = service();
  const draft = await cms.saveDraft({ principal: editor, content: copy, expectedVersion: 0 });
  await assert.rejects(cms.approveRevision({ ...selected(draft), contentReviewed: true, evidenceRefs: ["source"] }), { status: 409 });
  const review = await cms.submitForReview(selected(draft));
  for (const missing of [{ contentReviewed: false, evidenceRefs: ["source"] }, { contentReviewed: true, evidenceRefs: [] }]) {
    await assert.rejects(cms.approveRevision({ ...selected(review), ...missing }), { status: 400 });
  }
  const approved = await cms.approveRevision({ ...selected(review), contentReviewed: true, evidenceRefs: ["Owner checked copy"] });
  for (const confirm of [undefined, false, "true"]) await assert.rejects(cms.publishRevision({ ...selected(approved, owner), confirm }), { status: 400 });
  assert.equal(await cms.readPublished(), null);
  assert.equal((await cms.publishRevision({ ...selected(approved, owner), confirm: true })).published.revision_id, approved.draft.revision_id);
});

test("existing role and attributable-operator limits apply without a new workspace contract", async () => {
  const { cms } = service();
  for (const principal of [null, { ...editor, id: "" }, { ...editor, can_mutate: false }, broker, translator, { ...owner, roles: ["admin", "agent"] }]) {
    await assert.rejects(cms.saveDraft({ principal, content: copy, expectedVersion: 0 }), { status: 403, code: "site_page_forbidden" });
  }
  const draft = await cms.saveDraft({ principal: editor, content: copy, expectedVersion: 0 });
  const approved = await approve(cms, draft);
  for (const principal of [editor, broker, translator, { ...owner, roles: ["admin", "agent"] }]) {
    await assert.rejects(cms.publishRevision({ ...selected(approved, principal), confirm: true }), { status: 403 });
  }
  await assert.rejects(cms.readDraft({ principal: { id: "hermes", roles: ["agent"], can_mutate: true } }), { status: 403 });
  await cms.publishRevision({ ...selected(approved, owner), confirm: true });
});

test("translations require current published Bulgarian source and separate human translation review", async () => {
  const { cms } = service();
  await assert.rejects(cms.saveDraft({ principal: translator, locale: "en", expectedVersion: 0, content: copy }), { status: 409, code: "site_page_source_changed" });
  const bg = await publishedBg(cms);
  const draft = await cms.saveDraft({ principal: translator, locale: "en", expectedVersion: bg.version,
    sourceRevisionId: bg.published.revision_id, content: { ...copy, h1: "Sell your property" } });
  const review = await cms.submitForReview(selected(draft, translator));
  await assert.rejects(cms.approveRevision({ ...selected(review, translator), contentReviewed: true, translationReviewed: true, evidenceRefs: ["source"] }), { status: 403 });
  await assert.rejects(cms.approveRevision({ ...selected(review), contentReviewed: true, evidenceRefs: ["source"] }), { status: 400 });
  const approved = await cms.approveRevision({ ...selected(review), contentReviewed: true, translationReviewed: true, evidenceRefs: ["Bulgarian source and English copy compared"] });
  const published = await cms.publishRevision({ ...selected(approved, owner), confirm: true });
  assert.equal((await cms.readPublished({ locale: "en" })).source_revision_id, bg.published.revision_id);
  assert.equal(published.published.approval.translation_reviewed, true);
  assert.equal(await cms.readPublished({ locale: "de" }), null, "no translation fallback is invented");
  const nextBg = await cms.saveDraft({ principal: editor, expectedVersion: published.version, content: { ...copy, intro: "Обновен български текст." } });
  assert.ok(await cms.readPublished({ locale: "en" }), "a Bulgarian draft alone does not invalidate published translations");
  await publish(cms, nextBg);
  assert.equal(await cms.readPublished({ locale: "en" }), null);
  const stale = await cms.readDraft({ principal: editor, locale: "en" });
  assert.equal(stale.publication_status, "source_changed");
  await assert.rejects(cms.publishRevision({ ...selected(stale, owner), confirm: true }), { status: 409, code: "site_page_source_changed" });
  await assert.rejects(cms.saveDraft({ principal: translator, locale: "en", expectedVersion: stale.version, content: copy, sourceRevisionId: bg.published.revision_id }), { status: 409, code: "site_page_source_changed" });
});

test("all seven public locales are supported and unsupported locales fail closed", async () => {
  const { cms } = service();
  const bg = await publishedBg(cms);
  for (const locale of ["en", "de", "nl", "ru", "el", "he"]) {
    const state = await cms.readDraft({ principal: editor, locale });
    const draft = await cms.saveDraft({ principal: translator, locale, expectedVersion: state.version, content: copy, sourceRevisionId: bg.published.revision_id });
    assert.equal(draft.draft.locale, locale);
    assert.equal(await cms.readPublished({ locale }), null);
  }
  await assert.rejects(cms.readPublished({ locale: "fr" }), { status: 400 });
});

test("concurrent draft saves produce one winner and no orphan revision", async () => {
  const { cms, payload } = service();
  const outcomes = await Promise.allSettled(["First", "Second"].map((h1) => cms.saveDraft({ principal: editor, expectedVersion: 0, content: { ...copy, h1 } })));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.find((result) => result.status === "rejected").reason.code, "site_page_version_conflict");
  assert.equal(payload.rows.site_pages.length, 1);
  assert.equal(payload.rows.site_page_revisions.length, 1);
  assert.equal(payload.transactions.size, 0);
});

test("a failed state write rolls back revision and publication together", async () => {
  const { cms, payload } = service();
  payload.failOperation = "create:site_pages";
  await assert.rejects(cms.saveDraft({ principal: editor, expectedVersion: 0, content: copy }), { status: 503 });
  assert.equal(payload.rows.site_page_revisions.length, 0);
  payload.failOperation = null;
  const approved = await approve(cms, await cms.saveDraft({ principal: editor, expectedVersion: 0, content: copy }));
  payload.failOperation = "update:site_pages";
  await assert.rejects(cms.publishRevision({ ...selected(approved, owner), confirm: true }), { status: 503 });
  assert.equal(await cms.readPublished(), null);
  assert.equal((await cms.readDraft({ principal: editor })).draft.status, "approved");
  assert.equal(payload.transactions.size, 0);
});

test("lost commit responses require readback and do not cause an automatic replay", async () => {
  const { cms, payload } = service();
  const approved = await approve(cms, await cms.saveDraft({ principal: editor, expectedVersion: 0, content: copy }));
  payload.commitOutcomeUnknown = true;
  await assert.rejects(cms.publishRevision({ ...selected(approved, owner), confirm: true }), { status: 503 });
  payload.commitOutcomeUnknown = false;
  const readback = await createSitePageContentService({ payload }).readPublished();
  assert.equal(readback.revision_id, approved.draft.revision_id);
  assert.equal(payload.rows.site_page_revisions.length, 1);
  await assert.rejects(cms.publishRevision({ ...selected(approved, owner), confirm: true }), { status: 409 });
});

test("a swallowed commit failure cannot acknowledge a publication that was not persisted", async () => {
  const { cms, payload } = service();
  const approved = await approve(cms, await cms.saveDraft({ principal: editor, expectedVersion: 0, content: copy }));
  payload.commitWithoutApply = true;
  await assert.rejects(cms.publishRevision({ ...selected(approved, owner), confirm: true }), { status: 503, code: "site_page_store_unavailable" });
  assert.equal(await cms.readPublished(), null);
  assert.equal((await cms.readDraft({ principal: editor })).draft.status, "approved");
});

test("storage outages, missing transactions and corrupt persisted copy never produce a fallback publication", async () => {
  const { cms, payload } = service();
  const live = await publishedBg(cms);
  payload.rows.site_page_revisions[0].content.h1 = "Unapproved database edit";
  await assert.rejects(cms.readPublished(), { status: 503, code: "site_page_store_unavailable" });
  payload.rows.site_page_revisions[0].content = structuredClone(copy);
  payload.failOperation = "find:site_pages";
  await assert.rejects(cms.readPublished(), { status: 503 });
  payload.failOperation = null;
  payload.db = {};
  await assert.rejects(cms.saveDraft({ principal: editor, expectedVersion: live.version, content: copy }), { status: 503 });
  assert.equal(payload.rows.site_page_revisions.length, 1);
});

test("invalid copy and missing versions do not create a draft", async () => {
  const { cms, payload } = service();
  for (const content of [{ ...copy, h1: "<script>alert(1)</script>" }, { ...copy, intro: "" }, { ...copy, title: "x".repeat(181) }]) {
    await assert.rejects(cms.saveDraft({ principal: editor, expectedVersion: 0, content }), { status: 400 });
  }
  for (const expectedVersion of [undefined, "0", -1, 0.5]) await assert.rejects(cms.saveDraft({ principal: editor, expectedVersion, content: copy }), { status: 400 });
  assert.equal(payload.rows.site_pages.length, 0);
  assert.equal(payload.rows.site_page_revisions.length, 0);
});
