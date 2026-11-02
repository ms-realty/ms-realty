"use server";
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { filesCopy } from "@/features/files/copy";
import { inventoryCopy } from "@/features/inventory/copy";
import type { MediaDetailsValues } from "@/features/inventory/media-details-editor";
import type { MediaReviewValues } from "@/features/inventory/media-review-editor";
import { safeNext } from "@/features/inventory/next";
import { savedAckField, savedOperationCookie } from "@/features/inventory/saved-operation";
import { isStaffLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  mediaForListing,
  placeMedia,
  reviewMedia,
  saveMediaDetails,
} from "@/server/media/commands";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";

function readPhoto(reference: string, assetId: string, relationId: string) {
  return action(
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
}

function photoNavigation(locale: string, path: string, relationId: string, form: FormData) {
  const leave =
    form.get("_leave") === "position"
      ? `${path}?photo=${relationId}&before=${encodeURIComponent(String(form.get("_before") ?? ""))}`
      : safeNext(locale, form.get("_leave"));
  const hidden = form.get("_mediaHidden");
  return { leave, hidden: hidden === "true" ? true : hidden === "false" ? false : undefined };
}

async function finishPhotoNavigation<V extends FormValues>(
  locale: string,
  reference: string,
  relationId: string,
  path: string,
  state: FormState<V>,
  form: FormData,
  unchanged: boolean,
): Promise<FormState<V>> {
  const workspace = workflowCopy(locale, "listingWorkspace");
  const { leave, hidden } = photoNavigation(locale, path, relationId, form);
  const back = `${path}?photo=${relationId}`;
  if (!unchanged)
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "UNSAVED_CHANGES",
        message: workspace.unsavedBody,
        retryable: true,
        recovery: { href: leave || back, label: workspace.discard },
      },
    };
  if (leave) redirect(leave);
  const operationId = String(form.get("_placementOperationId") ?? "");
  const status = {
    href: `${back}&saved=${encodeURIComponent(operationId)}`,
    label: inventoryCopy(locale).operation,
  };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      return placeMedia(db, {
        session: access.session,
        operationId,
        expectedRevision: Number(form.get("_placementRevision")),
        reference,
        relationId,
        hidden,
      });
    },
    { requireSession: true },
  );
  if (result.ok) redirect(`${back}&saved=${result.data.operationId}`);
  return {
    ...state,
    outcome:
      result.error.outcome === "unknown"
        ? {
            kind: "unknown",
            code: "OUTCOME_UNKNOWN",
            message: inventoryCopy(locale).form.unknown,
            status,
          }
        : {
            kind: "rejected",
            code: result.error.code,
            message:
              result.error.code === "REVISION_CONFLICT"
                ? filesCopy(locale).conflict
                : result.error.message,
            retryable: false,
            recovery: { href: back, label: filesCopy(locale).refresh },
          },
  };
}

