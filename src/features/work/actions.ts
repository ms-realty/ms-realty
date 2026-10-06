"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { action, type HandlerContext } from "@/server/http/next";
import {
  acceptInquiry,
  changeTask,
  readWorkOperation,
  triageInquiry,
} from "@/server/work/commands";
import { recordInquiryContact } from "@/server/work/contact";
import { handoverTask } from "@/server/work/handover";
import { handoverReviewInput, handoverReviewInstant } from "@/server/work/handover-time";
import { readInquiry, readTask } from "@/server/work/queries";
import type { FormState, FormValues } from "@/ui/form/contract";
import {
  isIssuedFormOperation,
  issueFormOperation,
  readFormEnvelope,
  readFormValues,
} from "@/ui/form/server";
import { workCopy } from "./copy";
import { taskHandoverCopy } from "./handover-copy";
import { inquiryDraftOwner } from "./inquiry-draft-owner";
import type { InquiryDraftKind } from "./inquiry-draft-storage";
import {
  inquiryEnhancedField,
  inquiryOperationType,
  inquiryReferenceCookie,
  inquiryStatusHref,
  isInquiryDraftKind,
  parseInquiryReference,
} from "./inquiry-reference";
import { type InboxScope, inquiryHref } from "./inquiry-row";

export type AcceptValues = { nextAction: string; dueAt: string };
export type TriageValues = { state: string; reason: string; duplicateOfInquiryId: string };
export type TaskValues = { state: string; note: string; followUpAt: string };
export type ContactValues = {
  contactChoice: string;
  result: string;
  contactedAt: string;
  note: string;
  nextAction: string;
  dueAt: string;
  promisedToClient: string;
  reviewed: string;
};
export type ContactMethodView = { id: string; version: number; kind: string; value: string };
export type ContactState = FormState<ContactValues> & {
  currentContact?: ContactMethodView | null;
  previousContact?: ContactMethodView | null;
};
type Kind = "accept" | "triage" | "contact" | "task" | "handover";
const localInstant = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)
    ? `${value}${value.length === 16 ? ":00" : ""}Z`
    : value;
const inputInstant = (value: Date | null) => value?.toISOString().slice(0, 16) ?? "";
const scopeFor = (kind: Kind, id: string) => `work.${kind}.${id}`;
const enhancedInquiry = (data: FormData) =>
  data.getAll(inquiryEnhancedField).length === 1 && data.get(inquiryEnhancedField) === "yes";
const recordPath = (locale: string, kind: Kind, id: string) =>
  `/${locale}/${kind === "task" || kind === "handover" ? "tasks" : "inquiries"}/${id}`;

