// P08/X11 action state. Server actions return codes, never prose: the client words them in the
// page's locale, and nothing here carries a viewing token, a creator session or a private note.
import type { Moment } from "./share-model";

export type ShareCreateOutcome =
  | { kind: "idle" }
  | { kind: "created"; id: string }
  /** Nothing was sent to the server: the review is incomplete. */
  | { kind: "invalid"; fields: readonly ("reviewed" | "references")[] }
  /** The server knows no link was created. */
  | {
      kind: "rejected";
      code: "session_required" | "selection_unavailable" | "rate_limited" | "failed";
    }
  /** The server cannot say. Retrying with the same key replays the request, never doubles it. */
  | { kind: "unknown" };

export type ShareCreateState = { operationId: string; outcome: ShareCreateOutcome };

export type ShareRevokeOutcome =
  | { kind: "idle" }
  | { kind: "revoked"; revokedAt: Moment }
  | { kind: "rejected"; code: "not_manageable" | "failed" }
  | { kind: "unknown" };

export type ShareRevokeState = { operationId: string; outcome: ShareRevokeOutcome };

export type CreateShareAction = (
  previous: ShareCreateState,
  data: FormData,
) => Promise<ShareCreateState>;
export type RevokeShareAction = (
  previous: ShareRevokeState,
  data: FormData,
) => Promise<ShareRevokeState>;

/** Form field names read by the actions; the operation key reuses the shared form contract. */
export const shareFields = {
  reference: "reference",
  reviewed: "reviewed",
  shareId: "shareId",
} as const;
