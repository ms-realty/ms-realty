import "server-only";
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import {
  cases,
  listings,
  operations,
  personalSavedListings,
  savedSelectionTransfers,
} from "@/db/schema";
import { parseReference } from "@/domain/ids";
import type { PublicLocale } from "@/i18n/config";
import { publicLocales } from "@/i18n/config";
import { requireLiveSession, type Session } from "../auth/sessions";
import { caseVisibility } from "../cases/shared";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { loadCards } from "../publication/presentation";
import { enforceRateLimit } from "../rate-limit";
import { validShareCreatorSession } from "../shares/public";
import { parseInput } from "../work/shared";

export const savedTransferLifetime = 30 * 60_000;
const refs = z
  .array(
    z
      .string()
      .trim()
      .refine((value) => parseReference(value)?.kind === "listing")
      .transform((value) => value.toUpperCase()),
  )
  .min(1)
  .max(100)
  .refine((value) => new Set(value).size === value.length);
const transferInput = z
  .object({ references: refs, locale: z.enum(publicLocales), operationId: z.uuid() })
  .strict();
const nonceValid = (nonce: string) => /^[a-f0-9]{64}$/.test(nonce);
export const savedContinuationCookie = () =>
  getEnv().hosts.client.startsWith("https://") ? "__Host-msr_saved_transfer" : "msr_saved_transfer";
