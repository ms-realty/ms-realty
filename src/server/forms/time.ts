import "server-only";
import { readDateTimeEntry } from "@/domain/time";
import { agencyTimeZone } from "@/i18n/config";
import type { FormValues } from "@/ui/form/contract";
import { readFormValues } from "@/ui/form/server";
import { AppError } from "../errors";

/** Preserve the chosen occurrence in the existing field value through validation and reapply. */
export function readTimeFormValues<V extends FormValues>(
  data: FormData,
  fields: readonly (keyof V)[],
): V {
  const values = readFormValues<V>(data, fields);
  for (const field of fields) {
    const name = String(field);
    if (data.get(`${name}WallTime`) !== "yes" || !values[field]) continue;
    const one = (suffix: string) => {
      const entries = data.getAll(`${name}${suffix}`);
      return entries.length === 0
        ? ""
        : entries.length === 1 && typeof entries[0] === "string"
          ? entries[0]
          : "invalid";
    };
    const occurrence = one("Occurrence"),
      original = one("Original");
    if (
      occurrence === "invalid" ||
      original === "invalid" ||
      data.getAll(`${name}WallTime`).length !== 1
    ) {
      values[field] = "invalid" as V[keyof V];
      continue;
    }
    const read = readDateTimeEntry(values[field] as string, agencyTimeZone, occurrence, original);
    if (read.ok) values[field] = read.instant as V[keyof V];
  }
  return values;
}

/** Called inside the authenticated action; invalid local times never reach a command. */
export function formInstant(values: FormValues, name: string): string {
  const value = values[name] ?? "";
  if (!value) return "";
  const read = readDateTimeEntry(value, agencyTimeZone);
  if (!read.ok) throw new AppError("validation_failed", { fieldErrors: { [name]: [read.reason] } });
  return read.instant;
}
