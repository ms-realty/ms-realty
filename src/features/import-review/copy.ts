// Draft staff-only catalogs; their presence grants no human/public translation approval.
import bg from "../../../messages/staff/bg/dataReview.json";
import en from "../../../messages/staff/en/dataReview.json";
import ru from "../../../messages/staff/ru/dataReview.json";
export const dataReviewCopy = (locale: string) =>
  ({ bg, en, ru })[locale as "bg" | "en" | "ru"] ?? bg;
