// P09 public-facts shares. A viewing token grants no Case or creator authority.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { publicShares } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { parseReference, publicLocales } from "@/domain/ids";
import { recordAudit } from "../audit";
import { type CookieOptions, serializeCookie } from "../auth/cookies";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { getEnv, type ServerEnv } from "../config/env";
import { hashRequest, keyedHash, randomToken, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { loadPublishedListings, presentationOf, toCard } from "../publication/presentation";
import { enforceRateLimit } from "../rate-limit";
import { parseInput } from "../work/shared";

const dayMs = 86_400_000;
const shareLifetimeMs = 7 * dayMs;
const creatorCookieLifetimeMs = 30 * dayMs;
const creatorTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const viewTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** A separate host-only capability for anonymous share management, never a viewing token. */
export function shareCreatorCookieName(env: ServerEnv): string {
  return env.hosts.public.startsWith("https://") ? "__Host-msr_share_creator" : "msr_share_creator";
}

export function newShareCreatorSession(): string {
  return randomToken();
}

export function validShareCreatorSession(value: string | undefined): string | null {
  return value && creatorTokenPattern.test(value) ? value : null;
}

export function shareCreatorSetCookie(env: ServerEnv, token: string, now = new Date()): string {
  if (!validShareCreatorSession(token)) throw new Error("Invalid share creator session");
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.hosts.public.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(now.getTime() + creatorCookieLifetimeMs),
  };
  return serializeCookie(shareCreatorCookieName(env), token, options);
}

export type ShareCreator =
  | { readonly kind: "anonymous"; readonly sessionToken: string }
  | { readonly kind: "account"; readonly session: Session };

type Scope =
  | { readonly kind: "anonymous"; readonly hash: string; readonly actor: Actor }
  | { readonly kind: "account"; readonly principalId: string; readonly actor: Actor };

async function creatorScope(db: Executor, creator: ShareCreator, now = new Date()): Promise<Scope> {
  if (creator.kind === "anonymous") {
    if (!validShareCreatorSession(creator.sessionToken)) throw new AppError("unauthenticated");
    const hash = keyedHash(getEnv().authSecret, `public-share-creator:${creator.sessionToken}`);
    return { kind: "anonymous", hash, actor: { kind: "visitor", id: hash } };
  }
  const live = await requireLiveSession(db, creator.session, now);
  if (live.account.kind !== "client") throw new AppError("not_found");
  return { kind: "account", principalId: live.account.id, actor: live.actor };
}

const ownedBy = (scope: Scope) =>
  scope.kind === "anonymous"
    ? eq(publicShares.creatorSessionHash, scope.hash)
    : eq(publicShares.creatorPrincipalId, scope.principalId);

const referenceSchema = z
  .string()
  .trim()
  .refine((value) => parseReference(value)?.kind === "listing", "invalid_listing_reference")
  .transform((value) => value.toUpperCase());
const createSchema = z
  .object({
    operationId: z.uuid(),
    locale: z.enum(publicLocales),
    references: z.array(referenceSchema).min(1).max(12),
    reviewed: z.literal(true),
  })
  .strict()
  .refine((value) => new Set(value.references).size === value.references.length, {
    path: ["references"],
    message: "duplicate_listing_reference",
  });
const revokeSchema = z.object({ id: z.uuid(), operationId: z.uuid() }).strict();
const listSchema = z
  .object({
    pageSize: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(256).optional(),
  })
  .strict();

/** Public list ownership is a cookie or a live authenticated principal, never the view token. */
export async function createPublicShare(
  db: Executor,
  creator: ShareCreator,
  raw: z.input<typeof createSchema>,
  options: { readonly clientIp: string },
) {
  const input = parseInput(createSchema, raw);
  const scope = await creatorScope(db, creator);
  const operation = await runOperation(
    db,
    {
      actor: scope.actor,
      type: "public_share.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async ({ tx, operationId }) => {
      await creatorScope(tx, creator);
      const now = new Date();
      await enforceRateLimit(tx, "public_share.ip", options.clientIp, { now });
      await enforceRateLimit(tx, "public_share.creator", `${scope.actor.kind}:${scope.actor.id}`, {
        now,
      });
      const published = await loadPublishedListings(
        tx,
        { references: input.references },
        input.locale,
      );
      if (
        published.length !== input.references.length ||
        published.some((listing) => presentationOf(listing, now).primaryAction === "view_similar")
      )
        throw new AppError("validation_failed", {
          fieldErrors: { references: ["selection_unavailable"] },
        });
      const id = randomUUID();
      const token = randomToken();
      await tx.insert(publicShares).values({
        id,
        tokenHash: sha256Hex(token),
        viewToken: token,
        listingReferences: input.references,
        ...(scope.kind === "anonymous"
          ? { creatorSessionHash: scope.hash }
          : { creatorPrincipalId: scope.principalId }),
        createdAt: now,
        expiresAt: new Date(now.getTime() + shareLifetimeMs),
      });
      await recordAudit(tx, {
        action: "public_share.create",
        actor: scope.actor,
        recordType: "public_share",
        recordId: id,
        operationId,
        payload: { count: input.references.length, locale: input.locale },
      });
      return { id };
    },
  );
  const share = await readCreatorShare(db, creator, operation.outcome.id);
  return { operationId: operation.operationId, replayed: operation.replayed, share };
}

function creatorView(row: typeof publicShares.$inferSelect, now: Date) {
  if (!row.viewToken) throw new Error("Managed share has no viewing token");
  return {
    id: row.id,
    token: row.viewToken,
    references: row.listingReferences,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status: row.revokedAt
      ? "revoked"
      : !row.expiresAt || row.expiresAt <= now
        ? "expired"
        : "active",
  };
}

