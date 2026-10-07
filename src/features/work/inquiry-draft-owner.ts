import "server-only";
import type { Session } from "@/server/auth/sessions";
import { sha256Hex } from "@/server/crypto";

export function inquiryDraftOwner(session: Session) {
  return {
    id: sha256Hex(
      `${session.account.kind}:${session.account.id}:${session.actor.kind}:${session.actor.id}:${session.id}`,
    ),
    expiresAt: session.expiresAt.getTime(),
  };
}
