import type { StaffLocale } from "@/i18n/config";
import bg from "../../../messages/staff/bg/operatingPolicy.json" with { type: "json" };
import en from "../../../messages/staff/en/operatingPolicy.json" with { type: "json" };
import ru from "../../../messages/staff/ru/operatingPolicy.json" with { type: "json" };
export type OperatingPolicyCopy = typeof bg;
const catalogs: Record<StaffLocale, OperatingPolicyCopy> = { bg, en, ru };
export const operatingPolicyCopy = (locale: StaffLocale) => catalogs[locale];
