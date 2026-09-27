// Application errors (architecture §5.1): a stable code, a safe user message, field errors,
// retryability, the request's correlation id and what is known about the outcome. Internal
// detail never reaches the response. On the wire the code is the §5.1 standard name
// (VALIDATION_FAILED, NOT_AUTHORIZED, REVISION_CONFLICT, ...); codes §5.1 does not name are
// the internal code in upper case.
import "server-only";

/**
 * Whether the requested change happened: `not_applied` is safe to correct and resubmit,
 * `unknown` must be reconciled before any retry, `applied` means it already took effect.
 */
export type KnownOutcome = "not_applied" | "applied" | "unknown";

interface ErrorDefinition {
  /** The §5.1 standard code, where the error is one of them. */
  readonly standard?: string;
  readonly status: number;
  readonly message: string;
  readonly retryable: boolean;
  readonly outcome: KnownOutcome;
}

const definitions = {
  validation_failed: {
    standard: "VALIDATION_FAILED",
    status: 422,
    message: "Some details need attention.",
    retryable: false,
    outcome: "not_applied",
  },
  unauthenticated: {
    status: 401,
    message: "Please sign in to continue.",
    retryable: false,
    outcome: "not_applied",
  },
  step_up_required: {
    status: 401,
    message: "Please confirm it is you before this action.",
    retryable: false,
    outcome: "not_applied",
  },
  forbidden: {
    standard: "NOT_AUTHORIZED",
    status: 403,
    message: "You do not have permission for this action.",
    retryable: false,
    outcome: "not_applied",
  },
  // An unauthorized read of a private record uses this too, so existence is never revealed.
  not_found: {
    status: 404,
    message: "We could not find this item.",
    retryable: false,
    outcome: "not_applied",
  },
  cross_origin_request: {
    status: 403,
    message: "This request did not come from this site.",
    retryable: false,
    outcome: "not_applied",
  },
  version_conflict: {
    standard: "REVISION_CONFLICT",
    status: 409,
    message: "Someone else changed this in the meantime. Review the latest version.",
    retryable: false,
    outcome: "not_applied",
  },
  idempotency_key_reused: {
    status: 409,
    message: "This request conflicts with an earlier one. Start again from the current page.",
    retryable: false,
    outcome: "not_applied",
  },
  operation_pending: {
    status: 409,
    message: "This request is still being processed.",
    retryable: true,
    outcome: "unknown",
  },
  outcome_unknown: {
    standard: "OUTCOME_UNKNOWN",
    status: 409,
    message: "We could not confirm whether this went through. We are checking it.",
    retryable: false,
    outcome: "unknown",
  },
  approval_stale: {
    standard: "APPROVAL_STALE",
    status: 409,
    message: "The approval this step relies on no longer matches the current version.",
    retryable: false,
    outcome: "not_applied",
  },
  publication_ineligible: {
    standard: "PUBLICATION_INELIGIBLE",
    status: 422,
    message: "This listing cannot be published until its missing approvals are recorded.",
    retryable: false,
    outcome: "not_applied",
  },
  listing_unavailable: {
    standard: "LISTING_UNAVAILABLE",
    status: 409,
    message: "This listing is not currently offered.",
    retryable: false,
    outcome: "not_applied",
  },
  transition_denied: {
    status: 422,
    message: "This step is not available for the item in its current state.",
    retryable: false,
    outcome: "not_applied",
  },
  link_invalid: {
    status: 400,
    message: "This sign-in link is not valid. Request a new one.",
    retryable: false,
    outcome: "not_applied",
  },
  link_expired: {
    status: 410,
    message: "This sign-in link has expired. Request a new one.",
    retryable: false,
    outcome: "not_applied",
  },
  link_consumed: {
    status: 410,
    message: "This sign-in link was already used. Request a new one if you are not signed in.",
    retryable: false,
    outcome: "not_applied",
  },
  link_revoked: {
    status: 410,
    message: "This sign-in link was withdrawn. Request a new one.",
    retryable: false,
    outcome: "not_applied",
  },
  invitation_expired: {
    status: 410,
    message: "This invitation has expired. Ask the person who invited you for a new one.",
    retryable: false,
    outcome: "not_applied",
  },
  invitation_used: {
    status: 410,
    message: "This invitation was already answered.",
    retryable: false,
    outcome: "not_applied",
  },
  invitation_revoked: {
    status: 410,
    message: "This invitation is no longer valid. A newer one may have replaced it.",
    retryable: false,
    outcome: "not_applied",
  },
  passkey_failed: {
    status: 400,
    message: "We could not verify this passkey. Try again or use an email link.",
    retryable: false,
    outcome: "not_applied",
  },
  rate_limited: {
    standard: "RATE_LIMITED",
    status: 429,
    message: "Too many attempts. Please wait a moment and try again.",
    retryable: true,
    outcome: "not_applied",
  },
  unavailable: {
    standard: "DEPENDENCY_UNAVAILABLE",
    status: 503,
    message: "This service is temporarily unavailable. Please try again shortly.",
    retryable: true,
    outcome: "not_applied",
  },
  internal_error: {
    status: 500,
    message: "Something went wrong on our side.",
    retryable: true,
    outcome: "unknown",
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof definitions;

/** The code as it appears in responses. */
export function wireCode(code: ErrorCode): string {
  const definition: ErrorDefinition = definitions[code];
  return definition.standard ?? code.toUpperCase();
}

export interface ErrorBody {
  /** The §5.1 standard code (see wireCode). */
  readonly code: string;
  /** Safe English fallback; clients localize by the code. */
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly correlationId: string;
  readonly outcome: KnownOutcome;
  /** Present on version conflicts so the client can compare instead of overwriting. */
  readonly current?: unknown;
}

export interface AppErrorOptions {
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;
  readonly outcome?: KnownOutcome;
  readonly current?: unknown;
  /** Internal detail for logs only; never serialized into a response. */
  readonly detail?: string;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly outcome: KnownOutcome;
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly current: unknown;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.detail ?? code, { cause: options.cause });
    const definition: ErrorDefinition = definitions[code];
    this.name = "AppError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
    this.outcome = options.outcome ?? definition.outcome;
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.current = options.current;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** The safe response body for any thrown value; unknown errors become `internal_error`. */
export function toErrorBody(error: unknown, correlationId: string): ErrorBody {
  const appError = isAppError(error) ? error : new AppError("internal_error");
  return {
    code: wireCode(appError.code),
    message: definitions[appError.code].message,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
    retryable: appError.retryable,
    ...(appError.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: appError.retryAfterSeconds }
      : {}),
    correlationId,
    outcome: appError.outcome,
    ...(appError.current !== undefined ? { current: appError.current } : {}),
  };
}

export function errorStatus(error: unknown): number {
  return isAppError(error) ? error.status : 500;
}
