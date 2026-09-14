import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { canAdminAccess, canAdminMutate } from "./admin-auth.mjs";

export const SITE_PAGE_KEY = "seller";
export const SITE_PAGE_LOCALES = Object.freeze(["bg", "en", "de", "nl", "ru", "el", "he"]);
const PAGES = "site_pages";
const REVISIONS = "site_page_revisions";
const COPY_FIELDS = Object.freeze({ title: 180, description: 320, h1: 180, intro: 3000 });
const deny = () => false;
const privateCollection = { access: { create: deny, read: deny, update: deny, delete: deny }, admin: { hidden: true }, lockDocuments: false };

// The service owns writes, including review and publication. Generic Payload
// routes cannot bypass the sequence or expose a private draft.
export const SITE_PAGE_CONTENT_COLLECTIONS = [
  {
    slug: PAGES,
    ...privateCollection,
    fields: [
      { name: "page_key", type: "text", required: true, unique: true, maxLength: 80 },
      { name: "version", type: "number", required: true, min: 1 },
      { name: "drafts", type: "json", required: true },
      { name: "published", type: "json", required: true },
    ],
  },
  {
    slug: REVISIONS,
    ...privateCollection,
    fields: [
      { name: "revision_id", type: "text", required: true, unique: true, maxLength: 80 },
      { name: "page_key", type: "text", required: true, index: true, maxLength: 80 },
      { name: "locale", type: "text", required: true, maxLength: 2 },
      { name: "source_revision_id", type: "text", maxLength: 80 },
      { name: "status", type: "text", required: true, maxLength: 20 },
      { name: "content_hash", type: "text", required: true, maxLength: 64 },
      { name: "content", type: "json", required: true },
      { name: "created_by", type: "text", required: true, maxLength: 160 },
      { name: "submitted_by", type: "text", maxLength: 160 },
      { name: "submitted_at", type: "date" },
      { name: "approval", type: "json" },
      { name: "publication", type: "json" },
    ],
  },
];

export class SitePageContentError extends Error {
  constructor(message, status = 400, code = "invalid_site_page_content", cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "SitePageContentError";
    this.status = status;
    this.code = code;
  }
}

function failure(message, status = 400, code) {
  throw new SitePageContentError(message, status, code);
}

function localeOf(locale = "bg") {
  if (!SITE_PAGE_LOCALES.includes(locale)) failure("Select a supported public locale.");
  return locale;
}

function requiredText(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    failure(`${label} must be plain text of at most ${max} characters.`);
  }
  return value.trim();
}

export function normalizeSellerPageContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) failure("Seller page copy is required.");
  if (Object.keys(content).some((key) => !Object.hasOwn(COPY_FIELDS, key))) {
    failure("Only seller page title, description, h1 and intro may be edited.");
  }
  return Object.fromEntries(Object.entries(COPY_FIELDS).map(([key, max]) => [key, requiredText(content[key], key, max)]));
}

function digest(locale, sourceRevisionId, content) {
  return createHash("sha256").update(JSON.stringify([SITE_PAGE_KEY, locale, sourceRevisionId || null, content])).digest("hex");
}

function operator(principal, capability, mutation = false) {
  if (!principal?.id || principal.roles?.includes("agent") || !canAdminAccess(principal, capability) || (mutation && !canAdminMutate(principal))) {
    failure("This action requires an authorized human operator.", 403, "site_page_forbidden");
  }
  return requiredText(String(principal.id), "Operator identity", 160);
}

function expectedVersion(value, current) {
  if (!Number.isSafeInteger(value) || value < 0) failure("The current page version is required.");
  if (value !== current.version) {
    const error = new SitePageContentError("The page changed. Reload it before continuing.", 409, "site_page_version_conflict");
    error.current_version = current.version;
    throw error;
  }
}

function storeError(error) {
  if (error instanceof SitePageContentError) return error;
  let nested = error;
  for (let depth = 0; nested && depth < 6; depth++, nested = nested.cause) {
    if (["40001", "40P01", "23505"].includes(nested.code)) {
      return new SitePageContentError("The page changed. Reload it before continuing.", 409, "site_page_version_conflict", error);
    }
  }
  return new SitePageContentError("Page content storage is unavailable.", 503, "site_page_store_unavailable", error);
}

function currentSource(page, revision) {
  return revision.locale === "bg" || (revision.source_revision_id && revision.source_revision_id === page.published.bg);
}

function assertSource(page, revision) {
  if (!currentSource(page, revision)) failure("Review the translation against the current published Bulgarian revision.", 409, "site_page_source_changed");
}

function assertApproval(revision) {
  const approval = revision.approval;
  if (!approval?.operator_id || !approval.recorded_at || approval.content_hash !== revision.content_hash || approval.revision_id !== revision.revision_id ||
      approval.content_reviewed !== true || (revision.locale !== "bg" && approval.translation_reviewed !== true)) {
    failure("This exact copy requires human approval before publication.", 409, "site_page_approval_required");
  }
}

function revisionView(row) {
  if (!row) return null;
  const { id, updatedAt, ...view } = row;
  return structuredClone(view);
}

