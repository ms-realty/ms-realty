// C10 / UX S08, §20.5: an explicit saved response, never a queued business command.
import "server-only";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { reauthDrafts, reauthEmailLineage, sessions } from "@/db/schema";
import { readSession, requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { readProposal } from "../proposals/queries";
import { proposalFor } from "../proposals/shared";

export const reauthDraftTtlMs = 15 * 60_000;
export const maxReauthDrafts = 4;
// Revoked-session cookies can linger until their TTL. They must not shadow four live drafts.
export const maxDraftCookieCandidates = 32;
export const draftTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export type ReauthLineage = { sourceSessionId: string; host: string; draftIds: string[] };
const inputSchema = z.strictObject({
  proposalId: z.uuid(),
  revisionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  state: z.enum(["declined", "agreed_for_next_step"]),
  reason: z.string().max(6000),
});

function clientHost(host: string) {
  if (host !== getEnv().hosts.client) throw new AppError("not_found");
}

/** TTL is an access limit. Physical deletion also runs in the existing maintenance job. */
export async function pruneReauthDrafts(db: Executor, now = new Date()) {
  await db
    .delete(reauthDrafts)
    .where(
      or(
        lte(reauthDrafts.expiresAt, now),
        sql`not exists (select 1 from ${sessions} s where s.id = ${reauthDrafts.sessionId} and s.revoked_at is null and s.expires_at > ${now.toISOString()}::timestamptz and s.last_seen_at > ${now.toISOString()}::timestamptz - interval '24 hours')`,
      ),
    );
  await db.delete(reauthEmailLineage).where(lte(reauthEmailLineage.expiresAt, now));
}

async function currentProposal(db: Executor, session: Session, proposalId: string) {
  const bound = await proposalFor(db, session, proposalId);
  const view = await readProposal(db, bound.live, proposalId);
  if (
    bound.live.account.kind !== "client" ||
    bound.row.disposition !== "active" ||
    !view.canRespond ||
    !view.source ||
    view.source.changed ||
    !view.revision.sourceListingRevisionId
  )
    throw new AppError("transition_denied");
  return { ...view, sourceRevisionId: view.revision.sourceListingRevisionId };
}

export async function saveProposalReauthDraft(
  db: Executor,
  session: Session,
  host: string,
  raw: z.input<typeof inputSchema>,
  now = new Date(),
) {
  clientHost(host);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success || Buffer.byteLength(parsed.data.reason, "utf8") > 24000)
    throw new AppError("validation_failed");
  const input = parsed.data;
  return db
    .transaction(async (tx) => {
      // Serializes replacement and the per-session cap, including concurrent browser tabs.
      await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, session.id))
        .for("update");
      const live = await requireLiveSession(tx, session, now);
      if (live.account.kind !== "client") throw new AppError("not_found");
      const view = await currentProposal(tx, live, input.proposalId);
      if (view.proposal.version !== input.expectedVersion || view.revision.id !== input.revisionId)
        throw new AppError("version_conflict");
      await pruneReauthDrafts(tx, now);
      await tx
        .delete(reauthDrafts)
        .where(
          and(eq(reauthDrafts.sessionId, live.id), eq(reauthDrafts.proposalId, input.proposalId)),
        );
      const pending = await tx
        .select({ id: reauthDrafts.id })
        .from(reauthDrafts)
        .where(eq(reauthDrafts.sessionId, live.id));
      if (pending.length >= maxReauthDrafts) throw new AppError("validation_failed");
      const token = randomToken();
      const expiresAt = new Date(now.getTime() + reauthDraftTtlMs);
      await tx.insert(reauthDrafts).values({
        ...input,
        tokenHash: sha256Hex(token),
        principalId: live.account.id,
        sessionId: live.id,
        host,
        command: "proposal.decide",
        sourceRevisionId: view.sourceRevisionId,
        createdAt: now,
        expiresAt,
      });
      return { token, expiresAt };
    })
    .catch((error: unknown) => {
      // Driver errors may contain SQL parameters, including the private reason. Never pass
      // them to the shared action logger or a worker error handler.
      if (isAppError(error)) throw error;
      throw new AppError("unavailable");
    });
}

