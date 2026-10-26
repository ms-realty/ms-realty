// Staff-only review copy; these drafts do not approve public translations.
import bg from "../../../messages/staff/bg/duplicateMerge.json" with { type: "json" };
import en from "../../../messages/staff/en/duplicateMerge.json" with { type: "json" };
import ru from "../../../messages/staff/ru/duplicateMerge.json" with { type: "json" };
export const duplicateMergeCopy = (locale: string) =>
  ({ bg, en, ru })[locale as "bg" | "en" | "ru"] ?? bg;
