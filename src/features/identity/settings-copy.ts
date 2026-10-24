import type { StaffLocale } from "@/i18n/config";
import bg from "../../../messages/staff/bg/workspace.json";
import en from "../../../messages/staff/en/workspace.json";
import ru from "../../../messages/staff/ru/workspace.json";
export type SettingsCopy = typeof en.personalSettings;
const copy: Record<StaffLocale, SettingsCopy> = {
  bg: bg.personalSettings,
  en: en.personalSettings,
  ru: ru.personalSettings,
};
export const settingsCopy = (locale: StaffLocale): SettingsCopy => copy[locale];
