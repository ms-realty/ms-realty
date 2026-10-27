import bg from "../../../messages/staff/bg/workflowCompletion.json" with { type: "json" };
import en from "../../../messages/staff/en/workflowCompletion.json" with { type: "json" };
import ru from "../../../messages/staff/ru/workflowCompletion.json" with { type: "json" };
/** Staff-only drafts; no public language or indexability approval. */
export const staffWorkflowCopy = (locale: string) =>
  locale === "ru" ? ru : locale === "en" ? en : bg;
