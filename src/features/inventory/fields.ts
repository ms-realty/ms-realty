// O11/O12 draft fields shared by the editor (client) and the listing page (server).
import {
  areaBases,
  factStates,
  listingPurposes,
  propertyTypes,
  sourceClasses,
} from "@/domain/facts";
import type { inventoryCopy } from "./copy";

export type InventoryValues = Record<keyof ReturnType<typeof inventoryCopy>["labels"], string>;
export type InventoryField = keyof InventoryValues;
type Field = InventoryField;
export const selects: Partial<Record<Field, readonly string[]>> = {
  propertyType: propertyTypes,
  purpose: listingPurposes,
  country: ["BG", "GR"],
  priceState: factStates,
  areaState: factStates,
  areaBasis: areaBases,
  bedroomsState: factStates,
  sourceClass: sourceClasses,
  sourceLanguage: ["bg", "en", "ru", "de", "nl", "el", "he"],
};
export const identity: Field[] = [
  "propertyType",
  "purpose",
  "country",
  "region",
  "settlement",
  "exactAddress",
];
export const textFields: Field[] = ["title", "description"];
/** Required draft fields a broker may have to supply before the first save. */
const requiredInput: Field[] = ["sourceReference", "sourceClass", "sourceLanguage", "areaBasis"];

/** Fields an existing listing's draft cannot save until a broker fills or corrects them. */
export function missingInput(values: InventoryValues): Field[] {
  return requiredInput.filter((name) => {
    const options = selects[name];
    return options ? !options.includes(values[name]) : !values[name]?.trim();
  });
}
