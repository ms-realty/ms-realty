"use server";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import type { DuplicatePair } from "@/server/duplicate-review/impact";
import {
  duplicateOperationScope,
  mergeDuplicate,
  reverseDuplicate,
} from "@/server/duplicate-review/merge";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { isIssuedFormOperation } from "@/ui/form/server";
import type { DuplicateMergeState } from "./merge-state";

function one(data: FormData, name: string) {
  const values = data.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") throw new AppError("validation_failed");
  return values[0];
}
export async function duplicateMergeAction(
  locale: string,
  pair: DuplicatePair,
  mode: "merge" | "reverse",
  binding: string,
  previous: DuplicateMergeState,
  data: FormData,
): Promise<DuplicateMergeState> {
  const key =
    data.getAll("operationId").length === 1 && typeof data.get("operationId") === "string"
      ? String(data.get("operationId"))
      : "";
  const result = await action(
    async ({ db, session }) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!session) throw new AppError("unauthenticated");
      if (
        !isIssuedFormOperation(
          duplicateOperationScope(
            session.account.id,
            mode,
            pair,
            mode === "reverse" ? binding : "",
          ),
          key,
        )
      )
        throw new AppError("validation_failed");
      const common = {
        operationId: key,
        leftVersion: Number(one(data, "leftVersion")),
        rightVersion: Number(one(data, "rightVersion")),
        impactDigest: one(data, "impactDigest"),
        reason: one(data, "reason"),
        reviewed: one(data, "reviewed") === "yes",
      };
      if (mode === "reverse") return reverseDuplicate(db, session, { ...common, mergeId: binding });
      return mergeDuplicate(db, session, {
        ...common,
        ...pair,
        survivor: binding,
        aliasMap: [
          { aliasId: binding === pair.left ? pair.right : pair.left, canonicalId: binding },
        ],
      });
    },
    { requireSession: true },
  );
  if (result.ok)
    redirect(`/${locale}/operations/duplicates/merge/receipt?id=${result.data.operationId}`);
  return {
    operationId: result.error.outcome === "unknown" ? key : previous.operationId,
    reason: typeof data.get("reason") === "string" ? String(data.get("reason")).slice(0, 1000) : "",
    error:
      result.error.outcome === "unknown"
        ? "unknown"
        : result.error.code === "version_conflict"
          ? "conflict"
          : "failure",
  };
}
