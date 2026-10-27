"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  type PolicyFormValues,
  policyFormFields,
  policyFromValues,
} from "@/domain/operating-policy-form";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import type { PolicyApprovalValues } from "@/features/operating-policy/forms";
import type {
  PolicyDraftState,
  PolicyDraftValues,
} from "@/features/operating-policy/owner-directory-state";
import { isStaffLocale, type StaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  approveOperatingPolicy,
  listOperatingPolicyOwners,
  readOperatingPolicyOperation,
  readOperatingPolicyOwnerChoices,
  saveOperatingPolicy,
} from "@/server/operating-policy/service";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { readFormEnvelope, readFormValues } from "@/ui/form/server";

function stateFor<V extends FormValues>(
  locale: StaffLocale,
  command: "save" | "approve",
  data: FormData,
  values: V,
) {
  const envelope = readFormEnvelope(data, `operating_policy.${command}`),
    key = envelope?.operationId ?? "invalid";
  const status = {
    href: `/${locale}/settings/operating-policy/operations/${command}/${encodeURIComponent(key)}`,
    label: operatingPolicyCopy(locale).check,
  };
  const state: FormState<V> = {
    operationId: key,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  return { envelope, status, state };
}
async function execute<V extends FormValues>(
  locale: StaffLocale,
  command: "save" | "approve",
  data: FormData,
  values: V,
  document?: ReturnType<typeof policyFromValues>,
): Promise<FormState<V>> {
  const copy = operatingPolicyCopy(locale),
    { envelope, state, status } = stateFor(locale, command, data, values),
    path = `/${locale}/settings/operating-policy`;
  if (!envelope?.expectedRevision)
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "VALIDATION_FAILED",
        message: copy.invalid,
        retryable: false,
        recovery: { href: path, label: copy.reload },
      },
    };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const common = {
        operationId: envelope.operationId,
        expectedVersion: envelope.expectedRevision as number,
      };
      const done =
        command === "save" && document
          ? await saveOperatingPolicy(db, access.session, { ...common, document })
          : await approveOperatingPolicy(db, access.session, {
              ...common,
              expectedHash: values.expectedHash ?? "",
              note: values.note ?? "",
              reviewed: (values.reviewed === "yes") as true,
            });
      const receipt = await readOperatingPolicyOperation(
        db,
        access.session,
        command,
        envelope.operationId,
      );
      if (receipt?.status !== "succeeded") throw new AppError("outcome_unknown");
      return done.outcome;
    },
    { requireSession: true },
  );
  if (result.ok) {
    revalidatePath("/staff/[locale]/settings/operating-policy", "page");
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: command === "save" ? copy.saved : copy.approved,
          reference: `${copy.revision} ${result.data.version}`,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: formatDateTime(locale, result.data.recordedAt),
          },
          nextStep: command === "save" ? copy.savedNext : copy.approvedNext,
          destination: { href: path, label: copy.reload },
        },
      },
    };
  }
  const error = result.error;
  if (
    error.code === "REVISION_CONFLICT" ||
    error.code === "IDEMPOTENCY_KEY_REUSED" ||
    error.code === "APPROVAL_STALE"
  )
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code: error.code === "IDEMPOTENCY_KEY_REUSED" ? error.code : "REVISION_CONFLICT",
        message: copy.conflict,
        recovery: { href: path, label: copy.reload },
      },
    };
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.pending, status },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message:
        error.code === "STEP_UP_REQUIRED"
          ? copy.stepUp
          : error.code === "VALIDATION_FAILED"
            ? copy.invalid
            : copy.failed,
      retryable: error.retryable,
      recovery: {
        href:
          error.code === "STEP_UP_REQUIRED"
            ? `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`
            : path,
        label: error.code === "STEP_UP_REQUIRED" ? copy.stepUp : copy.reload,
      },
    },
  };
}
async function savePolicyDraftState(
  locale: string,
  _previous: PolicyDraftState,
  data: FormData,
): Promise<PolicyDraftState> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const values = readFormValues<PolicyDraftValues>(data, [...policyFormFields, "ownerSearch"]);
  let document: ReturnType<typeof policyFromValues>;
  try {
    document = policyFromValues(values);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fieldErrors: Partial<Record<keyof PolicyFormValues, string[]>> = {};
    const aliases: Record<string, string> = {
      "serviceCalendar.validFrom": "validFrom",
      "serviceCalendar.validUntil": "validUntil",
      "serviceCalendar.sourceReference": "calendarSource",
      "serviceCalendar.exceptions": "exceptions",
      coverage: "coverage",
      "responsibilities.service": "ownerService",
      "responsibilities.privacy": "ownerPrivacy",
      "responsibilities.alerts": "ownerAlerts",
      "contactPurposes.service": "purposeService",
      "contactPurposes.savedSearch": "purposeSavedSearch",
      "contactPurposes.marketing": "purposeMarketing",
      "availabilityReviewDays.sale": "daysSales",
      "availabilityReviewDays.long_term_rent": "daysRent",
    };
    for (const issue of error.issues) {
      const key =
        issue.path[0] === "serviceCalendar" && issue.path[1] === "weekly"
          ? String(issue.path[2])
          : (aliases[issue.path.slice(0, 2).join(".")] ??
            (policyFormFields.some((field) => field === String(issue.path[0]))
              ? String(issue.path[0])
              : "calendarState"));
      fieldErrors[key as keyof PolicyFormValues] = [operatingPolicyCopy(locale).invalid];
    }
    return {
      ...stateFor(locale, "save", data, values).state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: operatingPolicyCopy(locale).invalid,
        fieldErrors,
      },
    };
  }
  return execute(locale, "save", data, values, document);
}
/** Browsing is a read inside the draft form, so a native POST retains every entry and key. */
export async function submitPolicyDraft(
  locale: string,
  previous: PolicyDraftState,
  data: FormData,
): Promise<PolicyDraftState> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const browse = data.has("_ownerPage");
  let metadata = data;
  if (browse) {
    metadata = new FormData();
    for (const field of [formFields.operationId, formFields.expectedRevision])
      for (const value of data.getAll(field)) metadata.append(field, value);
    // A browse button submits no command intent. Still validate the issued save envelope,
    // rejecting duplicate metadata or an ambiguous extra command submitter.
    if (data.getAll("_ownerPage").length === 1 && !data.has(formFields.intent))
      metadata.append(formFields.intent, "submit");
  }
  const values = readFormValues<PolicyDraftValues>(data, [...policyFormFields, "ownerSearch"]);
  const { envelope, state: idle, status } = stateFor(locale, "save", metadata, values);
  const state = browse ? idle : await savePolicyDraftState(locale, previous, data);
  if (state.outcome.kind === "confirmed") return state;
  if (!envelope?.expectedRevision)
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: operatingPolicyCopy(locale).ownerInvalid,
        fieldErrors: { ownerSearch: [operatingPolicyCopy(locale).ownerInvalid] },
      },
      ownerDirectory: { rows: [], page: 1, search: values.ownerSearch, hasMore: false },
      ownerChoices: [],
    };
  const rawPage = data.getAll(browse ? "_ownerPage" : "_ownerCurrentPage");
  const page = rawPage.length === 0 ? 1 : rawPage.length === 1 ? Number(rawPage[0]) : Number.NaN;
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      if (
        browse &&
        (await readOperatingPolicyOperation(db, access.session, "save", envelope.operationId))
      )
        throw new AppError("outcome_unknown");
      const [ownerDirectory, ownerChoices] = await Promise.all([
        listOperatingPolicyOwners(db, access.session, { page, search: values.ownerSearch }),
        readOperatingPolicyOwnerChoices(db, access.session, [
          values.ownerService,
          values.ownerPrivacy,
          values.ownerAlerts,
        ]),
      ]);
      return { ownerDirectory, ownerChoices };
    },
    { requireSession: true },
  );
  if (result.ok) return { ...state, ...result.data };
  const copy = operatingPolicyCopy(locale);
  const held: PolicyDraftState = {
    ...state,
    ownerDirectory: { rows: [], page: 1, search: values.ownerSearch, hasMore: false },
    ownerChoices: [],
  };
  // A directory read must never replace an existing command outcome or clear its fence.
  if (!browse) return held;
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...held,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.ownerInvalid,
        fieldErrors: { ownerSearch: [copy.ownerInvalid] },
      },
    };
  if (result.error.code === "OUTCOME_UNKNOWN")
    return {
      ...held,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.pending, status },
    };
  return {
    ...held,
    outcome: {
      kind: "rejected",
      code: result.error.code,
      message: copy.failed,
      retryable: false,
      recovery: { href: `/${locale}/settings/operating-policy`, label: copy.reload },
    },
  };
}
export async function submitPolicyApproval(
  locale: string,
  _previous: FormState<PolicyApprovalValues>,
  data: FormData,
): Promise<FormState<PolicyApprovalValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  return execute(
    locale,
    "approve",
    data,
    readFormValues<PolicyApprovalValues>(data, ["expectedHash", "note", "reviewed"]),
  );
}
