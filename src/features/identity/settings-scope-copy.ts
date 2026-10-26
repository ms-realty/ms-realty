import { settingsResourceKeys, settingsResources } from "@/domain/settings-resources";
import type { StaffLocale } from "@/i18n/config";
import bg from "../../../messages/staff/bg/settingsScopes.json" with { type: "json" };
import en from "../../../messages/staff/en/settingsScopes.json" with { type: "json" };
import ru from "../../../messages/staff/ru/settingsScopes.json" with { type: "json" };

const catalogs = { bg, en, ru };
export const settingsScopeCopy = (locale: StaffLocale) => catalogs[locale];
export function settingsResourceLabel(locale: StaffLocale, id: string | null) {
  const copy = catalogs[locale],
    key = settingsResourceKeys.find((key) => settingsResources[key] === id);
  return key ? `${copy.settings} · ${copy.options[key]}` : copy.settings;
}
