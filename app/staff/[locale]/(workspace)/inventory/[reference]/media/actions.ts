"use server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { filesCopy } from "@/features/files/copy";
import { inventoryCopy } from "@/features/inventory/copy";
import type { MediaDetailsValues } from "@/features/inventory/media-details-editor";
import { safeNext } from "@/features/inventory/next";
import { savedAckField, savedOperationCookie } from "@/features/inventory/saved-operation";
import { isStaffLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { mediaForListing, saveMediaDetails } from "@/server/media/commands";
import { type FormState, formFields } from "@/ui/form/contract";

export async function savePhotoDetails(
  locale: string,
  reference: string,
  assetId: string,
  relationId: string,
  _previous: FormState<MediaDetailsValues>,
  form: FormData,
): Promise<FormState<MediaDetailsValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = inventoryCopy(locale),
    files = filesCopy(locale),
    workspace = workflowCopy(locale, "listingWorkspace");
  const values = Object.fromEntries(
    ["caption", "altText", "modification", "modificationDisclosure"].map((key) => [
      key,
      String(form.get(key) ?? ""),
    ]),
  ) as MediaDetailsValues;
  const reapply = form.get(formFields.intent) === "reapply";
  const operationId = String(
    form.get(reapply ? formFields.reapplyOperationId : formFields.operationId) ?? "",
  );
  const expectedRevision = Number(
    form.get(reapply ? formFields.reapplyRevision : formFields.expectedRevision),
  );
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/media`;
  const status = {
    href: `${path}?photo=${relationId}&saved=${encodeURIComponent(operationId)}`,
    label: copy.operation,
  };
  const state: FormState<MediaDetailsValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const read = () =>
    action(
      async ({ db }) => {
        const access = await currentStaffAccess();
        if (access.state !== "ready") throw new AppError("unauthenticated");
        const listing = await mediaForListing(db, access.session, reference);
        const row = listing.assets.find(
          (row) => row.asset.id === assetId && row.relation.id === relationId,
        );
        if (!row) throw new AppError("not_found");
        return row.asset;
      },
      { requireSession: true },
    );
  const leave = safeNext(locale, form.get("_leave"));
  if (leave) {
    const current = await read();
    if (current.ok) {
      const asset = current.data;
      const stored = asset.detailsDraft ?? {
        caption: asset.caption ?? "",
        altText: asset.altText ?? "",
        modification: asset.modification,
        modificationDisclosure: asset.modificationDisclosure ?? "",
      };
      if (
        Object.entries(values).every(([key, value]) => value === stored[key as keyof typeof stored])
      )
        redirect(leave);
    }
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "UNSAVED_CHANGES",
        message: workspace.unsavedBody,
        retryable: true,
        recovery: { href: leave, label: workspace.discard },
      },
    };
  }
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const listing = await mediaForListing(db, access.session, reference);
      if (!listing.assets.some((row) => row.asset.id === assetId && row.relation.id === relationId))
        throw new AppError("not_found");
      return saveMediaDetails(db, {
        session: access.session,
        operationId,
        expectedRevision,
        id: assetId,
        input: form.get("_detailsAction") === "discard" ? { discard: true } : values,
      });
    },
    { requireSession: true },
  );
  if (result.ok) {
    const ack = String(form.get(savedAckField) ?? "");
    if (/^[0-9a-f-]{36}$/.test(ack))
      (await cookies()).set(savedOperationCookie, ack, {
        path: "/",
        maxAge: 60,
        sameSite: "strict",
      });
    redirect(`${path}?photo=${relationId}&saved=${result.data.operationId}`);
  }
  const error = result.error;
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED") {
    const fresh = await read();
    if (fresh.ok) {
      const asset = fresh.data;
      const latest = asset.detailsDraft ?? {
        caption: asset.caption ?? "",
        altText: asset.altText ?? "",
        modification: asset.modification,
        modificationDisclosure: asset.modificationDisclosure ?? "",
      };
      const key = randomUUID();
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: error.code,
          message: files.conflict,
          latest: { revision: asset.version, values: latest },
          reapply: {
            operationId: key,
            expectedRevision: asset.version,
            status: { href: `${path}?photo=${relationId}&saved=${key}`, label: copy.operation },
          },
        },
      };
    }
  }
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.form.unknown, status },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.code === "VALIDATION_FAILED" ? copy.o12.invalidError : error.message,
      retryable: error.retryable,
      recovery: { href: `${path}?photo=${relationId}`, label: files.refresh },
    },
  };
}