/**
 * A single agency's seller copy. `principal` must come from the existing admin
 * session resolver, never from the request body. Public adapters may call only
 * readPublished and must retain their existing route and indexing approval.
 */
export function createSitePageContentService({ payload = null, now = () => new Date().toISOString() } = {}) {
  let runtimePromise;
  async function runtime() {
    if (payload) return payload;
    if (!runtimePromise) {
      runtimePromise = (async () => {
        if (!process.env.DATABASE_URL || !process.env.PAYLOAD_SECRET) throw new Error("Payload page content storage is not configured");
        const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("../../payload.config.js")]);
        return getPayload({ config });
      })().catch((error) => { runtimePromise = null; throw error; });
    }
    return runtimePromise;
  }

  async function findOne(db, collection, where, req) {
    const result = await db.find({ collection, where, limit: 2, depth: 0, overrideAccess: true, ...(req ? { req } : {}) });
    if (!Array.isArray(result?.docs) || result.docs.length > 1) throw new Error("Invalid page content query result");
    return result.docs[0] || null;
  }

  async function pageState(db, req) {
    return (await findOne(db, PAGES, { page_key: { equals: SITE_PAGE_KEY } }, req)) ||
      { page_key: SITE_PAGE_KEY, version: 0, drafts: {}, published: {} };
  }

  async function revision(db, revisionId, locale, req) {
    const row = await findOne(db, REVISIONS, { and: [{ revision_id: { equals: revisionId } }, { page_key: { equals: SITE_PAGE_KEY } }, { locale: { equals: locale } }] }, req);
    let content;
    try { content = normalizeSellerPageContent(row?.content); } catch (error) { throw new Error("Stored page copy is invalid", { cause: error }); }
    if (!row || row.content_hash !== digest(locale, row.source_revision_id, content)) throw new Error("Page revision could not be verified");
    return row;
  }

  async function publishedRevision(db, page, locale, req) {
    if (!page.published[locale]) return null;
    const row = await revision(db, page.published[locale], locale, req);
    if (row.status !== "published" || !row.publication?.operator_id || !row.publication.recorded_at ||
        row.publication.revision_id !== row.revision_id || row.publication.content_hash !== row.content_hash) throw new Error("Page publication could not be verified");
    try { assertApproval(row); } catch (error) { throw new Error("Page publication approval could not be verified", { cause: error }); }
    return currentSource(page, row) ? row : null;
  }

  async function snapshot(db, page, locale, req) {
    const draft = page.drafts[locale] ? await revision(db, page.drafts[locale], locale, req) : null;
    const published = await publishedRevision(db, page, locale, req);
    return { page_key: SITE_PAGE_KEY, locale, version: page.version, draft: revisionView(draft), published: revisionView(published),
      published_source_revision_id: page.published.bg || null,
      publication_status: published ? "published" : page.published[locale] ? "source_changed" : "not_published" };
  }

  async function read(action) {
    try { return await action(await runtime()); } catch (error) { throw storeError(error); }
  }

  async function mutate(input, capability, action) {
    const locale = localeOf(input.locale);
    const actor = operator(input.principal, capability, true);
    return read(async (db) => {
      if (!["beginTransaction", "commitTransaction", "rollbackTransaction"].every((method) => typeof db.db?.[method] === "function")) {
        throw new Error("Page content writes require database transactions");
      }
      const transactionID = await db.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
      if (transactionID === null || transactionID === undefined) throw new Error("Page content transaction did not open");
      const req = { payload: db, transactionID };
      try {
        const page = await pageState(db, req);
        expectedVersion(input.expectedVersion, page);
        await action({ db, page, locale, actor, req, recordedAt: now() });
        const data = { page_key: SITE_PAGE_KEY, version: page.version + 1, drafts: page.drafts, published: page.published };
        const saved = page.id
          ? await db.update({ collection: PAGES, id: page.id, data, overrideAccess: true, depth: 0, req })
          : await db.create({ collection: PAGES, data, overrideAccess: true, depth: 0, req });
        const result = await snapshot(db, saved, locale, req);
        await db.db.commitTransaction(transactionID);
        // Payload adapters can return from commit without surfacing a failed
        // commit. Confirm outside the transaction before acknowledging a save.
        const persistedPage = await pageState(db);
        const persisted = await revision(db, result.draft.revision_id, locale);
        const statuses = ["draft", "in_review", "approved", "published"];
        if (persistedPage.version < result.version || statuses.indexOf(persisted.status) < statuses.indexOf(result.draft.status)) {
          throw new Error("Page content commit could not be read back");
        }
        for (const field of ["content_hash", "created_by", "submitted_by", "submitted_at", "approval", "publication"]) {
          if (result.draft[field] != null && !isDeepStrictEqual(persisted[field], result.draft[field])) throw new Error("Page content receipt could not be read back");
        }
        return { ...result, readback_verified: true };
      } catch (error) {
        try { await db.db.rollbackTransaction(transactionID); } catch { /* Preserve the original write/commit failure. */ }
        throw error;
      }
    });
  }

  async function selectedDraft(db, page, input, locale, req) {
    if (!input.revisionId || page.drafts[locale] !== input.revisionId) failure("The selected revision is no longer the current draft.", 409, "site_page_revision_conflict");
    const row = await revision(db, input.revisionId, locale, req);
    if (input.contentHash !== row.content_hash) failure("Confirm the exact copy shown in the preview.", 409, "site_page_revision_conflict");
    assertSource(page, row);
    return row;
  }

  return {
    async readDraft({ principal, locale = "bg" } = {}) {
      operator(principal, "content:read");
      localeOf(locale);
      return read(async (db) => snapshot(db, await pageState(db), locale));
    },

    async previewRevision(input = {}) {
      operator(input.principal, "content:read");
      const locale = localeOf(input.locale);
      return read(async (db) => {
        const page = await pageState(db);
        expectedVersion(input.expectedVersion, page);
        const row = await selectedDraft(db, page, input, locale);
        return { page_key: SITE_PAGE_KEY, locale, version: page.version, revision_id: row.revision_id, content_hash: row.content_hash,
          content: structuredClone(row.content), preview: true, robots: "noindex,nofollow", cache_control: "private,no-store" };
      });
    },

    async saveDraft(input = {}) {
      const locale = localeOf(input.locale);
      const content = normalizeSellerPageContent(input.content);
      return mutate(input, locale === "bg" ? "content:write" : "translations:write", async ({ db, page, actor, req }) => {
        const sourceRevisionId = locale === "bg" ? null : input.sourceRevisionId;
        if (locale === "bg" && input.sourceRevisionId) failure("Bulgarian is the source locale.");
        if (locale !== "bg" && (!sourceRevisionId || sourceRevisionId !== page.published.bg)) failure("Select the current published Bulgarian source revision.", 409, "site_page_source_changed");
        const row = await db.create({ collection: REVISIONS, overrideAccess: true, depth: 0, req, data: {
          revision_id: randomUUID(), page_key: SITE_PAGE_KEY, locale, source_revision_id: sourceRevisionId,
          status: "draft", content_hash: digest(locale, sourceRevisionId, content), content, created_by: actor,
        } });
        page.drafts = { ...page.drafts, [locale]: row.revision_id };
      });
    },

    async submitForReview(input = {}) {
      return mutate(input, localeOf(input.locale) === "bg" ? "content:write" : "translations:write", async ({ db, page, locale, actor, req, recordedAt }) => {
        const row = await selectedDraft(db, page, input, locale, req);
        if (row.status !== "draft") failure("Only a draft can be submitted for review.", 409, "site_page_invalid_transition");
        await db.update({ collection: REVISIONS, id: row.id, overrideAccess: true, depth: 0, req,
          data: { status: "in_review", submitted_by: actor, submitted_at: recordedAt } });
      });
    },

    async approveRevision(input = {}) {
      return mutate(input, localeOf(input.locale) === "bg" ? "content:write" : "translations:publish", async ({ db, page, locale, actor, req, recordedAt }) => {
        const row = await selectedDraft(db, page, input, locale, req);
        if (row.status !== "in_review") failure("Submit the current draft for review first.", 409, "site_page_invalid_transition");
        if (input.contentReviewed !== true || (locale !== "bg" && input.translationReviewed !== true)) failure("Confirm human content and translation review.");
        if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length < 1 || input.evidenceRefs.length > 10) failure("Record the sources checked during review.");
        const approval = { revision_id: row.revision_id, content_hash: row.content_hash, operator_id: actor, recorded_at: recordedAt,
          content_reviewed: true, translation_reviewed: locale !== "bg", evidence_refs: input.evidenceRefs.map((ref) => requiredText(ref, "Review source", 500)) };
        await db.update({ collection: REVISIONS, id: row.id, data: { status: "approved", approval }, overrideAccess: true, depth: 0, req });
      });
    },

    async publishRevision(input = {}) {
      // Existing content publication is owner-controlled. A translation editor
      // may approve a translation; the agency admin makes it live.
      return mutate(input, "administration:write", async ({ db, page, locale, actor, req, recordedAt }) => {
        const row = await selectedDraft(db, page, input, locale, req);
        if (input.confirm !== true) failure("Confirm publication of this exact revision.");
        if (row.status !== "approved") failure("Approve this revision before publishing.", 409, "site_page_approval_required");
        assertApproval(row);
        const publication = { revision_id: row.revision_id, content_hash: row.content_hash, operator_id: actor, recorded_at: recordedAt };
        await db.update({ collection: REVISIONS, id: row.id, data: { status: "published", publication }, overrideAccess: true, depth: 0, req });
        page.published = { ...page.published, [locale]: row.revision_id };
      });
    },

    async readPublished({ locale = "bg" } = {}) {
      localeOf(locale);
      return read(async (db) => {
        const row = await publishedRevision(db, await pageState(db), locale);
        if (!row) return null;
        return { page_key: SITE_PAGE_KEY, locale, revision_id: row.revision_id, source_revision_id: row.source_revision_id || null,
          content_hash: row.content_hash, content: structuredClone(row.content), approved_at: row.approval.recorded_at,
          published_at: row.publication.recorded_at };
      });
    },
  };
}
