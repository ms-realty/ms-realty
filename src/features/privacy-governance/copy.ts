import type { StaffLocale } from "@/i18n/config";
import bg from "../../../messages/staff/bg/privacyGovernance.json" with { type: "json" };
import en from "../../../messages/staff/en/privacyGovernance.json" with { type: "json" };
import ru from "../../../messages/staff/ru/privacyGovernance.json" with { type: "json" };
export type GovernanceCopy = typeof bg;
const catalogs: Record<StaffLocale, GovernanceCopy> = { bg, en, ru };
export const governanceCopy = (locale: StaffLocale) => catalogs[locale];
