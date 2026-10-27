import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  contentLocaleEditions,
  contentLocaleVersions,
  contentPages,
  grants,
  passkeys,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Capability } from "@/domain/capabilities";
import type { ContentBlock } from "@/domain/content-body";
import type { PublicLocale } from "@/i18n/config";
import { createSession } from "../auth/sessions";
import { readInquiryContent } from "../inquiries/content-context";
import { consentTerms } from "../privacy/preferences";
import { createStaff } from "../testing";
import {
  createContent,
  decideContent,
  listContent,
  readContentWorkbench,
  saveContent,
} from "./commands";
import {
  contentTargetLocales,
  decideContentLocale,
  readContentLocaleOperation,
  readContentLocaleWorkbench,
  saveContentLocale,
} from "./locale-commands";
import { readApprovedAreas, readApprovedContent } from "./public";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const capabilities: Capability[] = [
  "content.edit",
  "claim.approve",
  "translation.review",
  "listing.review_facts",
  "publication.release",
];
async function staff(caps = capabilities, locales?: PublicLocale[]) {
  const actor = await createStaff(t.db, {
    grants: caps.map((capability) => ({ capability, ...(locales ? { locales } : {}) })),
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...actor, ...(await createSession(t.db, { kind: "staff", id: actor.id })) };
}
type Staff = Awaited<ReturnType<typeof staff>>;
const expiry = () => new Date(Date.now() + 86400000).toISOString();
async function source(
  actor: Staff,
  slug = `synthetic-${randomUUID()}`,
  kind: "help" | "area" | "service" = "help",
  blocks?: ContentBlock[],
) {
  const input = {
    operationId: randomUUID(),
    kind,
    slug,
    title: "Синтетичен български източник",
    text: "Само синтетичен тест. Не е реална политика или професионален съвет.",
    jurisdiction: "Synthetic jurisdiction",
    reviewScope: "Synthetic test review only",
    ...(blocks ? { text: undefined, blocks } : {}),
  };
  const { outcome } = await createContent(t.db, actor.session, input);
  for (const decision of ["claims", "editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(t.db, actor.session, outcome.id);
    await decideContent(t.db, actor.session, {
      id: page.id,
      expectedVersion: page.version,
      operationId: randomUUID(),
      decision,
      note: "Synthetic test-only human fixture decision",
      reviewed: true,
      expiresAt: expiry(),
    });
  }
  return { id: outcome.id, input };
}
async function bound(actor: Staff, id: string, locale: Exclude<PublicLocale, "bg">) {
  const view = await readContentLocaleWorkbench(t.db, actor.session, id, locale);
  if (!view.source) throw new Error("Missing synthetic approved BG source");
  return {
    id,
    locale,
    operationId: randomUUID(),
    expectedVersion: view.edition?.version ?? 1,
    sourceExpectedVersion: view.page.version,
    sourceVersionId: view.source.version.id,
    sourceVersionHash: view.source.version.contentHash,
  };
}
async function draft(actor: Staff, id: string, locale: Exclude<PublicLocale, "bg">) {
  const input = {
    ...(await bound(actor, id, locale)),
    title: `Synthetic ${locale} edition`,
    text:
      locale === "he"
        ? "טקסט בדיקה בלבד. MS-00001 https://example.test/"
        : `Synthetic ${locale} text only. MS-00001 https://example.test/`,
  };
  return { input, result: await saveContentLocale(t.db, actor.session, input) };
}
async function decision(
  actor: Staff,
  id: string,
  locale: Exclude<PublicLocale, "bg">,
  next: "request_review" | "claims" | "language" | "editorial" | "publish" | "reject" | "withdraw",
) {
  const input = {
    ...(await bound(actor, id, locale)),
    decision: next,
    reviewed: true as const,
    note: "Synthetic test-only exact source/target decision",
    expiresAt: expiry(),
  };
  return { input, result: await decideContentLocale(t.db, actor.session, input) };
}
async function publish(
  actor: Staff,
  id: string,
  locale: Exclude<PublicLocale, "bg">,
  release = true,
) {
  for (const next of [
    "request_review",
    "claims",
    "language",
    "editorial",
    ...(release ? (["publish"] as const) : []),
  ] as const)
    await decision(actor, id, locale, next);
}

describe("O21 / F24 / AT22 / AT23 BG-bound CMS language editions", () => {
  describe("legacy editions sharing one BG source", () => {
    let actor: Staff;
    let page: Awaited<ReturnType<typeof source>>;
    beforeAll(async () => {
      actor = await staff();
      page = await source(actor);
    });
    it.each(contentTargetLocales)(
      "keeps %s drafts private and releases only exact separately reviewed editions",
      async (locale) => {
        const { input, result } = await draft(actor, page.id, locale);
        expect((await saveContentLocale(t.db, actor.session, input)).outcome).toEqual(
          result.outcome,
        );
        expect(await readApprovedContent(t.db, "help", page.input.slug, locale)).toBeNull();
        await expect(decision(actor, page.id, locale, "publish")).rejects.toMatchObject({
          code: "approval_stale",
        });
        await publish(actor, page.id, locale);
        const edition = await readApprovedContent(t.db, "help", page.input.slug, locale);
        expect(edition).toMatchObject({
          title: input.title,
          paragraphs: [input.text],
          locale,
          placeId: null,
        });
        expect(edition?.version.id).not.toBe(input.sourceVersionId);
        if (!edition) throw new Error("Missing synthetic target edition");
        expect(
          await t.db.transaction((tx) =>
            readInquiryContent(
              tx,
              { kind: "help", slug: page.input.slug, versionId: edition.version.id },
              locale,
            ),
          ),
        ).toMatchObject({ title: input.title, locale });
        const edited = await draft(actor, page.id, locale);
        expect((await readApprovedContent(t.db, "help", page.input.slug, locale))?.version.id).toBe(
          edition.version.id,
        );
        const view = await readContentLocaleWorkbench(t.db, actor.session, page.id, locale);
        expect(view.decisions).toEqual([]);
        expect(view.current?.versionNumber).toBe(2);
        await expect(
          decideContentLocale(t.db, actor.session, {
            ...edited.input,
            operationId: randomUUID(),
            expectedVersion: edited.result.outcome.version,
            decision: "publish",
            reviewed: true,
            note: "Old decisions cannot approve a new edition",
            expiresAt: expiry(),
          }),
        ).rejects.toMatchObject({ code: "approval_stale" });
      },
    );
  });

  it("requires target-locale grants and separate claim/publication authority, including replay and receipts", async () => {
    const owner = await staff(),
      languageOnly = await staff(["translation.review"], ["en"]),
      editor = await staff(["content.edit"], ["en"]);
    const page = await source(owner);
    await draft(owner, page.id, "en");
    const rows = await listContent(t.db, languageOnly.session);
    expect(rows.rows.find((row) => row.id === page.id)?.entryLocale).toBe("en");
    const view = await readContentLocaleWorkbench(t.db, languageOnly.session, page.id, "en");
    expect(view.localeEditions.map((edition) => edition.locale)).toEqual(["en"]);
    await expect(
      readContentLocaleWorkbench(t.db, languageOnly.session, page.id, "he"),
    ).rejects.toMatchObject({ code: "not_found" });
    await decision(editor, page.id, "en", "request_review");
    await decision(languageOnly, page.id, "en", "language");
    await expect(decision(languageOnly, page.id, "en", "claims")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(decision(languageOnly, page.id, "en", "publish")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(decision(owner, page.id, "en", "publish")).rejects.toMatchObject({
      code: "publication_ineligible",
    });
    const { input, result } = await decision(languageOnly, page.id, "en", "reject");
    expect(
      await readContentLocaleOperation(
        t.db,
        languageOnly.session,
        page.id,
        "en",
        "decide",
        input.operationId,
      ),
    ).toMatchObject({
      status: "succeeded",
      operationId: result.operationId,
      outcome: { locale: "en", reviewState: "rejected" },
    });
    expect(
      await readContentLocaleOperation(
        t.db,
        owner.session,
        page.id,
        "en",
        "decide",
        input.operationId,
      ),
    ).toBeNull();
    await expect(decision(owner, page.id, "en", "request_review")).rejects.toMatchObject({
      code: "approval_stale",
    });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, languageOnly.id));
    await expect(decideContentLocale(t.db, languageOnly.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      readContentLocaleOperation(
        t.db,
        languageOnly.session,
        page.id,
        "en",
        "decide",
        input.operationId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("withdraws locale approvals immediately when the BG source changes, including consent terms and new review", async () => {
    const actor = await staff(),
      page = await source(actor, "search-alert-consent");
    await draft(actor, page.id, "en");
    await publish(actor, page.id, "en");
    const before = await readContentLocaleWorkbench(t.db, actor.session, page.id, "en");
    expect(
      await t.db.transaction((tx) => consentTerms(tx, "search_alerts", "en", true)),
    ).toMatchObject({ locale: "en" });
    const delayed = await bound(actor, page.id, "en");
    await saveContent(t.db, actor.session, {
      ...page.input,
      id: page.id,
      expectedVersion: before.page.version,
      operationId: randomUUID(),
      text: "Променен синтетичен източник.",
    });
    expect(await readApprovedContent(t.db, "help", page.input.slug, "bg")).not.toBeNull();
    expect(await readApprovedContent(t.db, "help", page.input.slug, "en")).toBeNull();
    expect(await consentTerms(t.db, "search_alerts", "en")).toBeNull();
    const after = await readContentLocaleWorkbench(t.db, actor.session, page.id, "en");
    expect(after.edition).toMatchObject({ reviewState: "stale", publicationState: "withdrawn" });
    expect(after.decisions.filter((row) => row.state === "approved")).toHaveLength(0);
    await expect(
      saveContentLocale(t.db, actor.session, {
        ...delayed,
        title: "Stale source draft",
        text: "Cannot reuse old source.",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const newSource = await bound(actor, page.id, "en");
    await expect(
      saveContentLocale(t.db, actor.session, {
        ...newSource,
        title: "Pending BG source",
        text: "Cannot bind to unapproved BG source.",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    for (const next of ["claims", "editorial", "publish"] as const) {
      const { page: currentPage } = await readContentWorkbench(t.db, actor.session, page.id);
      await decideContent(t.db, actor.session, {
        id: page.id,
        expectedVersion: currentPage.version,
        operationId: randomUUID(),
        decision: next,
        reviewed: true,
        expiresAt: expiry(),
        note: "Synthetic replacement BG source decision",
      });
    }
    const refreshed = await readContentLocaleWorkbench(t.db, actor.session, page.id, "en");
    expect(refreshed.sourceReady).toBe(true);
    expect(refreshed.sourceCurrent).toBe(false);
    expect(refreshed.boundSource?.id).toBe(before.source?.version.id);
    await expect(decision(actor, page.id, "en", "language")).rejects.toMatchObject({
      code: "approval_stale",
    });
    await draft(actor, page.id, "en");
    await publish(actor, page.id, "en");
    expect(await consentTerms(t.db, "search_alerts", "en")).toMatchObject({ locale: "en" });
    await t.db
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(approvals.subjectType, "content_page_version"),
          eq(approvals.subjectId, refreshed.source?.version.id ?? randomUUID()),
          eq(approvals.kind, "legal_process_claim"),
        ),
      );
    expect(await consentTerms(t.db, "search_alerts", "en")).toBeNull();
  });

  it("keeps an area edition attached to its exact BG place and rejects forged cross-page source bindings", async () => {
    const actor = await staff(),
      page = await source(actor, `area-${randomUUID()}`, "area"),
      other = await source(actor);
    await draft(actor, page.id, "he");
    await publish(actor, page.id, "he");
    expect(await readApprovedAreas(t.db, "he")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: page.input.slug, locale: "he", placeId: null }),
      ]),
    );
    const view = await readContentLocaleWorkbench(t.db, actor.session, page.id, "he");
    const elsewhere = await bound(actor, other.id, "he");
    await expect(
      saveContentLocale(t.db, actor.session, {
        ...(await bound(actor, page.id, "he")),
        sourceVersionId: elsewhere.sourceVersionId,
        sourceVersionHash: elsewhere.sourceVersionHash,
        title: "Forged binding",
        text: "Synthetic invalid source.",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    if (!view.current || !view.edition) throw new Error("Missing area fixture");
    await expect(
      t.db
        .update(contentLocaleVersions)
        .set({ body: { title: "Changed", paragraphs: ["Changed"] } })
        .where(eq(contentLocaleVersions.id, view.current.id)),
    ).rejects.toMatchObject({
      cause: { code: "23001", message: expect.stringContaining("immutable") },
    });
    await expect(
      t.db.insert(contentLocaleVersions).values({
        ...view.current,
        id: randomUUID(),
        versionNumber: 999,
        sourceVersionId: elsewhere.sourceVersionId,
        sourceVersionHash: elsewhere.sourceVersionHash,
      }),
    ).rejects.toMatchObject({
      cause: { code: "23514", message: expect.stringContaining("exact BG source") },
    });
  });

  it("fences a publish that is already waiting for a concurrently changed BG source", async () => {
    const actor = await staff(),
      page = await source(actor);
    await draft(actor, page.id, "en");
    await publish(actor, page.id, "en", false);
    const input = {
      ...(await bound(actor, page.id, "en")),
      decision: "publish" as const,
      reviewed: true as const,
      note: "Synthetic queued publisher",
      expiresAt: expiry(),
    };
    let pending: Promise<unknown> | undefined;
    await t.db.transaction(async (tx) => {
      await tx.select().from(contentPages).where(eq(contentPages.id, page.id)).for("update");
      pending = decideContentLocale(t.db, actor.session, input);
      // Attach a rejection handler while the publisher is deliberately waiting on the BG lock.
      void pending.catch(() => {});
      const until = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < until) {
        await tx.execute(sql`select pg_stat_clear_snapshot()`);
        const result = await tx.execute(
          sql`select 1 from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like '%content_pages%' limit 1`,
        );
        if (result.length) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await saveContent(tx, actor.session, {
        ...page.input,
        id: page.id,
        operationId: randomUUID(),
        expectedVersion: input.sourceExpectedVersion,
        text: "Синтетичен източник, променен преди публикуването.",
      });
    });
    await expect(pending).rejects.toMatchObject({ code: "version_conflict" });
    expect(await readApprovedContent(t.db, "help", page.input.slug, "en")).toBeNull();
    const [edition] = await t.db
      .select()
      .from(contentLocaleEditions)
      .where(
        and(
          eq(contentLocaleEditions.contentPageId, page.id),
          eq(contentLocaleEditions.locale, "en"),
        ),
      );
    expect(edition?.publicationState).toBe("withdrawn");
    const versions = await t.db
      .select({ id: contentLocaleVersions.id })
      .from(contentLocaleVersions)
      .where(eq(contentLocaleVersions.editionId, edition?.id ?? randomUUID()));
    const active = await t.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, "content_locale_version"),
          inArray(
            approvals.subjectId,
            versions.map((row) => row.id),
          ),
          eq(approvals.state, "approved"),
        ),
      );
    expect(active).toEqual([]);
  }, 15000);
  it.each(contentTargetLocales)(
    "M071 binds typed %s content to exact BG structure and rejects stale review",
    async (locale) => {
      const actor = await staff();
      const sourceBlocks: ContentBlock[] = [
        { type: "heading", text: "Синтетичен процес" },
        {
          type: "step",
          title: "Синтетична стъпка",
          text: "Само тест, без реално твърдение за услуга.",
        },
      ];
      const page = await source(actor, undefined, "service", sourceBlocks);

      const blocks: ContentBlock[] = [
        { type: "heading", text: `Synthetic ${locale} process` },
        {
          type: "step",
          title: "Synthetic step",
          text: "MS-00001 · 123 EUR · 45 m² · 2 bedrooms · Sandanski",
        },
        { type: "list", items: ["Synthetic first fact", "Synthetic second fact"] },
        { type: "callout", title: "Synthetic scope", text: "Test-only boundary" },
        { type: "link", text: "Synthetic contact", href: `/${locale}/contact` },
      ];
      const input = {
        ...(await bound(actor, page.id, locale)),
        title: `Synthetic ${locale} title`,
        blocks,
      };
      await saveContentLocale(t.db, actor.session, input);
      expect(await readApprovedContent(t.db, "service", page.input.slug, locale)).toBeNull();
      await publish(actor, page.id, locale, false);
      expect(await readApprovedContent(t.db, "service", page.input.slug, locale)).toBeNull();
      await decision(actor, page.id, locale, "publish");
      const approved = await readApprovedContent(t.db, "service", page.input.slug, locale);
      expect(approved).toMatchObject({
        format: "blocks",
        blocks,
        paragraphs: [
          `Synthetic ${locale} process`,
          "Synthetic step",
          "MS-00001 · 123 EUR · 45 m² · 2 bedrooms · Sandanski",
          "Synthetic first fact",
          "Synthetic second fact",
          "Synthetic scope",
          "Test-only boundary",
          "Synthetic contact",
          `/${locale}/contact`,
        ],
      });
      const before = await readContentLocaleWorkbench(t.db, actor.session, page.id, locale);
      const changed: ContentBlock[] = [
        { type: "paragraph", text: `Synthetic ${locale} process` },
        ...blocks.slice(1),
      ];
      await saveContentLocale(t.db, actor.session, {
        ...(await bound(actor, page.id, locale)),
        title: input.title,
        blocks: changed,
      });
      const after = await readContentLocaleWorkbench(t.db, actor.session, page.id, locale);
      expect(after.current?.contentHash).not.toBe(before.current?.contentHash);
      expect(after.decisions).toEqual([]);
      await expect(decision(actor, page.id, locale, "publish")).rejects.toMatchObject({
        code: "approval_stale",
      });
      expect(
        (await readApprovedContent(t.db, "service", page.input.slug, locale))?.version.id,
      ).toBe(approved?.version.id);

      const view = await readContentWorkbench(t.db, actor.session, page.id);
      await saveContent(t.db, actor.session, {
        ...page.input,
        id: page.id,
        expectedVersion: view.page.version,
        operationId: randomUUID(),
        text: undefined,
        blocks: [{ type: "paragraph", text: "Синтетичен процес" }, ...sourceBlocks.slice(1)],
      });

      expect(await readApprovedContent(t.db, "service", page.input.slug, locale)).toBeNull();
      const stale = await readContentLocaleWorkbench(t.db, actor.session, page.id, locale);
      expect(stale.edition?.reviewState).toBe("stale");
      expect(stale.decisions.filter((entry) => entry.state === "approved")).toEqual([]);
      await expect(
        saveContentLocale(t.db, actor.session, {
          ...(await bound(actor, page.id, locale)),
          title: "Stale draft",
          blocks: sourceBlocks,
        }),
      ).rejects.toMatchObject({ code: "approval_stale" });
    },
    20000,
  );
});
