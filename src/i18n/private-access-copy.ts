import bg from "../../messages/bg/a11y.json";
import de from "../../messages/de/a11y.json";
import el from "../../messages/el/a11y.json";
import en from "../../messages/en/a11y.json";
import he from "../../messages/he/a11y.json";
import nl from "../../messages/nl/a11y.json";
import ru from "../../messages/ru/a11y.json";

const catalogs = { bg, en, ru, de, nl, el, he };
export function privateAccessCopy(locale: string) {
  return (catalogs[locale as keyof typeof catalogs] ?? en).privateAccess;
}
