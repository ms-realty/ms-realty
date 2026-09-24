// Background jobs on Postgres (AD11) through pg-boss, with typed job names and payloads. Jobs
// can be enqueued inside the caller's transaction so a rolled-back change enqueues nothing.
// Handlers must be idempotent: pg-boss delivers at least once.
import "server-only";
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import type { PublicLocale } from "@/domain/ids";
import { issueEmailLink } from "../auth/email-link";
import type { AccountKind } from "../auth/sessions";
import type { Executor } from "../db";
import { pruneRateLimits } from "../rate-limit";
import { dispatchMessage, dispatchQueued } from "./outbox";
import type { MessageProvider } from "./provider";

export interface JobPayloads {
  "auth.email_link": {
    email: string;
    accountKind: AccountKind;
    returnTo: string | null;
    locale: PublicLocale;
  };
  "outbox.dispatch": { outboxId: string };
  "outbox.sweep": Record<string, never>;
  "rate_limit.prune": Record<string, never>;
}
export type JobName = keyof JobPayloads;

const queueOptions: Record<JobName, { retryLimit: number; retryDelay?: number; cron?: string }> = {
  "auth.email_link": { retryLimit: 3, retryDelay: 5 },
  // Dispatch is guarded by the outbox state machine; a retry only acts on still-queued rows.
  "outbox.dispatch": { retryLimit: 3, retryDelay: 30 },
  "outbox.sweep": { retryLimit: 0, cron: "* * * * *" },
  "rate_limit.prune": { retryLimit: 0, cron: "17 * * * *" },
};

export interface SendOptions {
  /** Enqueue inside this transaction (or connection) instead of pg-boss's own pool. */
  readonly db?: Executor;
  readonly singletonKey?: string;
  readonly startAfter?: Date;
}

export class JobQueue {
  readonly #boss: PgBoss;

  constructor(connectionString: string) {
    this.#boss = new PgBoss({ connectionString });
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
  readonly db: Executor;
  readonly provider: MessageProvider;
}

/** Wires every job name to its handler; the job worker process calls this once. */
export async function registerWorkers(queue: JobQueue, deps: WorkerDependencies): Promise<void> {
  await queue.work("auth.email_link", async (job) => {
    await issueEmailLink(deps.db, job, { queue });
  });
  await queue.work("outbox.dispatch", async ({ outboxId }) => {
    await dispatchMessage(deps.db, deps.provider, outboxId);
  });
  await queue.work("outbox.sweep", async () => {
    await dispatchQueued(deps.db, deps.provider);
  });
  await queue.work("rate_limit.prune", async () => {
    await pruneRateLimits(deps.db);
  });
}
