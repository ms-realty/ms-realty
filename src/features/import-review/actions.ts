"use server";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { type ColumnMapping, CsvError, importFields } from "@/server/import-review/csv";
import {
  checkImportPreview,
  importReviewer,
  startImportPreview,
} from "@/server/import-review/preview";
import type { ImportReviewState } from "./state";

function one(data: FormData, key: string) {
  const values = data.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") throw new CsvError("format");
  return values[0];
}
export async function importReviewAction(
  locale: string,
  _previous: ImportReviewState,
  data: FormData,
): Promise<ImportReviewState> {
  const result = await action(
    async ({ db, session }) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!session) throw new AppError("unauthenticated");
      await importReviewer(db, session);
      try {
        const intent = one(data, "intent");
        if (intent === "upload") {
          const files = data.getAll("file");
          const file = files[0];
          if (files.length !== 1 || !file || typeof file === "string") throw new CsvError("format");
          const delimiter = one(data, "delimiter");
          if (delimiter !== "," && delimiter !== ";") throw new CsvError("format");
          const source = await startImportPreview(db, session, file, delimiter);
          return { stage: "mapping", source } as ImportReviewState;
        }
        if (intent !== "check") throw new CsvError("format");
        const mapping = Object.fromEntries(
          importFields.map((field) => {
            const value = one(data, `column.${field}`);
            if (value !== "" && !/^(0|[1-9]\d?)$/u.test(value)) throw new CsvError("format");
            return [field, value === "" ? null : Number(value)];
          }),
        ) as ColumnMapping;
        const checked = await checkImportPreview(db, session, one(data, "source"), mapping);
        return {
          stage: "problems",
          source: { ...checked, mapping },
          rows: checked.rows,
        } as ImportReviewState;
      } catch (error) {
        if (error instanceof CsvError)
          return { stage: "choose", error: error.reason } as ImportReviewState;
        throw error;
      }
    },
    { requireSession: true },
  );
  return result.ok ? result.data : { stage: "choose", error: "failure" };
}
