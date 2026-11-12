// One-decision publishing copy (ADR 0012), from the staff catalogs. Placeholders are filled by
// fillCopy; values are already display text.
import { sourceLocale } from "@/config/tenant";
import bg from "../../../messages/staff/bg/publishing.json" with { type: "json" };
import en from "../../../messages/staff/en/publishing.json" with { type: "json" };
import ru from "../../../messages/staff/ru/publishing.json" with { type: "json" };

export type PublishCopy = typeof bg;

export const publishCopy = (locale: string): PublishCopy =>
  ({ bg, en, ru })[locale as "bg" | "en" | "ru"] ?? en;

/** A language's name in the staff language ("English", "английски", "английский"). */
export function languageName(staffLocale: string, code: string): string {
  try {
    return new Intl.DisplayNames([staffLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The per-language attestation, exactly as the person saw it. */
export function languageAttestation(staffLocale: string, code: string): string {
  return fillCopy(publishCopy(staffLocale).languages.attest, {
    language: languageName(staffLocale, code),
  });
}

/** A publishing blocker or stop reason in the person's words. */
export function blockReason(locale: string, reason: string): string {
  const copy = publishCopy(locale);
  return fillCopy(
    (copy.blockers as Record<string, string>)[reason] ??
      (copy.reasons as Record<string, string>)[reason] ??
      copy.reasons.other,
    // The brand's source language, named in the staff language.
    { language: languageName(locale, sourceLocale) },
  );
}

export function fillCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
