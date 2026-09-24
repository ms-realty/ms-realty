// Application errors (spec §19.2 "Error"): a stable code, a safe user message, field errors,
// retryability, the request's correlation id and what is known about the outcome. Internal
// detail never reaches the response.
import "server-only";

/**
 * Whether the requested change happened: `not_applied` is safe to correct and resubmit,
 * `unknown` must be reconciled before any retry, `applied` means it already took effect.
 */
export type KnownOutcome = "not_applied" | "applied" | "unknown";

interface ErrorDefinition {
  readonly status: number;
  readonly message: string;
  readonly retryable: boolean;
  readonly outcome: KnownOutcome;
}

const definitions = {
  validation_failed: {
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
    status: 409,
    message: "We could not confirm whether this went through. We are checking it.",
    retryable: false,
    outcome: "unknown",
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
  passkey_failed: {
    status: 400,
    message: "We could not verify this passkey. Try again or use an email link.",
    retryable: false,
    outcome: "not_applied",
  },
  rate_limited: {
    status: 429,
    message: "Too many attempts. Please wait a moment and try again.",
    retryable: true,
    outcome: "not_applied",
  },
  unavailable: {
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

export interface ErrorBody {
  readonly code: ErrorCode;
  /** Safe English fallback; clients localize by `errors.<code>`. */
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
    code: appError.code,
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
