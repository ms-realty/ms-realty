// `inquiry.acknowledgement.v1` (ADR 0014): a website visitor who left an e-mail address with an
// inquiry is told at once, in the language they used on the site, that we received it. The basis
// is the visitor's own request (the form says the details are used to respond to it), not an
// account, a subscription or a consent; so the recipient is its own kind, checked by its own
// rule. Reference, the listing reference and title when the inquiry is about a published
// listing, a broker will reply, and a link to the receipt page. No response-time promise (the
// operating policy records none), no price, no address, no free text. Nothing for a phone-only
// contact. One send per inquiry.
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type PublicLocale, publicLocales, serviceNotificationEnabled } from "@/config/tenant";
import { contactMethods, type externalActions, inquiries } from "@/db/schema";
import { getEnv } from "../config/env";
import type { HostOrigins } from "../config/hosts";
import type { Executor } from "../db";
import { enqueueMessage } from "../jobs/outbox";
import type { OutboundMessage } from "../jobs/provider";
import { privacyProcessingRestricted } from "../privacy/restrictions";
import { clientNoticeCopy } from "./copy";
import { type NoticeLayout, noticeHtml, noticeText } from "./layout";

export const inquiryAcknowledgementTemplate = "inquiry.acknowledgement.v1" as const;
export const inquiryAcknowledgementSubject = "inquiry_acknowledgement" as const;

export interface AcknowledgementCopy {
  readonly subject: string;
  readonly about: string;
  readonly reply: string;
  readonly action: string;
  readonly sameBrowser: string;
  readonly footer: string;
}

// The button opens the receipt page, whose title is «Inquiry received» in each locale.
export const inquiryAcknowledgementCopy: Readonly<Record<PublicLocale, AcknowledgementCopy>> = {
  bg: {
    subject: "Получихме запитването Ви",
    about: "Отнася се за {listing}.",
    reply: "Брокер ще Ви отговори.",
    action: "Отворете запитването",
    sameBrowser: "Връзката работи в браузъра, от който изпратихте запитването.",
    footer:
      "Получавате този имейл, защото ни изпратихте запитване с този адрес. Ако не сте били Вие, можете да го игнорирате.",
  },
  en: {
    subject: "We received your inquiry",
    about: "It is about {listing}.",
    reply: "A broker will reply to you.",
    action: "Open your inquiry",
    sameBrowser: "The link works in the browser you used to send it.",
    footer:
      "You receive this email because you sent us an inquiry with this address. If that was not you, you can ignore it.",
  },
  ru: {
    subject: "Мы получили ваш запрос",
    about: "Он касается объекта {listing}.",
    reply: "Брокер ответит вам.",
    action: "Открыть запрос",
    sameBrowser: "Ссылка работает в браузере, из которого вы отправили запрос.",
    footer:
      "Вы получили это письмо, потому что отправили нам запрос с этим адресом. Если это были не вы, просто проигнорируйте его.",
  },
  de: {
    subject: "Wir haben Ihre Anfrage erhalten",
    about: "Sie betrifft {listing}.",
    reply: "Ein Makler wird Ihnen antworten.",
    action: "Anfrage öffnen",
    sameBrowser: "Der Link funktioniert in dem Browser, mit dem Sie die Anfrage gesendet haben.",
    footer:
      "Sie erhalten diese E-Mail, weil Sie uns mit dieser Adresse eine Anfrage geschickt haben. Falls das nicht Sie waren, können Sie sie ignorieren.",
  },
  nl: {
    subject: "We hebben uw aanvraag ontvangen",
    about: "Het gaat over {listing}.",
    reply: "Een makelaar neemt contact met u op.",
    action: "Aanvraag openen",
    sameBrowser: "De link werkt in de browser waarmee u de aanvraag hebt verstuurd.",
    footer:
      "U ontvangt deze e-mail omdat u ons met dit adres een aanvraag hebt gestuurd. Was u dat niet, dan kunt u deze e-mail negeren.",
  },
  el: {
    subject: "Λάβαμε το ερώτημά σας",
    about: "Αφορά το {listing}.",
    reply: "Ένας μεσίτης θα σας απαντήσει.",
    action: "Άνοιγμα ερωτήματος",
    sameBrowser: "Ο σύνδεσμος λειτουργεί στον browser από τον οποίο στείλατε το ερώτημα.",
    footer:
      "Λαμβάνετε αυτό το email επειδή μας στείλατε ερώτημα με αυτή τη διεύθυνση. Αν δεν ήσασταν εσείς, μπορείτε να το αγνοήσετε.",
  },
  he: {
    subject: "קיבלנו את הפנייה שלכם",
    about: "היא עוסקת ב־{listing}.",
    reply: "מתווך יחזור אליכם.",
    action: "פתיחת הפנייה",
    sameBrowser: "הקישור עובד בדפדפן שממנו שלחתם את הפנייה.",
    footer:
      "קיבלתם אימייל זה כי שלחתם אלינו פנייה עם הכתובת הזו. אם זה לא הייתם אתם, אפשר להתעלם ממנו.",
  },
};