export async function readCreatorShare(
  db: Executor,
  creator: ShareCreator,
  id: string,
  now = new Date(),
) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const scope = await creatorScope(db, creator, now);
  const [row] = await db
    .select()
    .from(publicShares)
    .where(and(eq(publicShares.id, id), ownedBy(scope)));
  if (!row?.viewToken) throw new AppError("not_found");
  return creatorView(row, now);
}

function decodeCursor(value: string | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = z
      .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
      .safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (parsed.success) return { createdAt: new Date(parsed.data.at), id: parsed.data.id };
  } catch {
    // Malformed cursors are validation errors, not a fresh first page.
  }
  throw new AppError("validation_failed", { fieldErrors: { cursor: ["invalid"] } });
}

export async function listCreatorShares(
  db: Executor,
  creator: ShareCreator,
  raw: z.input<typeof listSchema> = {},
  now = new Date(),
) {
  const input = parseInput(listSchema, raw);
  const scope = await creatorScope(db, creator, now);
  const before = decodeCursor(input.cursor);
  const rows = await db
    .select()
    .from(publicShares)
    .where(
      and(
        ownedBy(scope),
        before
          ? or(
              lt(publicShares.createdAt, before.createdAt),
              and(eq(publicShares.createdAt, before.createdAt), lt(publicShares.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(publicShares.createdAt), desc(publicShares.id))
    .limit(input.pageSize + 1);
  const page = rows.slice(0, input.pageSize);
  const last = page.at(-1);
  return {
    items: page.map((row) => creatorView(row, now)),
    nextCursor:
      rows.length > input.pageSize && last
        ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString(
            "base64url",
          )
        : null,
  };
}

/** Recipient reads only cards made from the current approved public projection. */
export async function readPublicShare(
  db: Executor,
  token: string,
  locale: (typeof publicLocales)[number],
  now = new Date(),
) {
  if (!viewTokenPattern.test(token) || !z.enum(publicLocales).safeParse(locale).success)
    return { status: "unavailable" as const };
  const [row] = await db
    .select()
    .from(publicShares)
    .where(eq(publicShares.tokenHash, sha256Hex(token)));
  if (!row || row.viewToken !== token) return { status: "unavailable" as const };
  if (row.revokedAt) return { status: "revoked" as const };
  if (!row.expiresAt || row.expiresAt <= now) return { status: "expired" as const };
  const published = await loadPublishedListings(db, { references: row.listingReferences }, locale);
  const byReference = new Map(
    published
      .filter((listing) => presentationOf(listing, now).primaryAction !== "view_similar")
      .map((listing) => [listing.reference, listing]),
  );
  return {
    status: "ready" as const,
    expiresAt: row.expiresAt.toISOString(),
    items: row.listingReferences.map((reference) => {
      const listing = byReference.get(reference);
      return listing
        ? { status: "public" as const, reference, card: toCard(listing, now) }
        : { status: "unavailable" as const, reference };
    }),
  };
}

export async function revokePublicShare(
  db: Executor,
  creator: ShareCreator,
  raw: z.input<typeof revokeSchema>,
) {
  const input = parseInput(revokeSchema, raw);
  const scope = await creatorScope(db, creator);
  return runOperation(
    db,
    {
      actor: scope.actor,
      type: "public_share.revoke",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      subject: { type: "public_share", id: input.id },
    },
    async ({ tx, operationId }) => {
      await creatorScope(tx, creator);
      const [row] = await tx
        .select()
        .from(publicShares)
        .where(and(eq(publicShares.id, input.id), ownedBy(scope)))
        .for("update");
      if (!row) throw new AppError("not_found");
      const revokedAt = row.revokedAt ?? new Date();
      if (!row.revokedAt) {
        await tx.update(publicShares).set({ revokedAt }).where(eq(publicShares.id, row.id));
        await recordAudit(tx, {
          action: "public_share.revoke",
          actor: scope.actor,
          recordType: "public_share",
          recordId: row.id,
          operationId,
        });
      }
      return { id: row.id, revokedAt: revokedAt.toISOString() };
    },
  );
}

/** Urgent abuse response is audited and requires a recently verified privacy operator. */
export async function revokePublicShareAsOperator(
  db: Executor,
  session: Session,
  raw: z.input<typeof revokeSchema>,
) {
  const input = parseInput(revokeSchema, raw);
  const live = await requireLiveSession(db, session);
  if (live.account.kind !== "staff") throw new AppError("not_found");
  requireFreshAuth(live);
  await assertCan(db, live.actor, "privacy.manage");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "public_share.operator_revoke",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      subject: { type: "public_share", id: input.id },
    },
    async ({ tx, operationId }) => {
      const current = await requireLiveSession(tx, session);
      requireFreshAuth(current);
      await assertCan(tx, current.actor, "privacy.manage");
      const [row] = await tx
        .select()
        .from(publicShares)
        .where(eq(publicShares.id, input.id))
        .for("update");
      if (!row) throw new AppError("not_found");
      const revokedAt = row.revokedAt ?? new Date();
      if (!row.revokedAt) {
        await tx.update(publicShares).set({ revokedAt }).where(eq(publicShares.id, row.id));
        await recordAudit(tx, {
          action: "public_share.operator_revoke",
          actor: current.actor,
          capability: "privacy.manage",
          recordType: "public_share",
          recordId: row.id,
          operationId,
        });
      }
      return { id: row.id, revokedAt: revokedAt.toISOString() };
    },
  );
}