async function acknowledgePhotoSave(form: FormData) {
  const ack = String(form.get(savedAckField) ?? "");
  if (/^[0-9a-f-]{36}$/.test(ack))
    (await cookies()).set(savedOperationCookie, ack, { path: "/", maxAge: 60, sameSite: "strict" });
}

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
    files = filesCopy(locale);
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
  const read = () => readPhoto(reference, assetId, relationId);
  const navigation = photoNavigation(locale, path, relationId, form);
  if (navigation.leave || navigation.hidden !== undefined) {
    const current = await read();
    let unchanged = false;
    if (current.ok) {
      const asset = current.data;
      const stored = asset.detailsDraft ?? {
        caption: asset.caption ?? "",
        altText: asset.altText ?? "",
        modification: asset.modification,
        modificationDisclosure: asset.modificationDisclosure ?? "",
      };
      unchanged = Object.entries(values).every(
        ([key, value]) => value === stored[key as keyof typeof stored],
      );
    }
    return finishPhotoNavigation(locale, reference, relationId, path, state, form, unchanged);
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
    await acknowledgePhotoSave(form);
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

export async function reviewPhoto(
  locale: string,
  reference: string,
  assetId: string,
  relationId: string,
  _previous: FormState<MediaReviewValues>,
  form: FormData,
): Promise<FormState<MediaReviewValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = inventoryCopy(locale),
    files = filesCopy(locale);
  const values = Object.fromEntries(
    [
      "caption",
      "altText",
      "modification",
      "modificationDisclosure",
      "rightsHolder",
      "rightsReference",
      "privacyReviewed",
      "rightsConfirmed",
    ].map((key) => [key, String(form.get(key) ?? "")]),
  ) as MediaReviewValues;
  const reapply =
    form.get(formFields.intent) === "reapply" ||
    (form.get("_decision") === "reject" && form.has(formFields.reapplyOperationId));
  const operationId = String(
    form.get(reapply ? formFields.reapplyOperationId : formFields.operationId) ?? "",
  );
  const expectedRevision = Number(
    form.get(reapply ? formFields.reapplyRevision : formFields.expectedRevision),
  );
  const path = `/${locale}/inventory/${encodeURIComponent(reference)}/media`;
  const reviewPath = `${path}?photo=${relationId}&panel=review`;
  const status = {
    href: `${reviewPath}&saved=${encodeURIComponent(operationId)}`,
    label: copy.operation,
  };
  const state: FormState<MediaReviewValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const read = () => readPhoto(reference, assetId, relationId);
  const navigation = photoNavigation(locale, path, relationId, form);
  if (navigation.leave || navigation.hidden !== undefined) {
    const current = await read();
    const unchanged =
      current.ok &&
      values.rightsHolder === (current.data.rightsHolder ?? "") &&
      values.rightsReference === (current.data.rightsReference ?? "") &&
      !values.privacyReviewed &&
      !values.rightsConfirmed;
    return finishPhotoNavigation(locale, reference, relationId, path, state, form, unchanged);
  }
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const listing = await mediaForListing(db, access.session, reference);
      if (!listing.assets.some((row) => row.asset.id === assetId && row.relation.id === relationId))
        throw new AppError("not_found");
      return reviewMedia(db, {
        session: access.session,
        operationId,
        expectedRevision,
        id: assetId,
        input: {
          ...values,
          decision: form.get("_decision") === "reject" ? "reject" : "approve",
          privacyReviewed: values.privacyReviewed === "yes",
          rightsConfirmed: values.rightsConfirmed === "yes",
        },
      });
    },
    { requireSession: true },
  );
  if (result.ok) {
    await acknowledgePhotoSave(form);
    redirect(`${path}?photo=${relationId}&saved=${result.data.operationId}`);
  }
  // Text is a recoverable draft. Confirmations and decisions never carry to a new review.
  state.values = { ...values, privacyReviewed: "", rightsConfirmed: "" };
  const error = result.error;
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED") {
    const fresh = await read();
    if (fresh.ok) {
      const asset = fresh.data;
      const operation = randomUUID();
      refresh();
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: error.code,
          message: files.conflict,
          latest: {
            revision: asset.version,
            values: {
              ...(asset.detailsDraft ?? {
                caption: asset.caption ?? "",
                altText: asset.altText ?? "",
                modification: asset.modification,
                modificationDisclosure: asset.modificationDisclosure ?? "",
              }),
              rightsHolder: asset.rightsHolder ?? "",
              rightsReference: asset.rightsReference ?? "",
              privacyReviewed: "",
              rightsConfirmed: "",
            },
          },
          reapply: {
            operationId: operation,
            expectedRevision: asset.version,
            status: { href: `${reviewPath}&saved=${operation}`, label: copy.operation },
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
  if (error.code === "VALIDATION_FAILED")
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.o12.invalidError,
        fieldErrors: {
          ...(!values.rightsHolder.trim() ? { rightsHolder: [files.rightsHolder] } : {}),
          ...(!values.rightsReference.trim() ? { rightsReference: [files.rightsReference] } : {}),
          privacyReviewed: [files.privacy],
          rightsConfirmed: [files.rightsCheck],
        },
      },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      recovery: { href: reviewPath, label: files.refresh },
    },
  };
}
