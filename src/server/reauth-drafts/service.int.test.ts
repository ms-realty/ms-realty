import { randomUUID } from "node:crypto";
import { and, eq, sql as statement } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  emailSignInTokens,
  externalActions,
  listings,
  operations,
  proposalResponses,
  proposalRevisions,
  proposals,
  reauthDrafts,
  reauthEmailLineage,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  consumeEmailLink,
  type EmailLinkJob,
  inspectEmailLink,
  issueEmailLink,
  requestEmailLink,
} from "../auth/email-link";
import { createSession, readSession, revokeSession } from "../auth/sessions";
import { getEnv } from "../config/env";
import { sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { dispatchMessage } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import type { JobQueue } from "../jobs/queue";
import { recordProposalDecision } from "../proposals/service";
import {
  prepareProposalAgreement,
  proposalFixture,
  publishProposalForTest,
} from "../proposals/testing";
import { createClient } from "../testing";
import {
  deleteProposalReauthDraft,
  pruneReauthDrafts,
  type ReauthLineage,
  readProposalReauthDraft,
  reauthDraftTtlMs,
  reauthLineageForRequest,
  saveProposalReauthDraft,
} from "./service";

let t: TestDatabase;
let f: Awaited<ReturnType<typeof proposalFixture>>;
const host = getEnv().hosts.client;
const reason = "  Synthetic response\nPlease clarify the access arrangements.  ";
const path = () => `/en/proposals/${f.proposal.id}`;
const input = () => ({
  proposalId: f.proposal.id,
  revisionId: f.revision.id,
  expectedVersion: 3,
  state: "declined" as const,
  reason,
});
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Uninitialized test barrier");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
beforeEach(async () => {
  f = await proposalFixture(t.db);
  await prepareProposalAgreement(t.db, f);
  await publishProposalForTest(t.db, f);
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date(Date.now() - 16 * 60_000) })
    .where(eq(sessions.id, f.client.session.id));
}, 30_000);
async function save() {
  return saveProposalReauthDraft(t.db, f.client.session, host, input());
}
async function read(token: string, session = f.client.session, now?: Date) {
  return readProposalReauthDraft(t.db, session, host, f.proposal.id, token, now);
}
async function lineage(tokens: string[]) {
  return reauthLineageForRequest(t.db, f.client.session, host, path(), tokens);
}
async function issue(reauth?: ReauthLineage, email = f.client.email, now?: Date) {
  const jobs: EmailLinkJob[] = [];
  const queue: Pick<JobQueue, "send"> = {
    send: async (_name, data) => {
      jobs.push(data as EmailLinkJob);
      return null;
    },
  };
  await requestEmailLink(t.db, {
    email,
    returnTo: path(),
    clientIp: `synthetic-${randomUUID()}`,
    locale: "en",
    reauth,
    queue,
    now,
  });
  for (const job of jobs) await issueEmailLink(t.db, job, { now });
  const provider = new TestMessageProvider();
  for (const row of await t.db
    .select()
    .from(externalActions)
    .where(eq(externalActions.state, "queued")))
    await dispatchMessage(t.db, provider, row.id, now);
  const sent = provider.sent.find((message) => message.recipient === email);
  const token = new URL(String(sent?.secretParams?.url)).searchParams.get("token");
  if (!token) throw new Error("Synthetic email was not issued");
  return token;
}
async function effects() {
  const responses = await t.db
    .select()
    .from(proposalResponses)
    .where(eq(proposalResponses.revisionId, f.revision.id));
  const commands = await t.db
    .select()
    .from(operations)
    .where(
      and(eq(operations.actorId, f.client.id), eq(operations.operationType, "proposal.decide")),
    );
  return { responses: responses.length, operations: commands.length };
}
const confirm = (
  token: string,
  draft: string,
  currentSessionToken: string | undefined = f.client.token,
  now?: Date,
) => consumeEmailLink(t.db, token, { currentSessionToken, reauthDraftTokens: [draft], now });

