import type { PublicLocale } from "@/domain/ids";

// Private workflow drafts; these labels grant no decision or publication authority.
const copy: Record<PublicLocale, { open: string; submit: string }> = {
  bg: { open: "Предлагане на изменени условия", submit: "Изпращане на насрещно предложение" },
  en: { open: "Propose revised terms", submit: "Submit counteroffer" },
  ru: { open: "Предложить изменённые условия", submit: "Отправить встречное предложение" },
  de: { open: "Geänderte Bedingungen vorschlagen", submit: "Gegenangebot einreichen" },
  nl: { open: "Gewijzigde voorwaarden voorstellen", submit: "Tegenvoorstel indienen" },
  el: { open: "Πρόταση αλλαγής όρων", submit: "Υποβολή αντιπρότασης" },
  he: { open: "הצעת תנאים מתוקנים", submit: "שליחת הצעה נגדית" },
};

export const counterofferCopy = (locale: PublicLocale) => copy[locale];
