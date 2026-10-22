import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  briefRevisions,
  caseStageHistory,
  cases,
  contentPages,
  currentPublications,
  inquiries,
  listings,
  messages,
  tasks,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { Fact } from "@/domain/facts";
import {
  type ContextSelection,
  contextSelectionSchema,
  type SourcePin,
  type WorkspaceContext,
  type WorkspaceSource,
} from "@/domain/generative";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { assertCan, assertCanRead, can, resolveGrants } from "../authz";
import { caseGrantVisibility } from "../cases/shared";
import { hostOrigins } from "../config/hosts";
import { readApprovedContent } from "../content/public";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { loadPublishedListings, toCard } from "../publication/presentation";
import { caseMatchCriteriaInput } from "../search/search";
import { parseInput, visibleWhere } from "../work/shared";

const limits = { tasks: 20, history: 12, messages: 10, content: 6, text: 4000, total: 32000 };

/**
 * Saved drafts, conversations and checkpoints retain the permissions of every private
 * source they used. Check actual parents directly: a source falling out of today's bounded
 * window is not a permission loss, and a new window cannot hide a revoked child permission.
 * Freshness and session ownership are separate caller checks; revisions are not compared.
 */
export async function assertWorkspaceSourcePinsAuthorized(
  db: Executor,
  actor: Actor,
  pins: SourcePin[],
): Promise<void> {
  if (actor.kind !== "staff" || (await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum)
    throw new AppError("not_found");
  const grants = await resolveGrants(db, actor);
  const ids = (type: SourcePin["type"]) => [
    ...new Set(
      pins
        .filter(
          (pin) => pin.type === type && !(type === "message" && pin.key === `intent:${pin.id}`),
        )
        .map((pin) => pin.id),
    ),
  ];
  const caseIds = ids("case");
  const inquiryIds = ids("inquiry");
  const taskIds = ids("task");
  const messageIds = ids("message");
  const listingIds = ids("listing");
  if (
    [...caseIds, ...inquiryIds, ...taskIds, ...messageIds, ...listingIds].some(
      (id) => !z.uuid().safeParse(id).success,
    )
  )
    throw new AppError("not_found");

  if (caseIds.length) {
    const rows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          inArray(cases.id, caseIds),
          caseGrantVisibility(grants, "case.read"),
          caseGrantVisibility(grants, "ai.draft"),
        ),
      );
    if (rows.length !== caseIds.length) throw new AppError("not_found");
    for (const row of rows) {
      const resource = { type: "case", id: row.id, audience: "internal" as const };
      await assertCanRead(db, actor, "case.read", resource);
      await assertCanRead(db, actor, "ai.draft", resource);
    }
  }
  if (inquiryIds.length) {
    const rows = await db
      .select({ id: inquiries.id, caseId: inquiries.caseId, locale: inquiries.preferredLocale })
      .from(inquiries)
      .where(
        and(
          inArray(inquiries.id, inquiryIds),
          visibleWhere(grants, "inquiry.read", "inquiry"),
          visibleWhere(grants, "ai.draft", "inquiry"),
        ),
      );
    if (rows.length !== inquiryIds.length) throw new AppError("not_found");
    for (const row of rows) {
      const resource = {
        type: "inquiry",
        id: row.id,
        ...(row.caseId ? { caseId: row.caseId } : {}),
        ...(row.locale ? { locale: row.locale } : {}),
        audience: "internal" as const,
      };
      await assertCanRead(db, actor, "inquiry.read", resource);
      await assertCanRead(db, actor, "ai.draft", resource);
    }
  }
  if (taskIds.length) {
    const rows = await db
      .select({ id: tasks.id, caseId: tasks.caseId })
      .from(tasks)
      .where(
        and(
          inArray(tasks.id, taskIds),
          visibleWhere(grants, "task.manage", "task"),
          visibleWhere(grants, "ai.draft", "task"),
        ),
      );
    if (rows.length !== taskIds.length) throw new AppError("not_found");
    for (const row of rows) {
      const resource = {
        type: "task",
        id: row.id,
        ...(row.caseId ? { caseId: row.caseId } : {}),
        audience: "internal" as const,
      };
      await assertCanRead(db, actor, "task.manage", resource);
      await assertCanRead(db, actor, "ai.draft", resource);
    }
  }
  if (messageIds.length) {
    const rows = await db
      .select({
        id: messages.id,
        caseId: messages.caseId,
        audience: messages.audience,
        channel: messages.channel,
        state: messages.state,
      })
      .from(messages)
      .where(inArray(messages.id, messageIds));
    if (rows.length !== messageIds.length) throw new AppError("not_found");
    for (const row of rows) {
      // The workspace never ingests specialist messages, private mail or unattached files.
      if (
        !row.caseId ||
        (row.audience !== "internal" &&
          !(
            row.audience === "case_participants" &&
            row.channel === "in_app" &&
            row.state === "delivered"
          ))
      )
        throw new AppError("not_found");
      const resource = {
        type: "message",
        id: row.id,
        caseId: row.caseId,
        audience: row.audience,
      };
      await assertCanRead(db, actor, "case.read", { type: "case", id: row.caseId });
      if (row.audience === "internal")
        await assertCanRead(db, actor, "case.read_internal", resource);
      await assertCanRead(db, actor, "ai.draft", resource);
    }
  }
  if (listingIds.length) {
    const rows = await db
      .select({ id: listings.id, propertyId: listings.propertyId })
      .from(listings)
      .where(inArray(listings.id, listingIds));
    if (rows.length !== listingIds.length) throw new AppError("not_found");
    for (const row of rows) {
      const resource = { type: "listing", id: row.id, propertyId: row.propertyId };
      await assertCanRead(db, actor, "listing.read", resource);
      await assertCanRead(db, actor, "ai.draft", resource);
    }
  }
  // Content/external pins contain already public source text. They never authorize access
  // to editable CMS editions. Depublication changes freshness in resolveWorkspaceContext.
  // Derived calculation text is covered by the caller's complete ancestor source manifests.
}