export async function createSavedTransfer(
  db: Executor,
  creatorToken: string,
  raw: z.input<typeof transferInput>,
  clientIp: string,
  now = new Date(),
) {
  const input = parseInput(transferInput, raw);
  if (!validShareCreatorSession(creatorToken)) throw new AppError("unauthenticated");
  const env = getEnv();
  const creatorSessionHash = keyedHash(env.authSecret, `saved-creator:${creatorToken}`);
  await enforceRateLimit(db, "public_share.ip", clientIp, { now });
  await enforceRateLimit(db, "public_share.creator", creatorSessionHash, { now });
  // Recover a lost response throughout its validity window, including an epoch boundary.
  // Expiry epochs prevent a pruned expired nonce being revived by an old logical key.
  // Only one-way capability hashes are stored.
  const epoch = Math.floor(now.getTime() / savedTransferLifetime);
  const candidates = [epoch - 1, epoch].map((value) =>
    keyedHash(env.authSecret, `saved-transfer:${creatorSessionHash}:${input.operationId}:${value}`),
  );
  const targetPath = `/${input.locale}/saved/handoff`;
  const prior = await db
    .select()
    .from(savedSelectionTransfers)
    .where(inArray(savedSelectionTransfers.nonceHash, candidates.map(sha256Hex)));
  const recoverable = candidates.find((candidate) =>
    prior.some((row) => row.nonceHash === sha256Hex(candidate) && row.expiresAt > now),
  );
  if (recoverable) {
    const row = prior.find((value) => value.nonceHash === sha256Hex(recoverable));
    if (
      !row ||
      hashRequest(row.listingReferences) !== hashRequest(input.references) ||
      row.targetPath !== targetPath ||
      row.sourceOrigin !== env.hosts.public ||
      row.targetOrigin !== env.hosts.client
    )
      throw new AppError("idempotency_key_reused");
    return { nonce: recoverable, target: `${env.hosts.client}${targetPath}` };
  }
  const nonce = candidates[1];
  if (!nonce) throw new AppError("unavailable");
  await db
    .delete(savedSelectionTransfers)
    .where(
      and(
        lt(savedSelectionTransfers.expiresAt, now),
        isNull(savedSelectionTransfers.consumedAt),
        eq(savedSelectionTransfers.creatorSessionHash, creatorSessionHash),
      ),
    );
  await db
    .insert(savedSelectionTransfers)
    .values({
      createdAt: now,
      nonceHash: sha256Hex(nonce),
      creatorSessionHash,
      sourceOrigin: env.hosts.public,
      targetOrigin: env.hosts.client,
      targetPath,
      listingReferences: input.references,
      expiresAt: new Date(now.getTime() + savedTransferLifetime),
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(savedSelectionTransfers)
    .where(eq(savedSelectionTransfers.nonceHash, sha256Hex(nonce)));
  if (
    !row ||
    row.expiresAt <= now ||
    hashRequest(row.listingReferences) !== hashRequest(input.references) ||
    row.targetPath !== targetPath
  )
    throw new AppError("idempotency_key_reused");
  return { nonce, target: `${env.hosts.client}${targetPath}` };
}

/** Only this narrow top-level POST accepts the public Origin; ordinary commands stay same-origin. */
export async function validateSavedHandoff(
  db: Executor,
  nonce: string,
  origin: string | null,
  target: string,
) {
  const env = getEnv();
  if (origin !== env.hosts.public || !nonceValid(nonce)) throw new AppError("not_found");
  const [row] = await db
    .select()
    .from(savedSelectionTransfers)
    .where(eq(savedSelectionTransfers.nonceHash, sha256Hex(nonce)));
  if (
    !row ||
    row.expiresAt <= new Date() ||
    row.sourceOrigin !== origin ||
    row.targetOrigin !== env.hosts.client ||
    `${row.targetOrigin}${row.targetPath}` !== target
  )
    throw new AppError("not_found");
  return { expiresAt: row.expiresAt };
}
async function eligibleClient(db: Executor, session: Session) {
  const live = await requireLiveSession(db, session);
  if (live.account.kind !== "client") throw new AppError("not_found");
  const [permitted] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(await caseVisibility(db, live))
    .limit(1);
  if (!permitted) throw new AppError("not_found");
  return live;
}
async function transferFor(db: Executor, nonce: string, principalId: string, lock = false) {
  if (!nonceValid(nonce)) throw new AppError("not_found");
  const query = db
    .select()
    .from(savedSelectionTransfers)
    .where(eq(savedSelectionTransfers.nonceHash, sha256Hex(nonce)));
  const [row] = await (lock ? query.for("update") : query);
  if (
    !row ||
    row.targetOrigin !== getEnv().hosts.client ||
    (row.consumedById && row.consumedById !== principalId) ||
    (!row.consumedAt && row.expiresAt <= new Date())
  )
    throw new AppError("not_found");
  return row;
}
export async function listPersonalSaves(db: Executor, session: Session, locale: PublicLocale) {
  const live = await eligibleClient(db, session);
  const rows = await db
    .select({ id: personalSavedListings.id, listingId: listings.id, reference: listings.reference })
    .from(personalSavedListings)
    .innerJoin(listings, eq(listings.id, personalSavedListings.listingId))
    .where(eq(personalSavedListings.principalId, live.account.id))
    .orderBy(asc(personalSavedListings.createdAt), asc(personalSavedListings.id))
    .limit(1001);
  if (rows.length > 1000) throw new AppError("unavailable");
  const cards = await loadCards(
    db,
    rows.map((row) => row.listingId),
    locale,
    new Date(),
  );
  return rows.map((row) => ({
    reference: row.reference,
    card: cards.find((card) => card.reference === row.reference) ?? null,
  }));
}
export async function reviewSavedTransfer(
  db: Executor,
  session: Session,
  nonce: string,
  locale: PublicLocale,
) {
  const live = await eligibleClient(db, session),
    transfer = await transferFor(db, nonce, live.account.id);
  const existing = await listPersonalSaves(db, live, locale);
  const selected = await db
    .select({ id: listings.id, reference: listings.reference })
    .from(listings)
    .where(inArray(listings.reference, transfer.listingReferences));
  const cards = await loadCards(
    db,
    selected.map((row) => row.id),
    locale,
    new Date(),
  );
  return {
    id: transfer.id,
    consumed: Boolean(transfer.consumedAt),
    items: transfer.listingReferences.map((reference) => ({
      reference,
      card:
        cards.find(
          (card) =>
            card.reference === reference && card.availability.primaryAction !== "view_similar",
        ) ?? null,
      existing: existing.some((row) => row.reference === reference),
    })),
  };
}
export async function confirmSavedTransfer(
  db: Executor,
  session: Session,
  nonce: string,
  operationId: string,
  locale: PublicLocale,
) {
  if (!z.uuid().safeParse(operationId).success) throw new AppError("validation_failed");
  const live = await eligibleClient(db, session),
    transfer = await transferFor(db, nonce, live.account.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "saved_selection.merge",
      idempotencyKey: operationId,
      requestHash: hashRequest({ id: transfer.id, principalId: live.account.id, locale }),
    },
    async (ctx) => {
      await eligibleClient(ctx.tx, live);
      const current = await transferFor(ctx.tx, nonce, live.account.id, true);
      if (current.consumedById) {
        const [previous] = await ctx.tx
          .select({ outcome: operations.outcome })
          .from(operations)
          .where(
            and(
              eq(operations.id, current.operationId as string),
              eq(operations.actorId, live.account.id),
              eq(operations.status, "succeeded"),
            ),
          );
        if (!previous) throw new AppError("outcome_unknown");
        return previous.outcome as { added: number; existing: number; unavailable: number };
      }
      const review = await reviewSavedTransfer(ctx.tx, live, nonce, locale);
      let added = 0,
        existing = 0,
        unavailable = 0;
      for (const item of review.items) {
        if (!item.card || item.card.availability.primaryAction === "view_similar") {
          unavailable++;
          continue;
        }
        const [listing] = await ctx.tx
          .select({ id: listings.id })
          .from(listings)
          .where(eq(listings.reference, item.reference))
          .for("share");
        if (!listing) {
          unavailable++;
          continue;
        }
        const [eligible] = await loadCards(ctx.tx, [listing.id], locale, new Date());
        if (!eligible || eligible.availability.primaryAction === "view_similar") {
          unavailable++;
          continue;
        }
        const inserted = await ctx.tx
          .insert(personalSavedListings)
          .values({ principalId: live.account.id, listingId: listing.id })
          .onConflictDoNothing()
          .returning({ id: personalSavedListings.id });
        if (inserted.length) added++;
        else existing++;
      }
      await ctx.tx
        .update(savedSelectionTransfers)
        .set({
          consumedAt: new Date(),
          consumedById: live.account.id,
          operationId: ctx.operationId,
        })
        .where(eq(savedSelectionTransfers.id, current.id));
      return { added, existing, unavailable };
    },
  );
}