async function perform<V extends FormValues>(
  locale: string,
  id: string,
  kind: Kind,
  data: FormData,
  fields: readonly (keyof V)[],
  execute: (
    ctx: HandlerContext,
    envelope: { operationId: string; expectedVersion: number },
    values: V,
  ) => Promise<{ recordedAt: string; reference?: string }>,
  latest: (ctx: HandlerContext) => Promise<{ revision: number; values: V }>,
): Promise<FormState<V>> {
  const copy = workCopy(locale);
  const scope = scopeFor(kind, id);
  const values = readFormValues<V>(data, fields);
  const envelope = readFormEnvelope(data, scope);
  const path = recordPath(locale, kind, id);
  const key = envelope?.operationId ?? issueFormOperation(scope);
  const status = {
    href: `${path}/operations?type=${kind}&key=${encodeURIComponent(key)}`,
    label: copy.statusLink,
  };
  const state: FormState<V> = {
    operationId: key,
    expectedRevision: envelope?.expectedRevision ?? null,
    reconciliation: status,
    values: kind === "handover" || kind === "contact" ? { ...values, reviewed: "" } : values,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
  const jar = isInquiryDraftKind(kind) ? await cookies() : null;
  let referenceCookie: string | undefined, fencedReference: string | undefined;
  let referenceAlreadyPending = false;
  const holdReference = (name: string, value = key) =>
    jar?.set(name, value, {
      path: "/",
      sameSite: "strict",
      secure: getEnv().hosts.staff.startsWith("https://"),
    });
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope?.expectedRevision) throw new AppError("validation_failed");
      if (jar && isInquiryDraftKind(kind)) {
        const name = inquiryReferenceCookie(inquiryDraftOwner(ctx.session).id, id, kind);
        const previous = parseInquiryReference(jar.get(name)?.value);
        if (previous && previous.key !== key && isIssuedFormOperation(scope, previous.key)) {
          const receipt =
            previous.status === "pending"
              ? null
              : await readWorkOperation(
                  ctx.db,
                  ctx.session,
                  inquiryOperationType(kind),
                  id,
                  previous.key,
                );
          if (!receipt || receipt.status !== previous.status) {
            fencedReference = previous.key;
            throw new AppError("outcome_unknown");
          }
        }
        referenceCookie = name;
        referenceAlreadyPending = previous?.status === "pending" && previous.key === key;
        // The enhanced form already put K in the request cookie. Rewriting it on a known
        // failure rerenders the pending SSR fence before the client can observe that body.
        if (!referenceAlreadyPending) holdReference(name);
      }
      return execute(
        ctx,
        { operationId: envelope.operationId, expectedVersion: envelope.expectedRevision },
        values,
      );
    },
    { requireSession: true },
  );
  if (fencedReference) {
    const retainedStatus = {
      href: `${path}/operations?type=${kind}&key=${encodeURIComponent(fencedReference)}`,
      label: copy.statusLink,
    };
    return {
      ...state,
      operationId: fencedReference,
      reconciliation: retainedStatus,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.unknown,
        status: retainedStatus,
      },
    };
  }
  // Headers are not an acknowledgment, including a failure before runOperation made a receipt.
  // Keep the reference until the client observes a settled body or explicitly reconciles it.
  if (result.ok) {
    if (referenceCookie && referenceAlreadyPending) holdReference(referenceCookie);
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.changeSaved,
          reference: result.data.reference ?? id,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: `${new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(new Date(result.data.recordedAt))} UTC`,
          },
          nextStep: copy.nextStep,
          destination: { href: path, label: copy.openRecord },
        },
      },
    };
  }
  const error = result.error;
  if (isInquiryDraftKind(kind) && error.code === "IDEMPOTENCY_KEY_REUSED")
    return {
      ...state,
      outcome: {
        kind: "conflict",
        code: "IDEMPOTENCY_KEY_REUSED",
        message: copy.conflict,
        recovery: status,
      },
    };
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.unknown, status },
    };
  let failedReceipt = false;
  if (referenceCookie && isInquiryDraftKind(kind)) {
    const receipt = await action(
      async (ctx) => {
        await requireAuthHost("staff");
        if (!ctx.session) throw new AppError("unauthenticated");
        return readWorkOperation(ctx.db, ctx.session, inquiryOperationType(kind), id, key);
      },
      { requireSession: true },
    );
    // A concurrent earlier attempt may have settled while this request failed validation.
    if (receipt.ok && receipt.data?.status === "succeeded")
      return {
        ...state,
        outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.unknown, status },
      };
    failedReceipt = receipt.ok && receipt.data?.status === "failed";
    if (!enhancedInquiry(data) && receipt.ok) {
      // Native POST must render its useActionState values/errors before hydration. The
      // record rechecks these advisory markers: terminal failure is settled; missing may
      // expose only K, so even a still-running earlier request cannot become a second write.
      if (failedReceipt) holdReference(referenceCookie, `failed:${key}`);
      else if (!receipt.data && error.code === "VALIDATION_FAILED")
        holdReference(referenceCookie, `retry:${key}`);
    }
  }
  const knownState = failedReceipt ? { ...state, inquiryReferenceToAcknowledge: key } : state;
  // Missing is not proof that an earlier request stopped. Reuse K until a terminal failure
  // permits a new intent; runOperation serializes K and rejects changed request hashes.
  const correctedKey = referenceCookie && !failedReceipt ? key : issueFormOperation(scope);
  if (error.code === "REVISION_CONFLICT") {
    const current = await action(
      async (ctx) => {
        await requireAuthHost("staff");
        return latest(ctx);
      },
      { requireSession: true },
    );
    if (current.ok) {
      const reapplyKey = correctedKey;
      return {
        ...knownState,
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: copy.conflict,
          latest: current.data,
          reapply: {
            operationId: reapplyKey,
            expectedRevision: current.data.revision,
            status: {
              href: `${path}/operations?type=${kind}&key=${encodeURIComponent(reapplyKey)}`,
              label: copy.statusLink,
            },
          },
        },
      };
    }
  }
  const correctedState = {
    ...knownState,
    operationId: correctedKey,
    reconciliation: {
      href: `${path}/operations?type=${kind}&key=${encodeURIComponent(correctedKey)}`,
      label: copy.statusLink,
    },
  };
  if (error.code === "VALIDATION_FAILED") {
    const decisionCopy =
      kind === "handover" && (values.action === "decline" || values.action === "cancel")
        ? taskHandoverCopy(locale)
        : null;
    const reasonRequired = decisionCopy && error.fieldErrors?.reason?.length;
    return {
      ...correctedState,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: reasonRequired ? decisionCopy.reasonSummary : copy.validation,
        fieldErrors: Object.fromEntries(
          fields
            .filter((field) => error.fieldErrors?.[String(field)])
            .map((field) => {
              const reason = error.fieldErrors?.[String(field)]?.[0];
              const message =
                field === "reason" && decisionCopy
                  ? values.action === "decline"
                    ? decisionCopy.declineReasonRequired
                    : decisionCopy.withdrawReasonRequired
                  : reason
                    ? (copy.reasons[reason] ?? copy.invalid)
                    : copy.invalid;
              return [field, [message]];
            }),
        ) as Partial<Record<keyof V, string[]>>,
      },
    };
  }
  const message =
    error.code === "UNAUTHENTICATED"
      ? copy.sessionEnded
      : error.code === "NOT_AUTHORIZED" || error.code === "NOT_FOUND"
        ? copy.denied
        : error.fieldErrors?.form?.includes("open_commitments")
          ? copy.commitments
          : copy.unavailable;
  // Only a recorded terminal failure permits a fresh identity for an inquiry correction.
  return {
    ...correctedState,
    outcome: {
      kind: "rejected",
      code: error.code,
      message,
      retryable: false,
      recovery: { href: path, label: copy.openRecord },
    },
  };
}

