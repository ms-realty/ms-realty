// Draft staff-only catalogs; their presence grants no human/public translation approval.
import bg from "../../../messages/staff/bg/dataReview.json" with { type: "json" };
import en from "../../../messages/staff/en/dataReview.json" with { type: "json" };
import ru from "../../../messages/staff/ru/dataReview.json" with { type: "json" };
import { importExecutionCopy } from "./execution-copy";
export const dataReviewCopy = (locale: string) => {
  const copy = { bg, en, ru }[locale as "bg" | "en" | "ru"] ?? bg;
  const execution = importExecutionCopy(locale);
  return {
    ...copy,
    imports: {
      ...copy.imports,
      boundary: execution.boundary,
      intro: execution.intro,
      limited: execution.limited,
    },
  };
};
