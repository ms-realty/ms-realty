import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { externalActions, inboxEvents, workerProgress } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import type { Executor } from "../db";
import { liveStaff } from "../work/shared";
import { assistanceAvailability } from "./config";

export function workerHealth(
  progress: { buildSha: string; completedAt: Date } | undefined,
  buildSha: string | undefined,
  now = new Date(),
) {
  if (!progress) return { state: "missing" as const, reason: "no_progress", completedAt: null };
  const age = now.getTime() - progress.completedAt.getTime();
  const current = Boolean(
    buildSha && buildSha === progress.buildSha && age >= -30000 && age <= 180000,
  );
  return {
    state: current ? ("current" as const) : ("stale" as const),
    reason: !buildSha
      ? "build_unbound"
      : progress.buildSha !== buildSha
        ? "other_build"
        : age < -30000
          ? "future_timestamp"
          : age > 180000
            ? "progress_expired"
            : "recent_queue_progress",
    completedAt: progress.completedAt.toISOString(),
  };
}

export type ExternalActionView = { kind: "queue"; page: number } | { kind: "record"; id: string };

/** Aggregate status only: no private source, job payload, recipient or provider error body. */
export async function readAssistanceOperations(
  db: Executor,
  session: Session,
  externalView?: ExternalActionView,
) {
  const live = await liveStaff(db, session);
  await assertCan(db, live.actor, "report.read");
  const [installed] = await db.execute<{ table: string | null }>(
    sql`select to_regclass('pgboss.job')::text as table`,
  );
  const jobs = installed?.table
    ? await db.execute<{
        name: string;
        state: string;
        count: string;
        oldest: Date;
        lastCompleted: Date | null;
      }>(sql`
    select name, state::text, count(*)::text as count, min(created_on) as oldest, max(completed_on) as "lastCompleted"
    from pgboss.job where name in ('auth.email_link','outbox.dispatch','outbox.sweep','search_alerts.sweep','rate_limit.prune','files.process','ai.draft','inbox.reconcile','worker.heartbeat')
    group by name, state order by name, state
  `)
    : null;
  const runs = await db.execute<{ state: string; count: string }>(
    sql`select state, count(*)::text as count from assistance_runs group by state order by state`,
  );
  const [spend] = await db.execute<{ known: string; reserved: string }>(sql`
    select coalesce(sum(actual_cost_micros),0)::text as known,
      coalesce(sum(case when actual_cost_micros is null then reserved_cost_micros else 0 end),0)::text as reserved
    from assistance_runs where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  `);
  const events = await db
    .select({
      id: inboxEvents.id,
      state: inboxEvents.state,
      provider: inboxEvents.provider,
      eventType: inboxEvents.eventType,
      receivedAt: inboxEvents.receivedAt,
      processedAt: inboxEvents.processedAt,
      code: inboxEvents.errorCode,
    })
    .from(inboxEvents)
    .orderBy(desc(inboxEvents.receivedAt))
    .limit(30);
  const external = await db
    .select({
      id: externalActions.id,
      kind: externalActions.kind,
      state: externalActions.state,
      attempts: externalActions.attempts,
      at: externalActions.lastAttemptAt,
      code: externalActions.lastErrorCode,
    })
    .from(externalActions)
    .where(
      externalView
        ? and(
            inArray(externalActions.state, ["outcome_unknown", "failed"]),
            externalView.kind === "record" ? eq(externalActions.id, externalView.id) : undefined,
          )
        : inArray(externalActions.state, ["attempting", "outcome_unknown", "failed"]),
    )
    .orderBy(
      externalView ? asc(externalActions.updatedAt) : desc(externalActions.updatedAt),
      asc(externalActions.id),
    )
    .limit(externalView?.kind === "queue" ? 31 : 30)
    .offset(externalView?.kind === "queue" ? (externalView.page - 1) * 30 : 0);
  const safeCode = (code: string | null) =>
    code &&
    /^(delivery_awaiting_reference|inbound_requires_triage|unsupported_event|provider_unreachable|delivery_failed|unsupported_or_expired_message|provider_rate_limited|provider_rejected_[45]\d\d)$/.test(
      code,
    )
      ? code
      : code
        ? "unclassified_error"
        : null;
  const [progress] = await db
    .select()
    .from(workerProgress)
    .where(eq(workerProgress.key, "queue-worker"));
  return {
    checkedAt: new Date().toISOString(),
    jobs,
    runs,
    spend: spend ?? { known: "0", reserved: "0" },
    provider: assistanceAvailability(),
    worker: workerHealth(progress, process.env.BUILD_SHA?.trim()),
    inbox: events.map((event) => ({
      ...event,
      provider: event.provider === "resend" ? "resend" : "other",
      eventType:
        /^email\.(sent|delivered|delivery_delayed|bounced|complained|failed|opened|clicked|received)$/.test(
          event.eventType,
        )
          ? event.eventType
          : "unsupported_event",
      code: safeCode(event.code),
    })),
    external: external.slice(0, 30).map((event) => ({ ...event, code: safeCode(event.code) })),
    externalNavigation: externalView
      ? { ...externalView, hasMore: externalView.kind === "queue" && external.length > 30 }
      : null,
  };
}