/** Contact details and identifier-like text are never needed for process planning. */
export function minimizeWorkspaceText(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact removed]")
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z\d]){11,30}\b/gi, "[identifier removed]")
    .replace(
      /\+\d[\d\s().-]{7,}\d|\b\d{10,13}\b|\b\d{3}[ ().-]\d{3}[ ().-]\d{4}\b/g,
      "[contact removed]",
    );
}

function factValue(fact: Fact<unknown>): unknown {
  // Keep the approved value and its uncertainty; source-document references and reviewer
  // identities do not belong in a model's inventory comparison input.
  if (fact.state === "known") return { state: fact.state, value: fact.value };
  if (fact.state === "conflicting") return { state: fact.state, candidates: fact.candidates };
  return { state: fact.state };
}

/**
 * Rebuild the selected, currently authorized projection on every call. There is no RLS:
 * record/case/locale scope is part of SQL before every private ordered or limited query.
 * Documents, contacts, duplicate inquiries, recipient lists and audit payloads are excluded.
 */
export async function resolveWorkspaceContext(
  db: Executor,
  actor: Actor,
  raw: ContextSelection,
  options: { lock?: boolean } = {},
): Promise<WorkspaceContext> {
  if (actor.kind !== "staff") throw new AppError("not_found");
  const selection = parseInput(contextSelectionSchema, raw);
  if ((await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum)
    throw new AppError("forbidden");
  const grants = await resolveGrants(db, actor);
  // A task-only workspace is valid without an invented Case, but requires global AI access.
  if (!selection.caseId && !selection.inquiryId && !selection.listingIds.length)
    await assertCan(db, actor, "ai.draft");
  let truncated = false;
  let characters = 0;
  const sources: WorkspaceSource[] = [];
  const text = (value: unknown, max = limits.text) => {
    const safe = minimizeWorkspaceText(typeof value === "string" ? value : "");
    if (safe.length > max) truncated = true;
    return safe.slice(0, max);
  };
  const add = (source: Omit<WorkspaceSource, "digest">) => {
    if (source.text.length > limits.text) truncated = true;
    const prepared = {
      ...source,
      title: text(source.title, 200),
      text: source.text.slice(0, limits.text),
    };
    const size = JSON.stringify(prepared).length;
    if (characters + size > limits.total) {
      truncated = true;
      return;
    }
    characters += size;
    sources.push({ ...prepared, digest: hashRequest(prepared) });
  };
  const bounded = <T>(rows: T[], count: number): T[] => {
    if (rows.length > count) truncated = true;
    return rows.slice(0, count);
  };

  if (selection.caseId) {
    const query = db
      .select({
        id: cases.id,
        reference: cases.reference,
        version: cases.version,
        title: cases.title,
        kind: cases.kind,
        stage: cases.stage,
        disposition: cases.disposition,
        nextAction: cases.nextAction,
        waitingOn: cases.waitingOn,
        clientSummary: cases.clientSummary,
      })
      .from(cases)
      .where(
        and(
          eq(cases.id, selection.caseId),
          caseGrantVisibility(grants, "case.read"),
          caseGrantVisibility(grants, "ai.draft"),
        ),
      );
    const [record] = await (options.lock ? query.for("share") : query);
    if (!record) throw new AppError("not_found");
    const resource = { type: "case", id: record.id, audience: "internal" as const };
    await assertCanRead(db, actor, "case.read", resource);
    await assertCan(db, actor, "ai.draft", resource);
    add({
      key: `case:${record.id}`,
      type: "case",
      id: record.id,
      revision: String(record.version),
      audience: "internal",
      title: record.reference,
      text: [record.title, record.nextAction, record.waitingOn, record.clientSummary]
        .filter(Boolean)
        .map((part) => text(part, 1200))
        .join("\n"),
      facts: {
        version: String(record.version),
        reference: record.reference,
        kind: record.kind,
        stage: record.stage,
        disposition: record.disposition,
      },
    });

    const briefQuery = db
      .select({
        id: briefRevisions.id,
        revision: briefRevisions.revisionNumber,
        items: briefRevisions.items,
        criteria: briefRevisions.criteria,
        clientAcknowledgedAt: briefRevisions.clientAcknowledgedAt,
      })
      .from(briefRevisions)
      .innerJoin(cases, eq(cases.id, briefRevisions.caseId))
      .where(
        and(
          eq(cases.id, record.id),
          caseGrantVisibility(grants, "case.read"),
          caseGrantVisibility(grants, "ai.draft"),
        ),
      )
      .orderBy(desc(briefRevisions.revisionNumber))
      .limit(1);
    const [brief] = await (options.lock ? briefQuery.for("share") : briefQuery);
    if (brief) {
      const items = Array.isArray(brief.items) ? bounded(brief.items, 20) : [];
      const criteria = caseMatchCriteriaInput.safeParse(brief.criteria);
      add({
        key: `brief:${brief.id}`,
        type: "case",
        id: record.id,
        revision: String(brief.revision),
        title: "Current case brief",
        audience: "internal",
        text: items
          .flatMap((item) => (typeof item?.text === "string" ? [text(item.text, 1500)] : []))
          .join("\n"),
        facts: {
          briefId: brief.id,
          briefRevision: String(brief.revision),
          clientAcknowledged: String(Boolean(brief.clientAcknowledgedAt)),
          criteria: criteria.success ? JSON.stringify(criteria.data) : "{}",
        },
      });
    }

    const taskQuery = db
      .select({
        id: tasks.id,
        version: tasks.version,
        caseId: tasks.caseId,
        title: tasks.title,
        purpose: tasks.purpose,
        type: tasks.type,
        state: tasks.state,
        promised: tasks.promisedToClient,
        waitingOn: tasks.waitingOn,
        outcome: tasks.outcomeNote,
        dueAt: tasks.dueAt,
        followUpAt: tasks.followUpAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.caseId, record.id),
          visibleWhere(grants, "task.manage", "task"),
          visibleWhere(grants, "ai.draft", "task"),
        ),
      )
      .orderBy(desc(tasks.createdAt), asc(tasks.id))
      .limit(limits.tasks + 1);
    for (const task of bounded(
      await (options.lock ? taskQuery.for("share") : taskQuery),
      limits.tasks,
    )) {
      const taskScope = {
        type: "task",
        id: task.id,
        caseId: record.id,
        audience: "internal" as const,
      };
      await assertCanRead(db, actor, "task.manage", taskScope);
      await assertCan(db, actor, "ai.draft", taskScope);
      add({
        key: `task:${task.id}`,
        type: "task",
        id: task.id,
        revision: String(task.version),
        title: task.title,
        audience: "internal",
        text: [task.title, task.purpose, task.waitingOn, task.outcome]
          .filter(Boolean)
          .map((part) => text(part, 1000))
          .join("\n"),
        facts: {
          version: String(task.version),
          caseId: record.id,
          type: task.type,
          state: task.state,
          promisedToClient: String(task.promised),
          dueAt: task.dueAt?.toISOString() ?? "",
          followUpAt: task.followUpAt?.toISOString() ?? "",
        },
      });
    }

    const history = await db
      .select({
        id: caseStageHistory.id,
        from: caseStageHistory.fromStage,
        to: caseStageHistory.toStage,
      })
      .from(caseStageHistory)
      .innerJoin(cases, eq(cases.id, caseStageHistory.caseId))
      .where(
        and(
          eq(cases.id, record.id),
          caseGrantVisibility(grants, "case.read"),
          caseGrantVisibility(grants, "ai.draft"),
        ),
      )
      .orderBy(desc(caseStageHistory.occurredAt), asc(caseStageHistory.id))
      .limit(limits.history + 1);
    for (const event of bounded(history, limits.history))
      add({
        key: `history:${event.id}`,
        type: "case",
        id: record.id,
        revision: event.id,
        title: "Case stage history",
        audience: "internal",
        text: `${event.from ?? "initial"} → ${event.to}`,
        facts: { stage: event.to },
      });

    if (await can(db, actor, "case.read_internal", resource)) {
      const messageQuery = db
        .select({ id: messages.id, version: messages.version, body: messages.body })
        .from(messages)
        .innerJoin(cases, eq(cases.id, messages.caseId))
        .where(
          and(
            eq(cases.id, record.id),
            caseGrantVisibility(grants, "case.read_internal"),
            caseGrantVisibility(grants, "ai.draft"),
            or(
              eq(messages.audience, "internal"),
              and(
                eq(messages.audience, "case_participants"),
                eq(messages.channel, "in_app"),
                eq(messages.state, "delivered"),
              ),
            ),
          ),
        )
        .orderBy(desc(messages.createdAt), asc(messages.id))
        .limit(limits.messages + 1);
      for (const message of bounded(
        await (options.lock ? messageQuery.for("share") : messageQuery),
        limits.messages,
      ))
        add({
          key: `message:${message.id}`,
          type: "message",
          id: message.id,
          revision: String(message.version),
          title: "Case message",
          audience: "internal",
          text: text(message.body),
          facts: { caseId: record.id },
        });
    }
  }

  if (selection.inquiryId) {
    const query = db
      .select({
        id: inquiries.id,
        version: inquiries.version,
        reference: inquiries.reference,
        caseId: inquiries.caseId,
        preferredLocale: inquiries.preferredLocale,
        purpose: inquiries.purpose,
        state: inquiries.state,
        message: inquiries.message,
      })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.id, selection.inquiryId),
          visibleWhere(grants, "inquiry.read", "inquiry"),
          visibleWhere(grants, "ai.draft", "inquiry"),
        ),
      );
    const [row] = await (options.lock ? query.for("share") : query);
    if (!row) throw new AppError("not_found");
    if (selection.caseId && row.caseId !== selection.caseId) throw new AppError("not_found");
    const resource = {
      type: "inquiry",
      id: row.id,
      ...(row.caseId ? { caseId: row.caseId } : {}),
      ...(row.preferredLocale ? { locale: row.preferredLocale } : {}),
      audience: "internal" as const,
    };
    await assertCanRead(db, actor, "inquiry.read", resource);
    await assertCan(db, actor, "ai.draft", resource);
    add({
      key: `inquiry:${row.id}`,
      type: "inquiry",
      id: row.id,
      revision: String(row.version),
      title: row.reference,
      audience: "internal",
      text: text(row.message),
      facts: {
        version: String(row.version),
        reference: row.reference,
        purpose: row.purpose,
        state: row.state,
      },
    });
  }

  const selectedListings = [...new Set(selection.listingIds)].sort();
  if (selectedListings.length) {
    const query = db
      .select({ id: listings.id, propertyId: listings.propertyId })
      .from(listings)
      .where(inArray(listings.id, selectedListings))
      .orderBy(asc(listings.id));
    const rows = await (options.lock ? query.for("share") : query);
    if (rows.length !== selectedListings.length) throw new AppError("not_found");
    for (const row of rows) {
      const resource = { type: "listing", id: row.id, propertyId: row.propertyId };
      await assertCanRead(db, actor, "listing.read", resource);
      await assertCan(db, actor, "ai.draft", resource);
    }
    if (options.lock)
      await db
        .select({ id: currentPublications.id })
        .from(currentPublications)
        .where(
          and(
            inArray(currentPublications.listingId, selectedListings),
            eq(currentPublications.locale, "bg"),
          ),
        )
        .for("share");
    const published = await loadPublishedListings(db, { ids: selectedListings }, "bg");
    if (published.length !== selectedListings.length) throw new AppError("listing_unavailable");
    for (const listing of published) {
      const card = toCard(listing, new Date());
      const values = {
        reference: listing.reference,
        sourceUrl: new URL(
          `/bg/properties/${encodeURIComponent(listing.reference)}/${card.slug}`,
          hostOrigins().public,
        ).toString(),
        purpose: listing.purpose,
        propertyType: listing.propertyType,
        location: card.place,
        price: factValue(card.price),
        bedrooms: factValue(card.bedrooms),
        area: factValue(card.area),
        availability: card.availability.presented,
      };
      add({
        key: `listing:${listing.listingId}`,
        type: "listing",
        id: listing.listingId,
        revision: listing.manifestId,
        title: listing.title ?? listing.reference,
        audience: "approved_public",
        text: [
          text(listing.title, 200),
          text(listing.description, 1800),
          JSON.stringify(values),
        ].join("\n"),
        facts: {
          manifestId: listing.manifestId,
          listingRevisionId: listing.listingRevisionId,
          reference: listing.reference,
          sourceUrl: values.sourceUrl,
          availability: card.availability.presented,
          price: JSON.stringify(values.price),
          bedrooms: JSON.stringify(values.bedrooms),
          area: JSON.stringify(values.area),
          location: JSON.stringify(values.location),
        },
      });
    }
  }

  const pagesQuery = db
    .select({ id: contentPages.id, kind: contentPages.kind, slug: contentPages.slug })
    .from(contentPages)
    .where(eq(contentPages.publicationState, "active"))
    .orderBy(asc(contentPages.kind), asc(contentPages.slug))
    .limit(limits.content + 1);
  for (const page of bounded(
    await (options.lock ? pagesQuery.for("share") : pagesQuery),
    limits.content,
  )) {
    const approved = await readApprovedContent(db, page.kind, page.slug, "bg", options);
    if (!approved) continue;
    add({
      key: `content:${page.id}`,
      type: "content",
      id: page.id,
      revision: String(approved.version.number),
      title: approved.title,
      audience: "approved_public",
      text: [approved.title, ...approved.paragraphs].map((part) => text(part, 1500)).join("\n"),
      facts: {
        versionId: approved.version.id,
        contentHash: approved.version.contentHash,
        locale: approved.locale,
        jurisdiction: text(approved.jurisdiction, 200),
        reviewScope: text(approved.reviewScope, 500),
      },
    });
  }
  sources.sort((left, right) => left.key.localeCompare(right.key));
  const pins = sources.map(({ key, type, id, revision, digest }) => ({
    key,
    type,
    id,
    revision,
    digest,
  }));
  return { sources, pins, digest: hashRequest({ pins, truncated }), truncated };
}
