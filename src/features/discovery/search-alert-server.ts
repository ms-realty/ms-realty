import "server-only";
import { randomUUID } from "node:crypto";
import type { Session } from "@/server/auth/sessions";
import { hashRequest } from "@/server/crypto";
import type { FormState } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import type { AlertSearch, SearchAlertValues } from "./search-alert-state";

export function searchAlertScope(
  session: Session,
  search: AlertSearch,
  termsVersionId: string,
  operationId: string,
) {
  return `preferences.search.create:${session.id}:${operationId}:${hashRequest({ search: search.input, termsVersionId })}`;
}
export function initialSearchAlertState(
  session: Session,
  search: AlertSearch,
  termsVersionId: string,
  timezone: string,
): FormState<SearchAlertValues> {
  // The existing preference command takes a UUID. A separate issued form proof binds it
  // to this session, reviewed search and terms; it is not recipient authorization.
  const operationId = randomUUID();
  return {
    operationId,
    expectedRevision: null,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
    values: {
      contactMethodId: "",
      frequency: "daily",
      timezone,
      confirmed: "",
      proof: issueFormOperation(searchAlertScope(session, search, termsVersionId, operationId)),
    },
  };
}
