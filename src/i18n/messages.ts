// Message catalogs, one JSON file per namespace (ux-spec §19.1). Bulgarian is the source:
// types come from messages/bg and messages/staff/bg; messages.test.ts checks that these lists
// match the files on disk and that every locale has the source's keys.
//   messages/<locale>/<namespace>.json        public and client hosts, seven locales
//   messages/staff/<locale>/<namespace>.json  staff host only, bg/en/ru

import type a11y from "../../messages/bg/a11y.json";
import type caseReview from "../../messages/bg/caseReview.json";
import type common from "../../messages/bg/common.json";
import type discovery from "../../messages/bg/discovery.json";
import type errors from "../../messages/bg/errors.json";
import type footer from "../../messages/bg/footer.json";
import type forms from "../../messages/bg/forms.json";
import type intent from "../../messages/bg/intent.json";
import type legacyArchive from "../../messages/bg/legacy-archive.json";
import type map from "../../messages/bg/map.json";
import type nav from "../../messages/bg/nav.json";
import type privacy from "../../messages/bg/privacy.json";
import type privacyExportClient from "../../messages/bg/privacy-export.json";
import type server from "../../messages/bg/server.json";
import type states from "../../messages/bg/states.json";
import type workflow from "../../messages/bg/workflow.json";
import type agency from "../../messages/staff/bg/agency.json";
import type auditHistory from "../../messages/staff/bg/auditHistory.json";
import type calendar from "../../messages/staff/bg/calendar.json";
import type caseDirectory from "../../messages/staff/bg/caseDirectory.json";
import type dataReview from "../../messages/staff/bg/dataReview.json";
import type duplicateMerge from "../../messages/staff/bg/duplicateMerge.json";
import type operatingPolicy from "../../messages/staff/bg/operatingPolicy.json";
import type operations from "../../messages/staff/bg/operations.json";
import type privacyErasure from "../../messages/staff/bg/privacyErasure.json";
import type privacyExportStaff from "../../messages/staff/bg/privacyExport.json";
import type privacyGovernance from "../../messages/staff/bg/privacyGovernance.json";
import type serverStaff from "../../messages/staff/bg/serverStaff.json";
import type settingsScopes from "../../messages/staff/bg/settingsScopes.json";
import type tools from "../../messages/staff/bg/tools.json";
import type workspace from "../../messages/staff/bg/workspace.json";
import type workspaceStates from "../../messages/staff/bg/workspaceStates.json";
import { isStaffLocale, type PublicLocale } from "./config";

export const publicNamespaces = [
  "caseReview",
  "a11y",
  "common",
  "discovery",
  "errors",
  "footer",
  "forms",
  "intent",
  "legacy-archive",
  "map",
  "nav",
  "privacy",
  "privacy-export",
  "server",
  "states",
  "workflow",
] as const;
/** `serverStaff` overrides `server` entries whose staff wording differs (no email sign-in). */
export const staffNamespaces = [
  "agency",
  "duplicateMerge",
  "calendar",
  "caseDirectory",
  "serverStaff",
  "tools",
  "workspace",
  "workspaceStates",
  "operations",
  "dataReview",
  "auditHistory",
  "privacyExport",
  "privacyErasure",
  "operatingPolicy",
  "settingsScopes",
  "privacyGovernance",
] as const;

export interface PublicMessages {
  caseReview: typeof caseReview;
  a11y: typeof a11y;
  common: typeof common;
  discovery: typeof discovery;
  errors: typeof errors;
  footer: typeof footer;
  forms: typeof forms;
  intent: typeof intent;
  "legacy-archive": typeof legacyArchive;
  map: typeof map;
  nav: typeof nav;
  privacy: typeof privacy;
  "privacy-export": typeof privacyExportClient;
  server: typeof server;
  states: typeof states;
  workflow: typeof workflow;
}
export interface StaffMessages {
  agency: typeof agency;
  duplicateMerge: typeof duplicateMerge;
  calendar: typeof calendar;
  caseDirectory: typeof caseDirectory;
  auditHistory: typeof auditHistory;
  operations: typeof operations;
  operatingPolicy: typeof operatingPolicy;
  settingsScopes: typeof settingsScopes;
  privacyGovernance: typeof privacyGovernance;
  privacyExport: typeof privacyExportStaff;
  privacyErasure: typeof privacyErasure;
  dataReview: typeof dataReview;
  serverStaff: typeof serverStaff;
  tools: typeof tools;
  workspace: typeof workspace;
  workspaceStates: typeof workspaceStates;
}
/** Staff namespaces are present only for staff locales (bg, en, ru). */
export type Messages = PublicMessages & StaffMessages;

async function loadPublic(locale: PublicLocale) {
  const entries = await Promise.all(
    publicNamespaces.map(
      async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries) as PublicMessages;
}

async function loadStaff(locale: PublicLocale) {
  if (!isStaffLocale(locale)) return {};
  const entries = await Promise.all(
    staffNamespaces.map(
      async (ns) =>
        [ns, (await import(`../../messages/staff/${locale}/${ns}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries) as Partial<StaffMessages>;
}

/** Server-only: catalogs are never sent to the browser as a whole. */
export async function loadMessages(locale: PublicLocale): Promise<Messages> {
  const [publicMessages, staffMessages] = await Promise.all([
    loadPublic(locale),
    loadStaff(locale),
  ]);
  return { ...publicMessages, ...staffMessages } as Messages;
}