const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(200)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a listing title is one plain line.
  .regex(/^[^\u0000-\u001f\u007f‪-‮⁦-⁩<>]+$/);

export const acknowledgementParams = z
  .object({
    schemaVersion: z.literal(1),
    inquiryId: z.uuid(),
    reference: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
    locale: z.enum(publicLocales),
    receiptUrl: z.url(),
    listing: z
      .object({ reference: z.string().regex(/^[A-Za-z0-9-]{1,80}$/), title: singleLine.nullable() })
      .strict()
      .nullable(),
    /** The visitor, identified by the contact route they typed into the inquiry form. */
    recipient: z
      .object({ kind: z.literal("inquirer"), partyId: z.uuid(), contactMethodId: z.uuid() })
      .strict(),
  })
  .strict();
export type AcknowledgementParams = z.infer<typeof acknowledgementParams>;
const acknowledgementPayload = z
  .object({
    channel: z.literal("email"),
    recipient: z.email(),
    template: z.literal(inquiryAcknowledgementTemplate),
    params: acknowledgementParams,
  })
  .strict();

export function inquiryReceiptUrl(hosts: Pick<HostOrigins, "public">, locale: string, key: string) {
  return new URL(`/${locale}/requests/${encodeURIComponent(key)}`, hosts.public).href;
}
export const inquiryAcknowledgementKey = (inquiryId: string) =>
  `${inquiryAcknowledgementTemplate}:${inquiryId}`;

/**
 * Queues the acknowledgement in the intake transaction. Returns null when none is owed: the
 * switch is off, the contact is not an e-mail address, or the submission is held as suspected
 * automation (an unreviewed address never receives mail from such a submission).
 */
export async function acknowledgeInquiry(
  db: Executor,
  inquiry: typeof inquiries.$inferSelect,
  listing: { reference: string; title: string | null } | null,
  hosts: HostOrigins = getEnv().hosts,
) {
  if (!serviceNotificationEnabled("inquiry.acknowledged")) return null;
  if (inquiry.state === "suspected_spam" || !inquiry.contactMethodId || !inquiry.partyId)
    return null;
  const [contact] = await db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.id, inquiry.contactMethodId));
  if (contact?.kind !== "email" || !z.email().safeParse(contact.value).success) return null;
  const locale = (publicLocales as readonly string[]).includes(inquiry.preferredLocale ?? "")
    ? (inquiry.preferredLocale as PublicLocale)
    : null;
  if (!locale) return null;
  const title = listing?.title ? singleLine.safeParse(listing.title.replace(/\s+/g, " ")) : null;
  const params = acknowledgementParams.parse({
    schemaVersion: 1,
    inquiryId: inquiry.id,
    reference: inquiry.reference,
    locale,
    receiptUrl: inquiryReceiptUrl(hosts, locale, inquiry.submissionKey),
    listing: listing
      ? { reference: listing.reference, title: title?.success ? title.data : null }
      : null,
    recipient: { kind: "inquirer", partyId: inquiry.partyId, contactMethodId: contact.id },
  });
  return enqueueMessage(db, {
    idempotencyKey: inquiryAcknowledgementKey(inquiry.id),
    channel: "email",
    recipient: contact.value,
    template: inquiryAcknowledgementTemplate,
    params,
    subject: { type: inquiryAcknowledgementSubject, id: inquiry.id },
  });
}

