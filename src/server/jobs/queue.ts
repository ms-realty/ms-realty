// Background jobs on Postgres (AD11) through pg-boss, with typed job names and payloads. Jobs
// can be enqueued inside the caller's transaction so a rolled-back change enqueues nothing.
// Handlers must be idempotent: pg-boss delivers at least once.
import "server-only";
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import { databaseTransport } from "@/db/transport";
import type { PublicLocale } from "@/domain/ids";
import { issueEmailLink } from "../auth/email-link";
import type { Database, Executor } from "../db";
import { pruneRateLimits } from "../rate-limit";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { dispatchMessage, dispatchQueued } from "./outbox";
import type { MessageProvider } from "./provider";
import type { ReceivingProvider } from "./resend-receiving";

export interface JobPayloads {
  "auth.email_link": {
    email: string;
    returnTo: string | null;
    locale: PublicLocale;
  };
  "outbox.dispatch": { outboxId: string };
  "outbox.sweep": Record<string, never>;
  "rate_limit.prune": Record<string, never>;
  "files.process": { kind: "media" | "document"; id: string };
  "ai.draft": { runId: string };
  "inbox.reconcile": { afterId?: string };
  "worker.heartbeat": Record<string, never>;
  "search_alerts.sweep": { afterId?: string };
  "inquiry_notices.sweep": Record<string, never>;
}
export type JobName = keyof JobPayloads;

const queueOptions: Record<JobName, { retryLimit: number; retryDelay?: number; cron?: string }> = {
  "auth.email_link": { retryLimit: 3, retryDelay: 5 },
  // Dispatch is guarded by the outbox state machine; a retry only acts on still-queued rows.
  "outbox.dispatch": { retryLimit: 3, retryDelay: 30 },
  "outbox.sweep": { retryLimit: 0, cron: "* * * * *" },
  "rate_limit.prune": { retryLimit: 0, cron: "17 * * * *" },
  "files.process": { retryLimit: 3, retryDelay: 60 },
  "ai.draft": { retryLimit: 0 },
  "inbox.reconcile": { retryLimit: 0, cron: "* * * * *" },
  "worker.heartbeat": { retryLimit: 0, cron: "* * * * *" },
  "search_alerts.sweep": { retryLimit: 0, cron: "*/15 * * * *" },
  "inquiry_notices.sweep": { retryLimit: 0, cron: "* * * * *" },
};

export interface SendOptions {
  /** Enqueue inside this transaction (or connection) instead of pg-boss's own pool. */
  readonly db?: Executor;
  readonly singletonKey?: string;
  readonly startAfter?: Date;
}

export class JobQueue {
  readonly #boss: PgBoss;

  /**
   * `producer` only enqueues (the web process): no supervision or cron in that process. The
   * worker process omits it.
   */
  constructor(connectionString: string, options: { producer?: boolean } = {}) {
    this.#boss = new PgBoss({
      ...databaseTransport(connectionString).pgOptions,
      ...(options.producer ? { supervise: false, schedule: false } : {}),
    });
    this.#boss.on("error", (error) => console.error("[jobs]", error));
  }

  /** Installs or migrates the pg-boss schema and creates every queue. */
  async start(): Promise<void> {
    await this.#boss.start();
    for (const [name, options] of Object.entries(queueOptions)) {
      const { cron: _cron, ...queue } = options;
      await this.#boss.createQueue(name, queue);
    }
  }

  async stop(): Promise<void> {
    await this.#boss.stop({ graceful: true });
  }

  send<N extends JobName>(
    name: N,
    data: JobPayloads[N],
    options: SendOptions = {},
  ): Promise<string | null> {
    return this.#boss.send(name, data, {
      ...(options.db ? { db: fromDrizzle(options.db, sql) } : {}),
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
      ...(options.startAfter ? { startAfter: options.startAfter } : {}),
    });
  }

  async work<N extends JobName>(
    name: N,
    handler: (data: JobPayloads[N]) => Promise<void>,
    options: { pollingIntervalSeconds?: number } = {},
  ): Promise<void> {
    await this.#boss.work<JobPayloads[N]>(name, options, async (jobs) => {
      for (const job of jobs) await handler(job.data);
    });
  }

  /** Registers the recurring jobs (sweeps, pruning). */
  async scheduleRecurring(): Promise<void> {
    for (const [name, options] of Object.entries(queueOptions)) {
      if (options.cron) await this.#boss.schedule(name, options.cron);
    }
  }
}

export interface WorkerDependencies {
  readonly db: Database;
  readonly provider: MessageProvider;
  readonly receiving?: { provider: ReceivingProvider; replyDomain: string };
}

/** Wires every job name to its handler; the job worker process calls this once. */
export async function registerWorkers(queue: JobQueue, deps: WorkerDependencies): Promise<void> {
  await assertRecoveryOpen(deps.db);
  await queue.work("auth.email_link", async (job) => {
    await issueEmailLink(deps.db, job, { queue });
  });
  await queue.work("outbox.dispatch", async ({ outboxId }) => {
    await dispatchMessage(deps.db, deps.provider, outboxId);
  });
  await queue.work("outbox.sweep", async () => {
    await dispatchQueued(deps.db, deps.provider);
  });
  await queue.work("inquiry_notices.sweep", async () => {
    const { sweepInquiryCoverageNotices } = await import("../inquiries/notifications");
    await sweepInquiryCoverageNotices(deps.db, queue);
  });
  await queue.work("rate_limit.prune", async () => {
    await pruneRateLimits(deps.db);
  });
  await queue.work("files.process", async ({ kind, id }) => {
    const { processFileWorker } = await import("../files/process");
    const { fileServices } = await import("../files/config");
    await processFileWorker(
      deps.db,
      fileServices(),
      { kind: "system", id: "file-scanner" },
      kind,
      id,
    );
  });
  await queue.work("ai.draft", async ({ runId }) => {
    const { processAssistanceRun } = await import("../ai/assistance");
    await processAssistanceRun(deps.db, runId);
  });
  await queue.work("inbox.reconcile", async ({ afterId }) => {
    const { reconcileResendInbox } = await import("./resend-inbox");
    await reconcileResendInbox(deps.db);
    if (deps.receiving) {
      const { sweepInboundEmails } = await import("../inbound/service");
      const result = await sweepInboundEmails(
        deps.db,
        deps.receiving.provider,
        deps.receiving.replyDomain,
        afterId,
      );
      if (result.nextCursor)
        await queue.send(
          "inbox.reconcile",
          { afterId: result.nextCursor },
          { singletonKey: `inbound:${result.nextCursor}` },
        );
    }
  });
  await queue.work("worker.heartbeat", async () => {
    const { recordWorkerProgress } = await import("./heartbeat");
    await recordWorkerProgress(deps.db);
  });
  await queue.work("search_alerts.sweep", async ({ afterId }) => {
    const { sweepSearchAlerts } = await import("../subscriptions/alerts");
    const result = await sweepSearchAlerts(deps.db, deps.provider, { afterId });
    if (result.nextCursor)
      await queue.send(
        "search_alerts.sweep",
        { afterId: result.nextCursor },
        { singletonKey: `search-alerts:${result.nextCursor}` },
      );
  });
}
