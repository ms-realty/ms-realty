// Interface copy only. Listing prose still comes from an approved locale manifest.

import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/discovery.json" with { type: "json" };
import de from "../../../messages/de/discovery.json" with { type: "json" };
import el from "../../../messages/el/discovery.json" with { type: "json" };
import en from "../../../messages/en/discovery.json" with { type: "json" };
import he from "../../../messages/he/discovery.json" with { type: "json" };
import nl from "../../../messages/nl/discovery.json" with { type: "json" };
import ru from "../../../messages/ru/discovery.json" with { type: "json" };

const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });

type Section =
  | "serviceIntake"
  | "contentLabels"
  | "inquiryPhotos"
  | "propertyFacts"
  | "searchAlerts"
  | "searchAlertStatus";
export type DiscoveryCopy = Omit<typeof bg, Section>;
export function discoveryCopy(locale: PublicLocale): DiscoveryCopy {
  const {
    serviceIntake: _serviceIntake,
    contentLabels: _contentLabels,
    inquiryPhotos: _inquiryPhotos,
    propertyFacts: _propertyFacts,
    searchAlerts: _searchAlerts,
    searchAlertStatus: _searchAlertStatus,
    ...copy
  } = copyFor(locale);
  return copy;
}
export const publicContentCopy = (locale: PublicLocale) => copyFor(locale).contentLabels;
export const inquiryPhotosCopy = (locale: PublicLocale) => copyFor(locale).inquiryPhotos;
export const propertyFactsCopy = (locale: PublicLocale) => copyFor(locale).propertyFacts;
export const searchAlertsCopy = (locale: PublicLocale) => copyFor(locale).searchAlerts;
export const searchAlertStatusesCopy = (locale: PublicLocale) => copyFor(locale).searchAlertStatus;
