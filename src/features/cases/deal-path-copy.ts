import { isPublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/dealPath.json" with { type: "json" };
import de from "../../../messages/de/dealPath.json" with { type: "json" };
import el from "../../../messages/el/dealPath.json" with { type: "json" };
import en from "../../../messages/en/dealPath.json" with { type: "json" };
import he from "../../../messages/he/dealPath.json" with { type: "json" };
import nl from "../../../messages/nl/dealPath.json" with { type: "json" };
import ru from "../../../messages/ru/dealPath.json" with { type: "json" };
import agreementBg from "../../../messages/staff/bg/dealAgreement.json" with { type: "json" };
import staffBg from "../../../messages/staff/bg/dealPathStaff.json" with { type: "json" };
import agreementEn from "../../../messages/staff/en/dealAgreement.json" with { type: "json" };
import staffEn from "../../../messages/staff/en/dealPathStaff.json" with { type: "json" };
import agreementRu from "../../../messages/staff/ru/dealAgreement.json" with { type: "json" };
import staffRu from "../../../messages/staff/ru/dealPathStaff.json" with { type: "json" };

const catalogs = { bg, en, ru, de, nl, el, he };

/** Staff copy for agreeing terms, adding a home and making a proposal (ADR 0015; bg, en, ru). */
export function dealAgreementCopy(locale: string): typeof agreementEn {
  return locale === "bg" ? agreementBg : locale === "ru" ? agreementRu : agreementEn;
}

/** Deal path copy for clients and staff. Catalog drafts; placement grants no language approval. */
export function dealPathCopy(locale: string): typeof bg {
  return catalogs[isPublicLocale(locale) ? locale : "en"];
}

/** Staff-only Deal path actions (bg, en, ru). */
export function dealPathStaffCopy(locale: string): typeof staffBg {
  return locale === "bg" ? staffBg : locale === "ru" ? staffRu : staffEn;
}

export type DealPathStepKey = keyof typeof bg.steps;

/** A step's label and one-sentence explanation; an unknown stored key reads as recorded. */
export function stepCopy(locale: string, key: string) {
  const steps: Record<string, { label: string; about: string } | undefined> =
    dealPathCopy(locale).steps;
  return steps[key] ?? { label: key, about: "" };
}
