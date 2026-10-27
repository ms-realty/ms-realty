import "server-only";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError, isAppError } from "@/server/errors";
import { effortScope, recordTaskEffort } from "@/server/work/effort";
import { isIssuedFormOperation } from "@/ui/form/server";

export const effortFormRoute = nativeAuthRoute(
  "staff",
  (locale, p) => `/${locale}/tasks/${encodeURIComponent(p.id ?? "")}/effort`,
  async ({ db, form, params, locale }) => {
    const one = (name: string) =>
      form.getAll(name).length === 1 ? String(form.get(name) ?? "") : "";
    const id = params.id ?? "",
      submittedAction = one("action"),
      key = one("operationId");
    if (submittedAction !== "record" && submittedAction !== "void")
      throw new AppError("validation_failed");
    const action = submittedAction;
    const path = `/${locale}/tasks/${encodeURIComponent(id)}/effort`;
    const values = new URLSearchParams({ operation: key, action });
    const minutes = one("minutes"),
      category = one("category"),
      reason = one("reason");
    if (/^[1-9]\d{0,2}$/.test(minutes)) values.set("minutes", minutes);
    if (["correction", "reentry"].includes(category)) values.set("category", category);
    if (["facts", "language", "duplicate_entry", "routing", "other"].includes(reason))
      values.set("reason", reason);
    const target = `${path}?${values}`;
    const access = await currentStaffAccess();
    if (access.state !== "ready") return `/${locale}/access?returnTo=${encodeURIComponent(target)}`;
    if (!isIssuedFormOperation(effortScope(access.session.account.id, id, action), key))
      throw new AppError("validation_failed");
    try {
      await recordTaskEffort(
        db,
        access.session,
        action === "void"
          ? {
              id,
              operationId: key,
              expectedVersion: Number(one("expectedVersion")),
              action,
              entryId: one("entryId"),
              reason: "entry_mistake",
            }
          : {
              id,
              operationId: key,
              expectedVersion: Number(one("expectedVersion")),
              action,
              category: category as "correction" | "reentry",
              minutes: Number(minutes),
              reason: reason as "facts" | "language" | "duplicate_entry" | "routing" | "other",
            },
      );
    } catch (error) {
      if (!isAppError(error)) throw error;
      values.set("error", error.code);
    }
    return `${path}?${values}`;
  },
);
