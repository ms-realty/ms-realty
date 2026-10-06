// P08/P09 server helpers shared by the saved page and its actions. The creator cookie, the
// viewing token and the share row stay on the server; callers get views and outcome codes.
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { PublicLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { isAppError } from "@/server/errors";
import {
  listCreatorShares,
  shareCreatorCookieName,
  validShareCreatorSession,
} from "@/server/shares/public";
import { type CreatorLinks, sharedLinkView } from "./share-model";
import type { ShareCreateOutcome, ShareRevokeOutcome } from "./share-state";

/** The anonymous creator capability held by this browser, or null. Never a viewing token. */
export function shareCreatorFrom(jar: {
  get(name: string): { value: string } | undefined;
}): string | null {
  return validShareCreatorSession(jar.get(shareCreatorCookieName(getEnv()))?.value);
}

/** One page of this browser's links, newest first. A failed read is a state, not a crash. */
export async function loadCreatorLinks(
  sessionToken: string,
  locale: PublicLocale,
  now = new Date(),
): Promise<CreatorLinks> {
  try {
    const { items } = await listCreatorShares(
      getDb(),
      { kind: "anonymous", sessionToken },
      { pageSize: 20 },
      now,
    );
    const origin = getEnv().hosts.public;
    return {
      status: "ok",
      links: items.map((item) =>
        sharedLinkView(item, { locale, origin, now, revokeKey: randomUUID() }),
      ),
    };
  } catch (error) {
    // Name the failure class only: share rows, tokens and cookies never reach a log line.
    console.error("[P08] shared links unavailable:", isAppError(error) ? error.code : typeof error);
    return { status: "failed" };
  }
}

/**
 * What a failed creation means for the person and for the idempotency key. A definite failure
 * is stored under its key by the operation ledger, so the next attempt needs a new key; an
 * unknown outcome keeps the key so the retry replays the same request.
 */
export function createFailure(error: unknown): { outcome: ShareCreateOutcome; rotate: boolean } {
  if (isAppError(error)) {
    switch (error.code) {
      case "unauthenticated":
        return { outcome: { kind: "rejected", code: "session_required" }, rotate: false };
      // Retryable errors roll the whole operation back, so the same key is still unused.
      case "rate_limited":
        return { outcome: { kind: "rejected", code: "rate_limited" }, rotate: false };
      case "unavailable":
        return { outcome: { kind: "rejected", code: "failed" }, rotate: false };
      case "operation_pending":
      case "outcome_unknown":
      case "internal_error":
        return { outcome: { kind: "unknown" }, rotate: false };
      case "validation_failed":
        return {
          outcome: {
            kind: "rejected",
            code: error.fieldErrors?.references?.includes("selection_unavailable")
              ? "selection_unavailable"
              : "failed",
          },
          rotate: true,
        };
      default:
        return { outcome: { kind: "rejected", code: "failed" }, rotate: true };
    }
  }
  // A thrown non-application error may have followed a commit: only a replay can tell.
  return { outcome: { kind: "unknown" }, rotate: false };
}

export function revokeFailure(error: unknown): { outcome: ShareRevokeOutcome; rotate: boolean } {
  if (isAppError(error)) {
    switch (error.code) {
      case "operation_pending":
      case "outcome_unknown":
      case "internal_error":
        return { outcome: { kind: "unknown" }, rotate: false };
      case "unavailable":
        return { outcome: { kind: "rejected", code: "failed" }, rotate: false };
      case "not_found":
      case "unauthenticated":
        return { outcome: { kind: "rejected", code: "not_manageable" }, rotate: true };
      default:
        return { outcome: { kind: "rejected", code: "failed" }, rotate: true };
    }
  }
  return { outcome: { kind: "unknown" }, rotate: false };
}
