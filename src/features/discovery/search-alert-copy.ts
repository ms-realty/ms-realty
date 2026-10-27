import { defaultLocale, isPublicLocale } from "@/i18n/config";
import { searchAlertStatusesCopy, searchAlertsCopy } from "./copy";

export const searchAlertCopyLocale = (locale: string) =>
  isPublicLocale(locale) ? locale : defaultLocale;
export const searchAlertCopy = (locale: string) => searchAlertsCopy(searchAlertCopyLocale(locale));
export const searchAlertStatusCopy = (locale: string) =>
  searchAlertStatusesCopy(searchAlertCopyLocale(locale));
