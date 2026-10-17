"use server";

import { randomUUID } from "node:crypto";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import {
  appendWorkspaceMessage,
  cancelWorkspace,
  createWorkspace,
  materializeWorkspaceArtifact,
  readWorkspace,
  requestWorkspaceRun,
  reviseWorkspaceArtifact,
} from "@/server/ai/workspace";
import { workspaceConfig } from "@/server/ai/workspace-config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { getJobQueue } from "@/server/jobs/web";
import type { FormState } from "@/ui/form/contract";
import { issueFormOperation, readFormEnvelope, readFormValues } from "@/ui/form/server";
import { workspaceCopy } from "./workspace-copy";
import {
  type WorkspaceMode,
  type WorkspaceParent,
  type WorkspaceValues,
  workspaceFields,
  workspaceHref,
  workspaceScope,
} from "./workspace-types";

export async function workspaceAction(
  locale: string,
  id: string,
  mode: WorkspaceMode,
  artifactId: string | null,
  parents: WorkspaceParent[],
  expectedGeneration: number | null,
  _previous: FormState<WorkspaceValues>,
  data: FormData,
): Promise<FormState<WorkspaceValues>> {
  const copy = workspaceCopy(locale);
  const scope = workspaceScope(mode, id, artifactId ?? undefined);
  const envelope = readFormEnvelope(data, scope);
  const operationId = envelope?.operationId ?? issueFormOperation(scope);
  const values = readFormValues<WorkspaceValues>(data, workspaceFields);
  const selected = data.getAll("listingIds");
  values.listingIds = selected.every((value) => typeof value === "string")
    ? selected.join("\n")
    : "";
  const command = mode === "revise" ? "artifact.revise" : mode;
  const path =
    mode === "create" ? workspaceHref(locale) + "?draft=" + id : workspaceHref(locale, id);
  const status = {
    href:
      workspaceHref(locale, id) + "?" + new URLSearchParams({ operation: operationId, command }),
    label: copy.operation,
  };
  const base: FormState<WorkspaceValues> = {
    operationId,
    expectedRevision: envelope?.expectedRevision ?? null,
    values,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      if (!envelope || (mode !== "create" && !envelope.expectedRevision))
        throw new AppError("validation_failed");
      if (
        expectedGeneration !== null &&
        (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0)
      )
        throw new AppError("validation_failed");
      const generationFence = expectedGeneration === null ? {} : { expectedGeneration };
      const constraints = values.constraints
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      const commandBase = { id, operationId, expectedVersion: envelope.expectedRevision ?? 1 };
      if (mode === "create") {
        const saved = await createWorkspace(ctx.db, ctx.session, {
          ...commandBase,
          goal: values.goal,
          locale,
          constraints,
          selection: {
            caseId: values.caseId || null,
            inquiryId: values.inquiryId || null,
            listingIds: values.listingIds.split("\n").filter(Boolean),
          },
        });
        return {
          ...saved.outcome,
          title: copy.saved,
          next: copy.runNext,
          href: workspaceHref(locale, id),
          label: copy.open,
          reference: values.goal,
        };
      }
      if (mode === "message") {
        const saved = await appendWorkspaceMessage(ctx.db, ctx.session, {
          ...commandBase,
          ...generationFence,
          message: values.message,
          goal: values.goal,
          constraints,
        });
        return {
          ...saved.outcome,
          title: copy.messageSaved,
          next: copy.runNext,
          href: workspaceHref(locale, id),
          label: copy.open,
          reference: values.goal,
        };
      }
      if (mode === "research") {
        if (values.reviewed !== "yes")
          throw new AppError("validation_failed", {
            fieldErrors: { reviewed: [copy.acknowledge] },
          });
        const config = workspaceConfig();
        if (!config.enabled) throw new AppError("unavailable");
        const saved = await requestWorkspaceRun(
          ctx.db,
          ctx.session,
          {
            ...commandBase,
            reviewed: true,
            acknowledgeUnknown: values.acknowledgeUnknown === "yes",
          },
          { queue: await getJobQueue(), config },
        );
        return {
          ...saved.outcome,
          title: copy.queued,
          next: copy.runNext,
          href: workspaceHref(locale, id),
          label: copy.open,
          reference: copy.title,
        };
      }
      if (mode === "cancel") {
        const saved = await cancelWorkspace(ctx.db, ctx.session, {
          ...commandBase,
          ...generationFence,
        });
        return {
          ...saved.outcome,
          title: copy.stopSaved,
          next: copy.stopHelp,
          href: workspaceHref(locale, id),
          label: copy.open,
          reference: copy.title,
        };
      }
      if (!artifactId) throw new AppError("not_found");
      const current = await readWorkspace(ctx.db, ctx.session, id);
      const artifact = current.artifacts.find((item) => item.id === artifactId);
      if (!artifact) throw new AppError("not_found");
      if (mode === "revise") {
        const proposal = {
          ...artifact.proposal,
          title: values.title,
          body: values.body,
          ...(artifact.proposal.kind === "buyer_handoff"
            ? {
                requirements: values.requirements,
                preferences: values.preferences,
                listingIds: values.listingIds.split("\n").filter(Boolean),
              }
            : {}),
        };
        const saved = await reviseWorkspaceArtifact(ctx.db, ctx.session, {
          ...commandBase,
          id: artifactId,
          sessionId: id,
          proposal,
        });
        return {
          ...saved.outcome,
          title: copy.revised,
          next: copy.revisionNext,
          href: workspaceHref(locale, id),
          label: copy.open,
          reference: values.title,
        };
      }
      if (values.reviewed !== "yes")
        throw new AppError("validation_failed", { fieldErrors: { reviewed: [copy.acknowledge] } });
      const target = parents.find((parent) => parent.type === values.parent);
      if (values.parent !== "none" && !target) throw new AppError("validation_failed");
      const saved = await materializeWorkspaceArtifact(ctx.db, ctx.session, {
        ...commandBase,
        id: artifactId,
        sessionId: id,
        reviewed: true,
        command: {
          parent: target
            ? { type: target.type, id: target.id, expectedVersion: target.expectedVersion }
            : null,
        },
      });
      const record = saved.outcome.result;
      const destination =
        typeof record.id === "string" && record.type === "task"
          ? "/" + locale + "/tasks/" + record.id
          : typeof record.id === "string" && record.type === "case"
            ? "/" + locale + "/cases/" + record.id
            : workspaceHref(locale, id);
      return {
        ...saved.outcome,
        title: copy.recordSaved,
        next: copy.recordNext,
        href: destination,
        label: copy.openRecord,
        reference: artifact.proposal.title,
      };
    },
    { requireSession: true },
  );
  if (result.ok)
    return {
      ...base,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: result.data.title,
          reference: result.data.reference,
          recordedAt: {
            dateTime: result.data.recordedAt,
            label: formatDateTime(isStaffLocale(locale) ? locale : "bg", result.data.recordedAt),
          },
          nextStep: result.data.next,
          destination: { href: result.data.href, label: result.data.label },
        },
      },
    };
  if (result.error.outcome === "unknown")
    return {
      ...base,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.retained, status },
    };
  const freshOperation = issueFormOperation(scope);
  if (result.error.code === "VALIDATION_FAILED")
    return {
      ...base,
      operationId: freshOperation,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.invalid,
        fieldErrors:
          mode === "create"
            ? {
                goal: [copy.required],
                constraints: [copy.constraintsHelp],
                caseId: [copy.contextHelp],
              }
            : mode === "message"
              ? { message: [copy.required] }
              : mode === "revise"
                ? { title: [copy.required], body: [copy.required] }
                : { reviewed: [copy.acknowledge] },
      },
    };
  return {
    ...base,
    operationId: freshOperation,
    outcome: {
      kind: "rejected",
      code: result.error.code,
      retryable: false,
      message: ["REVISION_CONFLICT", "APPROVAL_STALE"].includes(result.error.code)
        ? copy.changed
        : ["DEPENDENCY_UNAVAILABLE", "RATE_LIMITED"].includes(result.error.code)
          ? copy.disabled
          : copy.denied,
      recovery: { href: path, label: copy.refresh },
    },
  };
}
