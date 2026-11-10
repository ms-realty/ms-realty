// Wording for Butler answers on a listing page (ADR 0017): the block's interface text and the
// fixed answer and refusal sentences, in all seven public locales. Catalog drafts; placing a
// message here grants no language approval (messages/_status.json).
import { createTranslator } from "next-intl";
import type { PublicLocale } from "@/domain/ids";
import bg from "../../../messages/bg/butlerAnswers.json" with { type: "json" };
import de from "../../../messages/de/butlerAnswers.json" with { type: "json" };
import el from "../../../messages/el/butlerAnswers.json" with { type: "json" };
import en from "../../../messages/en/butlerAnswers.json" with { type: "json" };
import he from "../../../messages/he/butlerAnswers.json" with { type: "json" };
import nl from "../../../messages/nl/butlerAnswers.json" with { type: "json" };
import ru from "../../../messages/ru/butlerAnswers.json" with { type: "json" };
import staffBg from "../../../messages/staff/bg/visitorQuestions.json" with { type: "json" };
import staffEn from "../../../messages/staff/en/visitorQuestions.json" with { type: "json" };
import staffRu from "../../../messages/staff/ru/visitorQuestions.json" with { type: "json" };

const catalogs = { bg, en, ru, de, nl, el, he } as const;
export type ButlerAnswersCopy = typeof bg;

export function butlerAnswersCopy(locale: PublicLocale): ButlerAnswersCopy {
  return catalogs[locale];
}

/** ICU formatting (plurals) of one butlerAnswers message. */
export function butlerAnswerText(
  locale: PublicLocale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const t = createTranslator({
    locale,
    messages: { butlerAnswers: catalogs[locale] },
    namespace: "butlerAnswers",
  });
  return (t as unknown as (key: string, values: object) => string)(key, values);
}

/** Staff list wording (bg, en, ru). */
export function visitorQuestionsCopy(locale: string): typeof staffBg {
  return locale === "bg" ? staffBg : locale === "ru" ? staffRu : staffEn;
}

/** Fills `{name}` placeholders of a plain (non-plural) message. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
