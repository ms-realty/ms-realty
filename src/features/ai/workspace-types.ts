import type { readWorkspace } from "@/server/ai/workspace";

export type WorkspaceView = Awaited<ReturnType<typeof readWorkspace>>;
export type WorkspaceMode = "create" | "message" | "research" | "cancel" | "revise" | "materialize";
export type WorkspaceValues = {
  goal: string;
  constraints: string;
  caseId: string;
  inquiryId: string;
  listingIds: string;
  message: string;
  reviewed: string;
  acknowledgeUnknown: string;
  title: string;
  body: string;
  requirements: string;
  preferences: string;
  parent: string;
};
export interface ContextChoice {
  id: string;
  reference: string;
  title: string;
}
export interface WorkspaceChoices {
  cases: ContextChoice[];
  inquiries: ContextChoice[];
  listings: ContextChoice[];
}
export interface WorkspaceParent {
  type: "case" | "inquiry";
  id: string;
  expectedVersion: number;
  label: string;
}
export const workspaceFields: (keyof WorkspaceValues)[] = [
  "goal",
  "constraints",
  "caseId",
  "inquiryId",
  "listingIds",
  "message",
  "reviewed",
  "acknowledgeUnknown",
  "title",
  "body",
  "requirements",
  "preferences",
  "parent",
];
export const emptyWorkspaceValues: WorkspaceValues = {
  goal: "",
  constraints: "",
  caseId: "",
  inquiryId: "",
  listingIds: "",
  message: "",
  reviewed: "",
  acknowledgeUnknown: "",
  title: "",
  body: "",
  requirements: "",
  preferences: "",
  parent: "none",
};
export function workspaceScope(mode: WorkspaceMode, id: string, artifactId?: string) {
  return "workspace." + mode + "." + id + (artifactId ? "." + artifactId : "");
}
export function workspaceHref(locale: string, id?: string) {
  return "/" + locale + "/operations/assistance/research" + (id ? "/" + id : "");
}
