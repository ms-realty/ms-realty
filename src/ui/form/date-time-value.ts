import { readDateTimeEntry } from "@/domain/time";
import { agencyTimeZone } from "@/i18n/config";

/** Adopt native edits without replacing an exact logical instant with its displayed minute. */
export function nativeTimeValue(form: HTMLFormElement, control: HTMLInputElement): string | null {
  if (control.type !== "datetime-local") return null;
  const marker = form.elements.namedItem(`${control.name}WallTime`);
  if (!(marker instanceof HTMLInputElement) || marker.value !== "yes") return null;
  const occurrence = form.elements.namedItem(`${control.name}Occurrence`);
  const original = form.elements.namedItem(`${control.name}Original`);
  const read = readDateTimeEntry(
    control.value,
    agencyTimeZone,
    occurrence instanceof HTMLSelectElement ? occurrence.value : "",
    original instanceof HTMLInputElement ? original.value : "",
  );
  return read.ok ? read.instant : control.value;
}
