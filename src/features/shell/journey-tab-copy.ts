import type { PublicLocale } from "@/i18n/config";

// C03 compact task labels. BG source; these interface translations remain human-review drafts.
export const journeyTabLabels = {
  bg: {
    overview: "Начало",
    properties: "Имоти",
    appointments: "Срещи",
    messages: "Чат",
    account: "Профил",
  },
  en: {
    overview: "Home",
    properties: "Property",
    appointments: "Agenda",
    messages: "Chat",
    account: "Account",
  },
  ru: {
    overview: "Обзор",
    properties: "Объекты",
    appointments: "Планы",
    messages: "Чат",
    account: "Профиль",
  },
  de: {
    overview: "Start",
    properties: "Objekte",
    appointments: "Termine",
    messages: "Chat",
    account: "Konto",
  },
  nl: {
    overview: "Start",
    properties: "Aanbod",
    appointments: "Agenda",
    messages: "Chat",
    account: "Account",
  },
  el: {
    overview: "Αρχή",
    properties: "Ακίνητα",
    appointments: "Ραντεβού",
    messages: "Συνομιλία",
    account: "Προφίλ",
  },
  he: {
    overview: "ראשי",
    properties: "נכסים",
    appointments: "פגישות",
    messages: "צ׳אט",
    account: "חשבון",
  },
} satisfies Record<
  PublicLocale,
  Record<"overview" | "properties" | "appointments" | "messages" | "account", string>
>;
