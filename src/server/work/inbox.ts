// O02 Inbox (spec F18 step 1, L08). Distinct views for unassigned work, the actor's own work,
// requests awaiting the client and delivery/contact problems, ordered by the earliest
// commitment and then by age, never by an opaque lead score.
import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  contactMethods,
  inquiries,
  listings,
  messages,
  outboxMessages,
  persons,
  tasks,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { InquiryState } from "@/domain/inquiry";
import { can } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { firstResponseDueAt, loadServicePolicies } from "./policy";
import {
  dueView,
  invalid,
  openInquiryStates,
  openTaskStates,
  ownerRef,
  ref,
  requireStaff,
  staffNames,
} from "./shared";
import {
  type InboxPage,
  type InboxRequiredAction,
  type InboxRow,
  type InboxView,
  inboxViews,
} from "./types";

export interface InboxOptions {
  readonly view: InboxView;
  /** Opaque cursor from a previous page. */
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly now?: Date;
}

const snippetLength = 160;
const unknownOutcomeGraceMs = 5 * 60_000;

/**
 * ponytail: the open queue is loaded and ordered in memory, since the commitment order mixes
 * policy promises, follow-ups and task due points. Fine for an agency's open inquiries (low
 * thousands); move the ordering into SQL if the open queue grows past that.
 */
export async function listInbox(
  db: Executor,
  actor: Actor,
  options: InboxOptions,
): Promise<InboxPage> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  if (!inboxViews.includes(options.view)) throw invalid("view", "invalid_view");
  if (!(await can(db, actor, "inquiry.read", undefined, now))) throw new AppError("forbidden");
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const after = options.cursor ? decodeCursor(options.cursor) : null;

  const grace = new Date(now.getTime() - unknownOutcomeGraceMs);
  const problemRows = await db
    .selectDistinct({ inquiryId: messages.inquiryId })
    .from(outboxMessages)
    .innerJoin(messages, eq(messages.id, outboxMessages.messageId))
    .where(
      and(
        isNotNull(messages.inquiryId),
        or(
          eq(outboxMessages.state, "failed"),
          and(
            eq(outboxMessages.state, "outcome_unknown"),
            or(
              isNotNull(outboxMessages.lastErrorCode),
              lt(outboxMessages.dispatchStartedAt, grace),
            ),
          ),
        ),
      ),
    );
  const problemIds = new Set(problemRows.map((r) => r.inquiryId as string));

  const rows = await db
    .select({
      inquiry: inquiries,
      personName: persons.displayName,
      channelKind: contactMethods.kind,
      verification: contactMethods.verification,
      listingReference: listings.reference,
    })
    .from(inquiries)
    .leftJoin(persons, eq(persons.id, inquiries.personId))
    .leftJoin(contactMethods, eq(contactMethods.id, inquiries.contactMethodId))
    .leftJoin(listings, eq(listings.id, inquiries.listingId))
    .where(
      or(
        inArray(inquiries.state, [...openInquiryStates]),
        problemIds.size ? inArray(inquiries.id, [...problemIds]) : sql`false`,
      ),
    );
  const ids = rows.map((r) => r.inquiry.id);

  const latest = ids.length
    ? await db
        .selectDistinctOn([messages.inquiryId], {
          inquiryId: messages.inquiryId,
          body: messages.body,
        })
        .from(messages)
        .where(
          and(
            inArray(messages.inquiryId, ids),
            eq(messages.kind, "external"),
            notInArray(messages.state, ["draft", "human_approved"]),
          ),
        )
        .orderBy(messages.inquiryId, desc(messages.createdAt))
    : [];
  const snippets = new Map(latest.map((m) => [m.inquiryId as string, m.body]));

  const taskDue = ids.length
    ? await db
        .select({
          inquiryId: tasks.inquiryId,
          dueAt: sql<Date | null>`min(coalesce(case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} end, ${tasks.dueAt}))`,
          open: sql<number>`count(*)::int`,
        })
        .from(tasks)
        .where(and(inArray(tasks.inquiryId, ids), inArray(tasks.state, [...openTaskStates])))
        .groupBy(tasks.inquiryId)
    : [];
  const tasksByInquiry = new Map(
    taskDue.map((t) => [
      t.inquiryId as string,
      { dueAt: t.dueAt ? new Date(t.dueAt) : null, open: t.open },
    ]),
  );
  const policies = await loadServicePolicies(db);
  const names = await staffNames(
    db,
    rows.map((r) => r.inquiry.ownerStaffId),
  );

  const all = rows.map((r) => {
    const i = r.inquiry;
    const open = openInquiryStates.includes(i.state);
    const deliveryProblem = problemIds.has(i.id);
    const unreachable = open && (!r.channelKind || r.verification === "failed");
    const task = tasksByInquiry.get(i.id);
    const commitments = [
      i.state === "awaiting_client" ? i.followUpAt : null,
      open && !i.firstResponseAt ? firstResponseDueAt(policies, i.createdAt) : null,
      task?.dueAt ?? null,
    ].filter((d): d is Date => d !== null);
    const commitment = commitments.length
      ? new Date(Math.min(...commitments.map((d) => d.getTime())))
      : null;
    const row: InboxRow = {
      inquiry: ref("inquiry", i.id, i.reference),
      version: i.version,
      state: i.state,
      person: { id: i.personId, name: r.personName ?? i.preferredName },
      channel:
        r.channelKind && r.verification
          ? { kind: r.channelKind, verification: r.verification }
          : null,
      purpose: i.purpose,
      listing: i.listingId ? ref("listing", i.listingId, r.listingReference) : null,
      snippet: snippet(snippets.get(i.id) ?? i.message),
      receivedAt: i.createdAt.toISOString(),
      ageSeconds: Math.max(0, Math.floor((now.getTime() - i.createdAt.getTime()) / 1000)),
      owner: ownerRef(names, i.ownerStaffId),
      requiredAction: requiredAction(i.state, {
        deliveryProblem,
        unreachable,
        owned: Boolean(i.ownerStaffId),
        responded: Boolean(i.firstResponseAt),
        followUpDue: Boolean(i.followUpAt && i.followUpAt < now),
        openTasks: task?.open ?? 0,
      }),
      commitmentDue: open ? dueView(commitment, now) : null,
      deliveryProblem,
    };
    return { row, open, unreachable, ownerId: i.ownerStaffId, sort: sortKey(commitment, i) };
  });

  const inView = (view: InboxView) =>
    all.filter(({ row, open, unreachable, ownerId }) => {
      switch (view) {
        case "unassigned":
          return open && ownerId === null;
        case "mine":
          return open && ownerId === actor.id && row.state !== "awaiting_client";
        case "awaiting_client":
          return ownerId === actor.id && row.state === "awaiting_client";
        default: // problems
          return (ownerId === actor.id || ownerId === null) && (row.deliveryProblem || unreachable);
      }
    });
  const counts = Object.fromEntries(inboxViews.map((v) => [v, inView(v).length])) as Record<
    InboxView,
    number
  >;

  const ordered = inView(options.view).sort((a, b) => compareKeys(a.sort, b.sort));
  const start = after ? ordered.findIndex((item) => compareKeys(item.sort, after) > 0) : 0;
  const page = start < 0 ? [] : ordered.slice(start, start + limit);
  const last = page.at(-1);
  const more = start >= 0 && start + limit < ordered.length;
  return {
    view: options.view,
    rows: page.map((item) => item.row),
    nextCursor: more && last ? encodeCursor(last.sort) : null,
    counts,
  };
}