function trackedTransaction<T>(marker: string, run: (tx: Executor) => Promise<T>) {
  const pid = deferred<number>();
  const result = t.db
    .transaction(async (tx) => {
      await tx.execute(statement`set local statement_timeout = '8s'`);
      await tx.execute(statement`select set_config('msr.reauth_lock_probe', ${marker}, true)`);
      const [row] = await tx.execute<{ pid: number }>(statement`select pg_backend_pid() as pid`);
      if (!row) throw new Error("Missing test backend");
      pid.resolve(row.pid);
      return run(tx);
    })
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
  return {
    result,
    pid: Promise.race([
      pid.promise,
      result.then(() => {
        throw new Error("Test transaction ended before publishing its backend");
      }),
    ]),
  };
}

function outcome(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return { status: "fulfilled" };
  const error = result.reason as { code?: string; cause?: { code?: string } };
  // Assertions report only codes, never driver messages or private SQL parameters.
  return { status: "rejected", code: error.code ?? null, causeCode: error.cause?.code ?? null };
}

async function blockedBy(pid: number, blocker: number) {
  await expect
    .poll(
      async () => {
        const [row] = await t.sql`select ${blocker} = any(pg_blocking_pids(${pid})) as blocked`;
        return row?.blocked;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
}

describe("R09 / C10 / UX S08 explicit proposal draft continuation", () => {
  it("saves only on explicit intent, restores after the same-browser challenge, and executes exactly once only on fresh submission", async () => {
    await expect(
      recordProposalDecision(t.db, f.client.session, {
        ...input(),
        id: f.proposal.id,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "step_up_required" });
    expect(
      await t.db.select().from(reauthDrafts).where(eq(reauthDrafts.sessionId, f.client.session.id)),
    ).toHaveLength(0);
    const saved = await save();
    expect(await read(saved.token)).toEqual({ status: "pending" });
    const token = await issue(await lineage([saved.token]));
    expect(await inspectEmailLink(t.db, token)).toMatchObject({ state: "valid" });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
    const issued = await confirm(token, saved.token);
    expect(await readSession(t.db, f.client.token)).toBeNull();
    expect(await read(saved.token, issued.session)).toEqual({
      status: "restored",
      values: { state: "declined", reason },
    });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
    const command = {
      id: f.proposal.id,
      revisionId: f.revision.id,
      expectedVersion: 3,
      state: "declined" as const,
      reason,
      operationId: randomUUID(),
    };
    await t.db.transaction(async (tx) => {
      await recordProposalDecision(tx, issued.session, command);
      await deleteProposalReauthDraft(tx, issued.session, f.proposal.id, saved.token);
    });
    expect(await effects()).toEqual({ responses: 1, operations: 1 });
    expect(
      await t.db
        .select()
        .from(reauthDrafts)
        .where(eq(reauthDrafts.tokenHash, sha256Hex(saved.token))),
    ).toHaveLength(0);
  });
  it("ordinary same-account links have no draft authority", async () => {
    const saved = await save();
    const token = await issue();
    const issued = await confirm(token, saved.token);
    expect(await read(saved.token, issued.session)).toEqual({ status: "unavailable" });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
  });
  it.each([
    "no_source_browser",
    "other_source_session",
    "switched_principal",
    "tampered_cookie",
  ] as const)("denies %s during confirmation", async (kind) => {
    const saved = await save();
    let email = f.client.email;
    if (kind === "switched_principal") email = (await createClient(t.db)).email;
    const token = await issue(await lineage([saved.token]), email);
    let currentSessionToken: string | undefined = f.client.token;
    if (kind === "no_source_browser") currentSessionToken = undefined;
    if (kind === "other_source_session")
      currentSessionToken = (await createSession(t.db, f.client.session.account)).token;
    const issued = await consumeEmailLink(t.db, token, {
      currentSessionToken,
      reauthDraftTokens: [kind === "tampered_cookie" ? "x".repeat(43) : saved.token],
    });
    expect(await read(saved.token, issued.session)).toEqual({ status: "unavailable" });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
  });
  it.each(["before_job", "before_confirm"] as const)(
    "does not revive a source session revoked %s",
    async (when) => {
      const saved = await save(),
        request = await lineage([saved.token]);
      if (when === "before_job") await revokeSession(t.db, f.client.token);
      const token = await issue(request);
      if (when === "before_confirm") await revokeSession(t.db, f.client.token);
      const issued = await confirm(token, saved.token);
      expect(await read(saved.token, issued.session)).toEqual({ status: "unavailable" });
      expect(await effects()).toEqual({ responses: 0, operations: 0 });
    },
  );
  it("expires a draft while a later email link can still authenticate normally", async () => {
    const saved = await save();
    const issuedAt = new Date(Date.now() + 5 * 60_000);
    const token = await issue(await lineage([saved.token]), f.client.email, issuedAt);
    const expired = new Date(saved.expiresAt);
    const issued = await confirm(token, saved.token, f.client.token, expired);
    expect(await read(saved.token, issued.session, expired)).toEqual({ status: "unavailable" });
    expect(
      await t.db
        .select()
        .from(reauthDrafts)
        .where(eq(reauthDrafts.tokenHash, sha256Hex(saved.token))),
    ).toHaveLength(0);
  });
  it.each(["version", "source", "host", "subject", "access"] as const)(
    "rechecks %s before revealing the restored body",
    async (kind) => {
      const saved = await save();
      const token = await issue(await lineage([saved.token]));
      const issued = await confirm(token, saved.token);
      if (kind === "version")
        await t.db.update(proposals).set({ version: 4 }).where(eq(proposals.id, f.proposal.id));
      if (kind === "source")
        await t.db
          .update(listings)
          .set({ approvedRevisionId: null })
          .where(eq(listings.id, f.listing.listingId));
      if (kind === "access") await revokeSession(t.db, issued.token);
      if (kind === "host")
        await expect(
          readProposalReauthDraft(
            t.db,
            issued.session,
            getEnv().hosts.staff,
            f.proposal.id,
            saved.token,
          ),
        ).rejects.toMatchObject({ code: "not_found" });
      else if (kind === "subject")
        expect(
          await readProposalReauthDraft(t.db, issued.session, host, randomUUID(), saved.token),
        ).toEqual({ status: "unavailable" });
      else expect(await read(saved.token, issued.session)).toEqual({ status: "unavailable" });
      expect(await effects()).toEqual({ responses: 0, operations: 0 });
    },
  );
  it("an old link and old successful-submit cleanup cannot claim or erase a later replacement", async () => {
    const first = await save();
    const token = await issue(await lineage([first.token]));
    const replacement = await saveProposalReauthDraft(t.db, f.client.session, host, {
      ...input(),
      reason: "New synthetic revision of the local response",
    });
    await deleteProposalReauthDraft(t.db, f.client.session, f.proposal.id, first.token);
    expect(
      await t.db
        .select()
        .from(reauthDrafts)
        .where(eq(reauthDrafts.tokenHash, sha256Hex(replacement.token))),
    ).toHaveLength(1);
    const issued = await confirm(token, replacement.token);
    expect(await read(replacement.token, issued.session)).toEqual({ status: "unavailable" });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
  });
  it("a rolled-back confirmation transfers no drafts and consumes no email token", async () => {
    const saved = await save(),
      token = await issue(await lineage([saved.token]));
    await expect(
      t.db.transaction(async (tx) => {
        await consumeEmailLink(tx, token, {
          currentSessionToken: f.client.token,
          reauthDraftTokens: [saved.token],
        });
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    expect(await inspectEmailLink(t.db, token)).toMatchObject({ state: "valid" });
    expect(await readSession(t.db, f.client.token)).not.toBeNull();
    expect(await read(saved.token)).toEqual({ status: "pending" });
  });

  it("maintenance cannot delete a valid draft during the atomic source-session rotation", async () => {
    const saved = await save(),
      token = await issue(await lineage([saved.token]));
    const rotated = deferred<void>(),
      release = deferred<void>();
    const confirmation = t.db.transaction(async (tx) => {
      const issued = await consumeEmailLink(tx, token, {
        currentSessionToken: f.client.token,
        reauthDraftTokens: [saved.token],
      });
      rotated.resolve();
      await release.promise;
      return issued;
    });
    await rotated.promise;
    try {
      await t.db.transaction(async (tx) => {
        await tx.execute(statement`set local statement_timeout = '2s'`);
        await pruneReauthDrafts(tx);
      });
    } finally {
      release.resolve();
    }
    const issued = await confirmation;
    await pruneReauthDrafts(t.db);
    expect(await read(saved.token, issued.session)).toEqual({
      status: "restored",
      values: { state: "declined", reason },
    });
    expect(await effects()).toEqual({ responses: 0, operations: 0 });
  });

  it("a prune blocked on an expired old row cannot erase its later replacement", async () => {
    const old = await save();
    const replaced = deferred<void>(),
      release = deferred<void>();
    const replacementTime = new Date(old.expiresAt.getTime() - reauthDraftTtlMs + 5_000);
    const replacement = t.db.transaction(async (tx) => {
      const fresh = await saveProposalReauthDraft(
        tx,
        f.client.session,
        host,
        { ...input(), reason: "Synthetic later replacement" },
        replacementTime,
      );
      replaced.resolve();
      await release.promise;
      return fresh;
    });
    await replaced.promise;
    const prunerPid = deferred<number>();
    const pruning = t.db.transaction(async (tx) => {
      await tx.execute(statement`set local statement_timeout = '5s'`);
      const rows = await tx.execute<{ pid: number }>(statement`select pg_backend_pid() as pid`);
      if (!rows[0]) throw new Error("Missing pruner backend");
      prunerPid.resolve(rows[0].pid);
      await pruneReauthDrafts(tx, old.expiresAt);
    });
    const pid = await prunerPid.promise;
    try {
      await expect
        .poll(async () => {
          const [row] = await t.sql`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`;
          return row?.blocked;
        })
        .toBe(true);
    } finally {
      release.resolve();
    }
    const fresh = await replacement;
    await pruning;
    const rows = await t.db
      .select()
      .from(reauthDrafts)
      .where(eq(reauthDrafts.tokenHash, sha256Hex(fresh.token)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("Synthetic later replacement");
  });
  it("bounds concurrent distinct proposals to four drafts and transfers only their exact cookie-bound identities", async () => {
    const [proposal] = await t.db.select().from(proposals).where(eq(proposals.id, f.proposal.id));
    const [revision] = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.id, f.revision.id));
    if (!proposal || !revision) throw new Error("Missing synthetic proposal");
    const inputs = [input()];
    for (let i = 0; i < 4; i++) {
      const proposalId = randomUUID(),
        revisionId = randomUUID();
      await t.db
        .insert(proposals)
        .values({ ...proposal, id: proposalId, reference: `SYNTHETIC-${randomUUID()}` });
      await t.db.insert(proposalRevisions).values({ ...revision, id: revisionId, proposalId });
      inputs.push({ ...input(), proposalId, revisionId, reason: `Synthetic draft ${i}` });
    }
    const results = await Promise.allSettled(
      inputs.map((draft) => saveProposalReauthDraft(t.db, f.client.session, host, draft)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const saved = results.flatMap((r, i) =>
      r.status === "fulfilled" ? [{ ...r.value, input: inputs[i] }] : [],
    );
    expect(saved[0]).toBeDefined();
    const request = await reauthLineageForRequest(
      t.db,
      f.client.session,
      host,
      `/en/proposals/${saved[0]?.input?.proposalId}`,
      saved.map((s) => s.token),
    );
    const token = await issue(request);
    const issued = await consumeEmailLink(t.db, token, {
      currentSessionToken: f.client.token,
      reauthDraftTokens: saved.slice(0, 2).map((s) => s.token),
    });
    for (const [index, draft] of saved.entries()) {
      if (!draft.input) throw new Error("Missing test draft");
      const restored = await readProposalReauthDraft(
        t.db,
        issued.session,
        host,
        draft.input.proposalId,
        draft.token,
      );
      expect(restored.status).toBe(index < 2 ? "restored" : "unavailable");
      if (restored.status === "restored") expect(restored.values.reason).toBe(draft.input.reason);
    }
  });
  it("rejects arbitrary snapshots and oversize text, and physically purges expired bodies and lineage", async () => {
    await expect(
      saveProposalReauthDraft(t.db, f.client.session, host, {
        ...input(),
        reason: "x".repeat(6001),
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      saveProposalReauthDraft(t.db, f.client.session, host, {
        ...input(),
        reviewed: true,
      } as ReturnType<typeof input>),
    ).rejects.toMatchObject({ code: "validation_failed" });
    const saved = await save();
    const token = await issue(await lineage([saved.token]));
    const [link] = await t.db
      .select()
      .from(emailSignInTokens)
      .where(eq(emailSignInTokens.tokenHash, sha256Hex(token)));
    await pruneReauthDrafts(t.db, new Date(Date.now() + reauthDraftTtlMs + 1000));
    expect(
      await t.db
        .select()
        .from(reauthDrafts)
        .where(eq(reauthDrafts.tokenHash, sha256Hex(saved.token))),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(reauthEmailLineage)
        .where(eq(reauthEmailLineage.tokenId, link?.id ?? randomUUID())),
    ).toHaveLength(0);
  });
});

describe("R09 / C10 draft and confirmation lock ordering", () => {
  beforeAll(async () => {
    // Native barriers pause the real functions after their own first locks. No test
    // caller pre-locks a session or imposes the lock order being verified.
    await t.sql.unsafe(`
      create function r09_reauth_lock_probe() returns trigger language plpgsql as $$
      begin
        if current_setting('msr.reauth_lock_probe', true) = TG_ARGV[0] then
          perform pg_advisory_xact_lock(90938);
        end if;
        return NEW;
      end $$;
      create trigger r09_save_barrier before insert on reauth_drafts
        for each row execute function r09_reauth_lock_probe('save');
      create trigger r09_confirm_barrier before insert or update on contact_methods
        for each row execute function r09_reauth_lock_probe('confirm');
    `);
  });

  it.each(["save", "confirm"] as const)(
    "serializes %s first without a deadlock or adopting a later replacement",
    async (first) => {
      const original = await save();
      const token = await issue(await lineage([original.token]));
      const replacementReason = "Synthetic later response with a different private body";
      const gate = await t.sql.reserve();
      const [controller] = await gate`select pg_backend_pid() as pid`;
      if (!controller) throw new Error("Missing barrier backend");
      await gate`select pg_advisory_lock(90938)`;
      const startSave = () =>
        trackedTransaction(first === "save" ? "save" : "", (tx) =>
          saveProposalReauthDraft(tx, f.client.session, host, {
            ...input(),
            reason: replacementReason,
          }),
        );
      const startConfirm = () =>
        trackedTransaction(first === "confirm" ? "confirm" : "", (tx) =>
          consumeEmailLink(tx, token, {
            currentSessionToken: f.client.token,
            reauthDraftTokens: [original.token],
          }),
        );
      let saving: ReturnType<typeof startSave> | undefined;
      let confirming: ReturnType<typeof startConfirm> | undefined;
      try {
        if (first === "save") {
          saving = startSave();
          const pid = await saving.pid;
          await blockedBy(pid, controller.pid);
          confirming = startConfirm();
          await blockedBy(await confirming.pid, pid);
        } else {
          confirming = startConfirm();
          const pid = await confirming.pid;
          await blockedBy(pid, controller.pid);
          saving = startSave();
          await blockedBy(await saving.pid, pid);
        }
      } finally {
        await gate`select pg_advisory_unlock(90938)`;
        gate.release();
      }
      if (!saving || !confirming) throw new Error("Missing concurrent test attempt");
      const [saved, confirmed] = await Promise.all([saving.result, confirming.result]);
      expect([outcome(saved), outcome(confirmed)]).toEqual([
        first === "save"
          ? { status: "fulfilled" }
          : { status: "rejected", code: "unauthenticated", causeCode: null },
        { status: "fulfilled" },
      ]);
      if (confirmed.status !== "fulfilled") throw new Error("Confirmation did not serialize");
      expect(await inspectEmailLink(t.db, token)).toMatchObject({ state: "consumed" });
      expect(await readSession(t.db, f.client.token)).toBeNull();
      const rows = await t.db
        .select()
        .from(reauthDrafts)
        .where(eq(reauthDrafts.proposalId, f.proposal.id));
      expect(rows).toHaveLength(1);
      if (first === "save") {
        if (saved.status !== "fulfilled") throw new Error("Replacement did not serialize");
        expect(rows[0]?.tokenHash === sha256Hex(saved.value.token)).toBe(true);
        expect(rows[0]?.reason === replacementReason).toBe(true);
        expect(rows[0]?.restoredAt).toBeNull();
        expect(rows[0]?.sessionId).toBe(f.client.session.id);
        expect(await read(saved.value.token, confirmed.value.session)).toEqual({
          status: "unavailable",
        });
        expect(await read(original.token, confirmed.value.session)).toEqual({
          status: "unavailable",
        });
      } else {
        expect(rows[0]?.tokenHash === sha256Hex(original.token)).toBe(true);
        expect(rows[0]?.reason === reason).toBe(true);
        expect(rows[0]?.sessionId).toBe(confirmed.value.session.id);
        expect(await read(original.token, confirmed.value.session)).toEqual({
          status: "restored",
          values: { state: "declined", reason },
        });
        if (saved.status === "rejected") {
          expect(String(saved.reason)).not.toContain(replacementReason);
          expect((saved.reason as Error).cause).toBeUndefined();
        }
      }
      expect(await effects()).toEqual({ responses: 0, operations: 0 });
    },
    30_000,
  );

  it.each(["principal", "revision", "source", "expiry"] as const)(
    "rechecks current %s authority after waiting for the principal lock",
    async (changed) => {
      const gate = await t.sql.reserve();
      await gate`begin`;
      let saving: ReturnType<typeof trackedTransaction> | undefined;
      try {
        const [controller] = await gate`select pg_backend_pid() as pid`;
        if (!controller) throw new Error("Missing authority-change backend");
        await gate`select id from principals where id = ${f.client.id} for update`;
        saving = trackedTransaction("", (tx) =>
          saveProposalReauthDraft(tx, f.client.session, host, input()),
        );
        await blockedBy(await saving.pid, controller.pid);
        if (changed === "principal")
          await gate`update principals set status = 'suspended' where id = ${f.client.id}`;
        else if (changed === "expiry")
          await gate`update sessions set expires_at = ${new Date().toISOString()} where id = ${f.client.session.id}`;
        else if (changed === "source")
          await gate`update listings set approved_revision_id = null where id = ${f.listing.listingId}`;
        else await gate`update proposals set version = version + 1 where id = ${f.proposal.id}`;
        await gate`commit`;
      } finally {
        await gate`rollback`;
        gate.release();
      }
      if (!saving) throw new Error("Missing authority-check attempt");
      const result = await saving.result;
      expect(outcome(result)).toEqual({
        status: "rejected",
        code: {
          principal: "unauthenticated",
          revision: "version_conflict",
          source: "transition_denied",
          expiry: "unauthenticated",
        }[changed],
        causeCode: null,
      });
      expect(
        await t.db
          .select({ id: reauthDrafts.id })
          .from(reauthDrafts)
          .where(eq(reauthDrafts.proposalId, f.proposal.id)),
      ).toHaveLength(0);
      expect(await effects()).toEqual({ responses: 0, operations: 0 });
    },
    30_000,
  );
});
