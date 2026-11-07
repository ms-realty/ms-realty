import { isPublicLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";

// Only the client proposal response is admitted. Other proposal forms remain local drafts.
export const proposalReauthCopy = (locale: string) =>
  workflowCopy(isPublicLocale(locale) ? locale : "bg", "proposalReauth");
