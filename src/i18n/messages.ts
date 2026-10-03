// Message catalogs, one JSON file per namespace (ux-spec §19.1). Bulgarian is the source:
// types come from messages/bg and messages/staff/bg; messages.test.ts checks that these lists
// match the files on disk and that every locale has the source's keys.
//   messages/<locale>/<namespace>.json        public and client hosts, seven locales
//   messages/staff/<locale>/<namespace>.json  staff host only, bg/en/ru
import type a11y from "../../messages/bg/a11y.json";
import type common from "../../messages/bg/common.json";
import type errors from "../../messages/bg/errors.json";
import type footer from "../../messages/bg/footer.json";
import type forms from "../../messages/bg/forms.json";
import type nav from "../../messages/bg/nav.json";
import type states from "../../messages/bg/states.json";
import type workspace from "../../messages/staff/bg/workspace.json";
import { isStaffLocale, type PublicLocale } from "./config";

export const publicNamespaces = [
  "a11y",
  "common",
  "errors",
  "footer",
  "forms",
  "nav",
  "states",
] as const;
export const staffNamespaces = ["workspace"] as const;

export interface PublicMessages {
  a11y: typeof a11y;
  common: typeof common;
  errors: typeof errors;
  footer: typeof footer;
  forms: typeof forms;
  nav: typeof nav;
  states: typeof states;
}
export interface StaffMessages {
  workspace: typeof workspace;
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
  const [publicMessages, staffMessages] = await Promise.all([loadPublic(locale), loadStaff(locale)]);
  return { ...publicMessages, ...staffMessages } as Messages;
}