/** Explicit receipt review; missing may resume only the same key, never replay a command. */
export async function resolveInquiryReferenceAction(
  locale: string,
  id: string,
  kind: InquiryDraftKind,
  operationId: string,
  scope: InboxScope,
  page: number,
  retryMissing: boolean,
) {
  const jar = await cookies();
  const statusPath = inquiryStatusHref(locale, id, kind, operationId, scope, page);
  let newer: string | undefined;
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (
        !isStaffLocale(locale) ||
        !isInquiryDraftKind(kind) ||
        !isIssuedFormOperation(scopeFor(kind, id), operationId)
      )
        throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      const name = inquiryReferenceCookie(inquiryDraftOwner(ctx.session).id, id, kind);
      const current = parseInquiryReference(jar.get(name)?.value);
      if (
        current &&
        current.key !== operationId &&
        isIssuedFormOperation(scopeFor(kind, id), current.key)
      ) {
        newer = current.key;
        throw new AppError("outcome_unknown");
      }
      const receipt = await readWorkOperation(
        ctx.db,
        ctx.session,
        inquiryOperationType(kind),
        id,
        operationId,
      );
      const resolution =
        retryMissing && !receipt
          ? "retry"
          : receipt?.status === "succeeded" || receipt?.status === "failed"
            ? receipt.status
            : null;
      if (!resolution) throw new AppError("outcome_unknown");
      // SSR validates this advisory marker against the actor's receipt before allowing a form.
      jar.set(name, `${resolution}:${operationId}`, {
        path: "/",
        sameSite: "strict",
        secure: getEnv().hosts.staff.startsWith("https://"),
      });
      return null;
    },
    { requireSession: true },
  );
  if (newer) redirect(inquiryStatusHref(locale, id, kind, newer, scope, page));
  if (!result.ok) redirect(statusPath);
  redirect(inquiryHref(locale, id, scope, page));
}

export async function acceptAction(
  locale: string,
  id: string,
  _previous: FormState<AcceptValues>,
  data: FormData,
) {
  const state = await perform<AcceptValues>(
    locale,
    id,
    "accept",
    data,
    ["nextAction", "dueAt"],
    async (ctx, envelope, values) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      return (
        await acceptInquiry(ctx.db, ctx.session, {
          id,
          ...envelope,
          ...values,
          dueAt: localInstant(values.dueAt),
        })
      ).outcome;
    },
    async (ctx) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const current = await readInquiry(ctx.db, ctx.session, id);
      const task = current.tasks.at(-1)?.task;
      return {
        revision: current.inquiry.version,
        values: { nextAction: task?.title ?? "", dueAt: inputInstant(current.inquiry.followUpAt) },
      };
    },
  );
  // The accepted inquiry no longer offers this form on a native POST response.
  if (state.outcome.kind === "confirmed" && state.reconciliation && !enhancedInquiry(data))
    redirect(state.reconciliation.href);
  return state;
}

export async function triageAction(
  locale: string,
  id: string,
  _previous: FormState<TriageValues>,
  data: FormData,
) {
  return perform<TriageValues>(
    locale,
    id,
    "triage",
    data,
    ["state", "reason", "duplicateOfInquiryId"],
    async (ctx, envelope, values) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      return (
        await triageInquiry(ctx.db, ctx.session, {
          id,
          ...envelope,
          state: values.state as Parameters<typeof triageInquiry>[2]["state"],
          reason: values.reason,
          ...(values.duplicateOfInquiryId
            ? { duplicateOfInquiryId: values.duplicateOfInquiryId }
            : {}),
        })
      ).outcome;
    },
    async (ctx) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const { inquiry } = await readInquiry(ctx.db, ctx.session, id);
      return {
        revision: inquiry.version,
        values: {
          state: inquiry.state,
          reason: inquiry.dispositionReason ?? "",
          duplicateOfInquiryId: inquiry.duplicateOfInquiryId ?? "",
        },
      };
    },
  );
}