export function isInquiryAcknowledgement(row: { subjectType: string | null; payload: unknown }) {
  return (
    row.subjectType === inquiryAcknowledgementSubject ||
    (row.payload as { template?: unknown } | null)?.template === inquiryAcknowledgementTemplate
  );
}

/** Send-time rule for the inquirer: null when it may be sent, else the cancellation reason. */
export async function acknowledgementBlocker(
  db: Executor,
  row: typeof externalActions.$inferSelect,
  hosts: HostOrigins = getEnv().hosts,
): Promise<string | null> {
  const parsed = acknowledgementPayload.safeParse(row.payload);
  if (
    !parsed.success ||
    row.kind !== "email_send" ||
    row.subjectType !== inquiryAcknowledgementSubject ||
    row.subjectId !== parsed.data.params.inquiryId ||
    row.secretPayload !== null ||
    row.effectKey !== inquiryAcknowledgementKey(parsed.data.params.inquiryId)
  )
    return "inquiry_ack_invalid";
  const p = parsed.data.params;
  if (!serviceNotificationEnabled("inquiry.acknowledged")) return "inquiry_ack_disabled";
  const [inquiry] = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.id, p.inquiryId))
    .for("share");
  if (
    !inquiry ||
    inquiry.reference !== p.reference ||
    inquiry.partyId !== p.recipient.partyId ||
    inquiry.contactMethodId !== p.recipient.contactMethodId ||
    p.receiptUrl !== inquiryReceiptUrl(hosts, p.locale, inquiry.submissionKey)
  )
    return "inquiry_ack_invalid";
  if (inquiry.state === "suspected_spam") return "inquiry_ack_held";
  const [contact] = await db
    .select()
    .from(contactMethods)
    .where(
      and(
        eq(contactMethods.id, p.recipient.contactMethodId),
        eq(contactMethods.partyId, p.recipient.partyId),
      ),
    );
  if (contact?.kind !== "email" || contact.value !== parsed.data.recipient)
    return "inquiry_ack_contact_changed";
  if (await privacyProcessingRestricted(db, p.recipient.partyId, "inquiry"))
    return "inquiry_ack_restricted";
  return null;
}

export function renderInquiryAcknowledgement(
  message: OutboundMessage,
  config: { hosts: HostOrigins; html?: boolean },
) {
  const parsed = acknowledgementPayload.safeParse({
    channel: message.channel,
    recipient: message.recipient,
    template: message.template,
    params: message.params,
  });
  if (!parsed.success || message.secretParams || message.files?.length) return null;
  const p = parsed.data.params;
  if (!p.receiptUrl.startsWith(`${config.hosts.public}/${p.locale}/requests/`)) return null;
  const copy = inquiryAcknowledgementCopy[p.locale];
  const listing = p.listing
    ? p.listing.title
      ? `${p.listing.reference} ${p.listing.title}`
      : p.listing.reference
    : null;
  const layout: NoticeLayout = {
    locale: p.locale,
    subject: `${copy.subject} (${p.reference})`,
    headline: copy.subject,
    paragraphs: [
      ...(listing ? [copy.about.replace("{listing}", listing)] : []),
      copy.reply,
      copy.sameBrowser,
    ],
    action: { label: copy.action, url: p.receiptUrl },
    reference: { label: clientNoticeCopy[p.locale].frame.reference, value: p.reference },
    footer: copy.footer,
  };
  return {
    subject: layout.subject,
    text: noticeText(layout),
    ...(config.html === false ? {} : { html: noticeHtml(layout) }),
  };
}
