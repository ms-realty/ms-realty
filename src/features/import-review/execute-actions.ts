"use server";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  cancelStaffImport,
  executeStaffImport,
  readStaffImport,
  reverseStaffImport,
  sealStaffImport,
} from "@/server/import-review/commands";
import { choiceFields, type ImportSelection } from "@/server/import-review/contracts";

const one = (data: FormData, field: string) => {
  const values = data.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") throw new AppError("validation_failed");
  return values[0];
};
/** Native POST and same-operation GET recovery share the ordinary guarded server commands. */
export async function staffImportCommandAction(locale: string, data: FormData): Promise<void> {
  const id = data.get("id");
  const safeId = typeof id === "string" && /^[a-f0-9-]{36}$/u.test(id) ? id : "";
  const result = await action(
    async ({ db, session }) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!session) throw new AppError("unauthenticated");
      const expected = one(data, "expectedVersion");
      if (!/^[1-9]\d{0,8}$/u.test(expected)) throw new AppError("validation_failed");
      const command = {
        id: one(data, "id"),
        operationKey: one(data, "operationKey"),
        expectedVersion: Number(expected),
      };
      const intent = one(data, "intent");
      if (intent === "review") {
        if (one(data, "confirmed") !== "reviewed") throw new AppError("validation_failed");
        const receipt = await readStaffImport(db, session, command.id);
        const selected = data.getAll("selected");
        const selection: ImportSelection[] = selected.map((number) => {
          if (typeof number !== "string" || !/^\d{1,3}$/u.test(number))
            throw new AppError("validation_failed");
          const choices = Object.fromEntries(
            choiceFields.flatMap((field) => {
              const values = data.getAll(`choice.${number}.${field}`);
              if (!values.length || (values.length === 1 && values[0] === "")) return [];
              if (values.length !== 1 || !["keep", "source"].includes(values[0] as string))
                throw new AppError("validation_failed");
              return [[field, values[0]]];
            }),
          );
          if (!receipt.rows.some((row) => row.number === Number(number)))
            throw new AppError("validation_failed");
          return { number: Number(number), choices } as ImportSelection;
        });
        await sealStaffImport(db, session, {
          ...command,
          digest: one(data, "digest"),
          planDigest: one(data, "planDigest"),
          selection,
        });
      } else if (intent === "execute") await executeStaffImport(db, session, command);
      else if (intent === "cancel" || intent === "reverse") {
        if (one(data, "confirmed") !== "reviewed") throw new AppError("validation_failed");
        if (intent === "cancel") await cancelStaffImport(db, session, command);
        else await reverseStaffImport(db, session, command);
      } else throw new AppError("validation_failed");
    },
    { requireSession: true },
  );
  redirect(
    `/${locale}/operations/imports${safeId ? `?review=${safeId}${result.ok ? "" : `&problem=${result.error.code === "VALIDATION_FAILED" ? "review" : "unknown"}`}` : ""}`,
  );
}