function requiredAction(
  state: InquiryState,
  facts: {
    deliveryProblem: boolean;
    unreachable: boolean;
    owned: boolean;
    responded: boolean;
    followUpDue: boolean;
    openTasks: number;
  },
): InboxRequiredAction {
  if (facts.deliveryProblem) return "resolve_delivery";
  if (!openInquiryStates.includes(state)) return "none";
  if (facts.unreachable) return "fix_contact_route";
  if (state === "suspected_duplicate") return "review_duplicate";
  if (!facts.owned) return "assign";
  if (state === "awaiting_client") return facts.followUpDue ? "follow_up" : "await_client";
  if (!facts.responded) return "first_response";
  if (state === "ready_for_case") return "create_or_link_case";
  return facts.openTasks ? "none" : "set_next_action";
}

function snippet(text: string | null | undefined): string | null {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > snippetLength ? `${flat.slice(0, snippetLength - 1)}…` : flat;
}

/** [commitment ms or null (last), received ms, id]. */
type SortKey = [number | null, number, string];

function sortKey(commitment: Date | null, inquiry: { createdAt: Date; id: string }): SortKey {
  return [commitment?.getTime() ?? null, inquiry.createdAt.getTime(), inquiry.id];
}

function compareKeys(a: SortKey, b: SortKey): number {
  const [ad, ac, ai] = a;
  const [bd, bc, bi] = b;
  if (ad !== bd) {
    if (ad === null) return 1;
    if (bd === null) return -1;
    return ad - bd;
  }
  return ac - bc || (ai < bi ? -1 : ai > bi ? 1 : 0);
}

function encodeCursor(key: SortKey): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeCursor(cursor: string): SortKey {
  try {
    const key = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(key) &&
      key.length === 3 &&
      (key[0] === null || typeof key[0] === "number") &&
      typeof key[1] === "number" &&
      typeof key[2] === "string"
    ) {
      return key as SortKey;
    }
  } catch {
    // Falls through to the validation error.
  }
  throw invalid("cursor", "invalid_cursor");
}
