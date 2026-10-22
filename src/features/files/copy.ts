import { workflowCopy } from "@/i18n/workflow-copy";

type FileCopy = ReturnType<typeof filesCopy>;
export const filesCopy = (locale: string) => workflowCopy(locale, "files");
/** Fills `{name}` placeholders; values are already display text. */
export function fillCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
export function fileLabel(copy: FileCopy, value: string) {
  return value === "expired" ? copy.expiredDocument : (copy[value as keyof FileCopy] ?? value);
}
export function fileError(copy: FileCopy, code: string | undefined) {
  return code === "REVISION_CONFLICT"
    ? copy.conflict
    : code === "DEPENDENCY_UNAVAILABLE"
      ? copy.unavailable
      : copy.error;
}
