/** Serializable form/Server Action seam: architecture §5.1, §12; UX S11–S17 and §20.5. */
export type FormValues = Record<string, string>;
export type FieldErrors<V extends FormValues> = Partial<Record<keyof V, readonly string[]>>;
export type RecoveryLink = { href: string; label: string };

export type FormReceipt = {
  title: string;
  reference: string;
  recordedAt: { dateTime: string; label: string };
  nextStep: string;
  destination: RecoveryLink;
};

export type FormOutcome<V extends FormValues> =
  | { kind: "idle" }
  | { kind: "validation"; code: "VALIDATION_FAILED"; message: string; fieldErrors: FieldErrors<V> }
  | {
      kind: "rejected";
      code: string;
      message: string;
      /** True only when the server knows no effect occurred and this same key is retryable. */
      retryable: boolean;
      recovery?: RecoveryLink;
    }
  | {
      kind: "conflict";
      code: "REVISION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED";
      message: string;
      /** An explicitly authorized projection, never a raw internal record. */
      latest?: { revision: number; values: V };
      /** A new server-issued key for an explicit, reviewed intent; never an automatic retry. */
      reapply?: { operationId: string; expectedRevision: number; status: RecoveryLink };
      recovery?: RecoveryLink;
    }
  | { kind: "accepted"; message: string; status: RecoveryLink }
  | { kind: "confirmed"; receipt: FormReceipt }
  | { kind: "unknown"; code: "OUTCOME_UNKNOWN"; message: string; status: RecoveryLink };

export type FormState<V extends FormValues> = {
  operationId: string;
  expectedRevision: number | null;
  /** Status for this exact operation, including restored HTML responses and reviewed reapply. */
  reconciliation?: RecoveryLink;
  /** Safe, allowlisted drafts only: never passwords, files, credentials or private hidden fields. */
  values: V;
  /** Fresh per server response, including repeated identical errors, so focus recovers again. */
  responseId: string;
  outcome: FormOutcome<V>;
};

export type FormAction<V extends FormValues> = (
  previous: FormState<V>,
  data: FormData,
) => Promise<FormState<V>>;

export type FormCopy = {
  errorSummary: string;
  pending: string;
  reapply: string;
  yourValue: string;
  latestValue: string;
  revision: string;
  reference: string;
  recordedAt: string;
  unknown: string;
  draftRetained: string;
};

export const formFields = {
  operationId: "_operationId",
  expectedRevision: "_expectedRevision",
  intent: "_intent",
  reapplyOperationId: "_reapplyOperationId",
  reapplyRevision: "_reapplyRevision",
} as const;