export type RestoredProposalDraft =
  | { status: "absent" | "unavailable" | "pending" }
  | { status: "restored"; values: { state: string; reason: string } };

export async function readProposalReauthDraft(
  db: Executor,
  session: Session,
  host: string,
  proposalId: string,
  token: string | undefined,
  now = new Date(),
): Promise<RestoredProposalDraft> {
  if (!token) return { status: "absent" };
  clientHost(host);
  if (!draftTokenPattern.test(token)) return { status: "unavailable" };
  await pruneReauthDrafts(db, now);
  const [saved] = await db
    .select()
    .from(reauthDrafts)
    .where(
      and(
        eq(reauthDrafts.tokenHash, sha256Hex(token)),
        eq(reauthDrafts.principalId, session.account.id),
        eq(reauthDrafts.sessionId, session.id),
        eq(reauthDrafts.host, host),
        eq(reauthDrafts.command, "proposal.decide"),
        eq(reauthDrafts.proposalId, proposalId),
        gt(reauthDrafts.expiresAt, now),
      ),
    );
  if (!saved) return { status: "unavailable" };
  try {
    const live = await requireLiveSession(db, session, now);
    const view = await currentProposal(db, live, proposalId);
    if (
      view.revision.id !== saved.revisionId ||
      view.proposal.version !== saved.expectedVersion ||
      view.revision.sourceListingRevisionId !== saved.sourceRevisionId
    )
      throw new AppError("version_conflict");
    try {
      requireFreshAuth(live, now);
    } catch (error) {
      if (isAppError(error) && error.code === "step_up_required") return { status: "pending" };
      throw error;
    }
    if (!saved.restoredAt) return { status: "pending" };
    return { status: "restored", values: { state: saved.state, reason: saved.reason } };
  } catch (error) {
    if (!isAppError(error)) throw error;
    // The draft is no longer valid for its original review/access scope; erase its body.
    await db.delete(reauthDrafts).where(eq(reauthDrafts.id, saved.id));
    return { status: "unavailable" };
  }
}

/** Only an explicit reauth request from the source browser can put lineage in the job. */
export async function reauthLineageForRequest(
  db: Executor,
  session: Session,
  host: string,
  returnTo: string,
  tokens: readonly string[],
  now = new Date(),
): Promise<ReauthLineage | undefined> {
  clientHost(host);
  const live = await requireLiveSession(db, session, now);
  const hashes = tokens
    .filter((token) => draftTokenPattern.test(token))
    .slice(0, maxDraftCookieCandidates)
    .map(sha256Hex);
  if (!hashes.length || live.account.kind !== "client") return undefined;
  const rows = await db
    .select({ id: reauthDrafts.id, proposalId: reauthDrafts.proposalId })
    .from(reauthDrafts)
    .where(
      and(
        eq(reauthDrafts.sessionId, live.id),
        eq(reauthDrafts.principalId, live.account.id),
        eq(reauthDrafts.host, host),
        inArray(reauthDrafts.tokenHash, hashes),
        gt(reauthDrafts.expiresAt, now),
      ),
    );
  return rows.some(
    (row) =>
      /^\/[a-z]{2}\/proposals\/[a-f0-9-]{36}$/.test(returnTo) &&
      returnTo.endsWith(`/proposals/${row.proposalId}`),
  )
    ? { sourceSessionId: live.id, host, draftIds: rows.map((row) => row.id) }
    : undefined;
}

