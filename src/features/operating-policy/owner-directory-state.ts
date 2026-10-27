import type { PolicyFormValues } from "@/domain/operating-policy-form";
import type { FormState } from "@/ui/form/contract";

export type PolicyDraftValues = PolicyFormValues & { ownerSearch: string };
export type PolicyOwnerChoice = { id: string; displayName: string };
export type PolicyOwnerDirectory = {
  rows: PolicyOwnerChoice[];
  page: number;
  search: string;
  hasMore: boolean;
};
export type PolicyDraftState = FormState<PolicyDraftValues> & {
  ownerDirectory?: PolicyOwnerDirectory;
  ownerChoices?: PolicyOwnerChoice[];
};