export async function contactAction(
  locale: string,
  id: string,
  _previous: ContactState,
  data: FormData,
) {
  let currentContact = _previous.currentContact;
  const state = await perform<ContactValues>(
    locale,
    id,
    "contact",
    data,
    [
      "contactChoice",
      "result",
      "contactedAt",
      "note",
      "nextAction",
      "dueAt",
      "promisedToClient",
      "reviewed",
    ],
    async (ctx, envelope, values) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const [contactMethodId, revision] = values.contactChoice.split(":");
      if (!contactMethodId || !revision || values.contactChoice.split(":").length !== 2)
        throw new AppError("validation_failed", {
          fieldErrors: { contactChoice: ["Review the current contact."] },
        });
      return (
        await recordInquiryContact(ctx.db, ctx.session, {
          id,
          ...envelope,
          contactMethodId,
          expectedContactVersion: Number(revision),
          result: values.result as "unanswered" | "useful_response",
          contactedAt: localInstant(values.contactedAt),
          note: values.note,
          nextAction: values.nextAction,
          dueAt: localInstant(values.dueAt),
          promisedToClient: values.promisedToClient === "yes",
          reviewed: values.reviewed === "yes",
        })
      ).outcome;
    },
    async (ctx) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const current = await readInquiry(ctx.db, ctx.session, id);
      const latest = current.activity.find((entry) => entry.contact)?.contact;
      currentContact = current.contactMethod;
      return {
        revision: current.inquiry.version,
        values: {
          contactChoice: current.contactMethod
            ? `${current.contactMethod.kind} · ${current.contactMethod.value}`
            : "—",
          result: latest?.result ?? "unanswered",
          contactedAt: latest?.contactedAt ?? "",
          note: latest?.note ?? "",
          nextAction: latest?.nextAction ?? "",
          dueAt: latest?.dueAt ?? "",
          promisedToClient: latest?.promisedToClient ? "yes" : "",
          reviewed: "",
        },
      };
    },
  );
  if (state.outcome.kind === "confirmed" && state.reconciliation && !enhancedInquiry(data))
    redirect(state.reconciliation.href);
  return {
    ...state,
    currentContact,
    previousContact: _previous.previousContact ?? _previous.currentContact,
  };
}

export async function taskAction(
  locale: string,
  id: string,
  _previous: FormState<TaskValues>,
  data: FormData,
) {
  return perform<TaskValues>(
    locale,
    id,
    "task",
    data,
    ["state", "note", "followUpAt"],
    async (ctx, envelope, values) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      return (
        await changeTask(ctx.db, ctx.session, {
          id,
          ...envelope,
          state: values.state as Parameters<typeof changeTask>[2]["state"],
          note: values.note,
          ...(values.followUpAt ? { followUpAt: localInstant(values.followUpAt) } : {}),
        })
      ).outcome;
    },
    async (ctx) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const { task } = await readTask(ctx.db, ctx.session, id);
      return {
        revision: task.version,
        values: {
          state: task.state,
          note: task.outcomeNote ?? task.waitingOn ?? task.cancelReason ?? "",
          followUpAt: inputInstant(task.followUpAt),
        },
      };
    },
  );
}

export async function taskHandoverAction(
  locale: string,
  id: string,
  _previous: FormState<FormValues>,
  data: FormData,
) {
  const state = await perform<FormValues>(
    locale,
    id,
    "handover",
    data,
    ["action", "receiverId", "reason", "reviewed", "nextAction", "dueAt"],
    async (ctx, envelope, values) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      return (
        await handoverTask(ctx.db, ctx.session, {
          id,
          ...envelope,
          action: values.action,
          receiverId: values.receiverId,
          ...(values.action === "accept"
            ? { nextAction: values.nextAction, dueAt: handoverReviewInstant(values.dueAt ?? "") }
            : values.action === "request"
              ? { reason: values.reason, reviewed: values.reviewed === "true" }
              : { reason: values.reason }),
        })
      ).outcome;
    },
    async (ctx) => {
      if (!ctx.session) throw new AppError("unauthenticated");
      const { task } = await readTask(ctx.db, ctx.session, id);
      return {
        revision: task.version,
        values: {
          action: "",
          receiverId: task.pendingOwnerId ?? "",
          reason: "",
          reviewed: "",
          nextAction: task.title,
          dueAt: handoverReviewInput(task.followUpAt),
        },
      };
    },
  );
  // A successful request/acceptance changes which forms exist. A receipt GET remains
  // stable for native POSTs even when the original form is no longer rendered.
  if (state.outcome.kind === "confirmed" && state.reconciliation)
    redirect(state.reconciliation.href);
  return state;
}
