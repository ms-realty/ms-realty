import { isPublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/caseReview.json" with { type: "json" };
import de from "../../../messages/de/caseReview.json" with { type: "json" };
import el from "../../../messages/el/caseReview.json" with { type: "json" };
import en from "../../../messages/en/caseReview.json" with { type: "json" };
import he from "../../../messages/he/caseReview.json" with { type: "json" };
import nl from "../../../messages/nl/caseReview.json" with { type: "json" };
import ru from "../../../messages/ru/caseReview.json" with { type: "json" };
import agencyBg from "../../../messages/staff/bg/agency.json" with { type: "json" };
import agencyEn from "../../../messages/staff/en/agency.json" with { type: "json" };
import agencyRu from "../../../messages/staff/ru/agency.json" with { type: "json" };

export const agencyCopy = (locale: string): typeof agencyBg =>
  ({ bg: agencyBg, en: agencyEn, ru: agencyRu })[locale] ?? agencyEn;
export const caseReviewCopy = (locale: string): typeof bg =>
  ({ bg, en, ru, de, nl, el, he })[isPublicLocale(locale) ? locale : "bg"];
