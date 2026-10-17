import "server-only";
import { z } from "zod";
import { publicLocales } from "@/domain/ids";
import type { OutboundMessage } from "../jobs/provider";

export const alertTemplateVersion = "search-alerts.v1" as const;
export const alertTemplate = "search_alerts.digest.v1" as const;
export const alertSubjectType = "search_alert_digest" as const;
export const maxDigestItems = 20;

export const alertItem = z
  .object({
    listingId: z.uuid(),
    listingRevisionId: z.uuid(),
    manifestId: z.uuid(),
    reference: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    title: z.string().max(1000).nullable(),
    sourceUrl: z.url(),
    match: z.enum(["match", "needs_confirmation"]),
    unconfirmed: z.array(z.string().max(100)).max(25),
  })
  .strict();
export const alertDigest = z
  .object({
    schemaVersion: z.literal(1),
    subscriptionVersion: z.number().int().positive(),
    ruleApprovalId: z.uuid(),
    ruleHash: z.string().regex(/^[a-f0-9]{64}$/),
    contactMethodId: z.uuid(),
    contactVersion: z.number().int().positive(),
    policyVersion: z.string().max(300),
    templateVersion: z.literal(alertTemplateVersion),
    criteriaSnapshot: z.record(z.string(), z.unknown()),
    criteriaHash: z.string().regex(/^[a-f0-9]{64}$/),
    locale: z.enum(publicLocales),
    timezone: z.string().max(100),
    frequency: z.enum(["daily", "weekly"]),
    period: z.string().regex(/^(day|week):\d{4}-\d{2}-\d{2}$/),
    plannedAt: z.iso.datetime(),
    preferencesUrl: z.url(),
    scanIncomplete: z.boolean(),
    items: z.array(alertItem).min(1).max(maxDigestItems),
  })
  .strict();
export const alertPayload = z
  .object({
    channel: z.literal("email"),
    recipient: z.email(),
    template: z.literal(alertTemplate),
    params: z.object({ digest: alertDigest }).strict(),
  })
  .strict();
export type AlertItem = z.infer<typeof alertItem>;
export type AlertDigest = z.infer<typeof alertDigest>;
export type AlertPayload = z.infer<typeof alertPayload>;

export const alertTemplateCopy = {
  bg: [
    "Обновления по запазеното търсене",
    "Прегледайте актуалните данни в обявата.",
    "Някои критерии изискват потвърждение.",
    "Управление, пауза или отказ от известия:",
  ],
  en: [
    "Saved search updates",
    "Check the listing for current details.",
    "Some criteria need confirmation.",
    "Manage, pause or withdraw alerts:",
  ],
  ru: [
    "Обновления сохранённого поиска",
    "Проверьте актуальные сведения в объявлении.",
    "Некоторые критерии требуют подтверждения.",
    "Настроить, приостановить или отключить уведомления:",
  ],
  de: [
    "Neuigkeiten zur gespeicherten Suche",
    "Aktuelle Angaben finden Sie im Inserat.",
    "Einige Kriterien müssen bestätigt werden.",
    "Benachrichtigungen verwalten, pausieren oder abbestellen:",
  ],
  nl: [
    "Updates voor uw opgeslagen zoekopdracht",
    "Bekijk de advertentie voor actuele informatie.",
    "Sommige criteria moeten worden bevestigd.",
    "Meldingen beheren, pauzeren of stopzetten:",
  ],
  el: [
    "Ενημερώσεις αποθηκευμένης αναζήτησης",
    "Ελέγξτε την αγγελία για τα τρέχοντα στοιχεία.",
    "Ορισμένα κριτήρια χρειάζονται επιβεβαίωση.",
    "Διαχείριση, παύση ή διακοπή ειδοποιήσεων:",
  ],
  he: [
    "עדכונים לחיפוש השמור",
    "בדקו את הפרטים העדכניים במודעה.",
    "חלק מהקריטריונים דורשים אישור.",
    "ניהול, השהיה או ביטול התראות:",
  ],
} as const;

export function listingAlertUrl(origin: string, locale: string, reference: string): string {
  return new URL(
    `/${locale}/properties/${encodeURIComponent(reference)}/${encodeURIComponent(reference.toLowerCase())}`,
    origin,
  ).href;
}
export function alertPreferencesUrl(origin: string, locale: string): string {
  return new URL(`/${locale}/preferences`, origin).href;
}
const oneLine = (value: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip source line and bidi controls from plaintext digest entries.
  value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim();

/** Fixed plaintext only. No HTML, arbitrary subject/body, external links or provider markup. */
export function renderSearchAlert(
  message: OutboundMessage,
  hosts: { public: string; client: string },
): { subject: string; text: string } | null {
  const parsed = alertPayload.safeParse({
    channel: message.channel,
    recipient: message.recipient,
    template: message.template,
    params: message.params,
  });
  if (!parsed.success || message.secretParams) return null;
  const digest = parsed.data.params.digest;
  if (digest.preferencesUrl !== alertPreferencesUrl(hosts.client, digest.locale)) return null;
  if (
    digest.items.some(
      (item) => item.sourceUrl !== listingAlertUrl(hosts.public, digest.locale, item.reference),
    )
  )
    return null;
  const [subject, current, confirmation, preferences] = alertTemplateCopy[digest.locale];
  const lines = digest.items.flatMap((item) => [
    item.title ? `${item.reference} — ${oneLine(item.title)}` : item.reference,
    ...(item.match === "needs_confirmation" ? [confirmation] : []),
    item.sourceUrl,
    "",
  ]);
  return { subject, text: [current, "", ...lines, preferences, digest.preferencesUrl].join("\n") };
}
