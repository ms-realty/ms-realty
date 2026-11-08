import type { FormCopy } from "@/ui/form/contract";
import { workflowCopy } from "./workflow-copy";

// Private interface copy. AI language review grants no publication or indexability approval.
export const formCopy = (locale: string): FormCopy => workflowCopy(locale, "form");
export const workflowAuthCopy = (locale: string) => workflowCopy(locale, "workflowAuth");