/** The optional metadata never changes whether an ordinary sign-in token is issued. */
export async function bindReauthEmailLineage(
  db: Executor,
  tokenId: string,
  principalId: string,
  lineage: ReauthLineage | undefined,
  now: Date,
) {
  if (
    !lineage ||
    lineage.host !== getEnv().hosts.client ||
    !z.uuid().safeParse(lineage.sourceSessionId).success ||
    !z.array(z.uuid()).min(1).max(maxReauthDrafts).safeParse(lineage.draftIds).success
  )
    return;
  const [source] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, lineage.sourceSessionId),
        eq(sessions.principalKind, "client"),
        eq(sessions.principalId, principalId),
      ),
    );
  if (!source) return;
  try {
    await requireLiveSession(
      db,
      {
        ...source,
        account: { kind: "client", id: principalId },
        actor: { kind: "client", id: principalId },
      },
      now,
    );
  } catch (error) {
    if (isAppError(error)) return;
    throw error;
  }
  await db.insert(reauthEmailLineage).values({
    tokenId,
    sourceSessionId: source.id,
    host: lineage.host,
    draftIds: lineage.draftIds,
    expiresAt: new Date(now.getTime() + reauthDraftTtlMs),
  });
}

/** Called inside token consumption, before it revokes the old session. Locks the source. */
export async function prepareReauthDraftTransfer(
  db: Executor,
  tokenId: string,
  principalId: string,
  currentSessionToken: string | undefined,
  tokens: readonly string[] = [],
  now = new Date(),
): Promise<string[]> {
  if (!currentSessionToken) return [];
  const hashes = tokens
    .filter((token) => draftTokenPattern.test(token))
    .slice(0, maxDraftCookieCandidates)
    .map(sha256Hex);
  if (!hashes.length) return [];
  const [lineage] = await db
    .select()
    .from(reauthEmailLineage)
    .where(
      and(
        eq(reauthEmailLineage.tokenId, tokenId),
        eq(reauthEmailLineage.host, getEnv().hosts.client),
        gt(reauthEmailLineage.expiresAt, now),
      ),
    );
  if (
    !lineage ||
    !z.array(z.uuid()).min(1).max(maxReauthDrafts).safeParse(lineage.draftIds).success
  )
    return [];
  await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, lineage.sourceSessionId))
    .for("update");
  const live = await readSession(db, currentSessionToken, now);
  if (
    !live ||
    live.id !== lineage.sourceSessionId ||
    live.account.kind !== "client" ||
    live.account.id !== principalId
  )
    return [];
  const rows = await db
    .select({ id: reauthDrafts.id })
    .from(reauthDrafts)
    .where(
      and(
        eq(reauthDrafts.sessionId, live.id),
        eq(reauthDrafts.principalId, principalId),
        eq(reauthDrafts.host, lineage.host),
        eq(reauthDrafts.command, "proposal.decide"),
        inArray(reauthDrafts.id, lineage.draftIds),
        inArray(reauthDrafts.tokenHash, hashes),
        gt(reauthDrafts.expiresAt, now),
      ),
    )
    .for("update");
  return rows.map((row) => row.id);
}

/** In the same transaction as token consumption/session rotation; never dispatches a command. */
export async function completeReauthDraftTransfer(
  db: Executor,
  ids: readonly string[],
  session: Session,
  now: Date,
) {
  if (ids.length)
    await db
      .update(reauthDrafts)
      .set({ sessionId: session.id, restoredAt: now })
      .where(
        and(
          inArray(reauthDrafts.id, [...ids]),
          eq(reauthDrafts.principalId, session.account.id),
          gt(reauthDrafts.expiresAt, now),
        ),
      );
}

export async function deleteProposalReauthDraft(
  db: Executor,
  session: Session,
  proposalId: string,
  token: string | undefined,
) {
  if (!token || !draftTokenPattern.test(token)) return;
  await db
    .delete(reauthDrafts)
    .where(
      and(
        eq(reauthDrafts.principalId, session.account.id),
        eq(reauthDrafts.sessionId, session.id),
        eq(reauthDrafts.proposalId, proposalId),
        eq(reauthDrafts.tokenHash, sha256Hex(token)),
      ),
    );
}
