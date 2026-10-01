// Resend's fixed API, with no provider-side template fetching or arbitrary message rendering.
import "server-only";
import { z } from "zod";
import { caseEmailConfig, renderCaseEmail } from "../cases/email-contract";
import type { HostOrigins } from "../config/hosts";
import { renderSearchAlert } from "../subscriptions/template";
import type { MessageProvider, OutboundMessage, ProviderResult } from "./provider";

const authTemplates = [
  "auth.email_link",
  "auth.staff_enrolment",
  "auth.staff_recovery",
  "auth.client_invitation",
] as const;
type AuthTemplate = (typeof authTemplates)[number];
const subject = {
  bg: {
    "auth.email_link": "Вход в MS Realty",
    "auth.staff_enrolment": "Покана за екипа на MS Realty",
    "auth.staff_recovery": "Възстановяване на достъпа до MS Realty",
    "auth.client_invitation": "Покана за Вашия кабинет в MS Realty",
  },
  en: {
    "auth.email_link": "Sign in to MS Realty",
    "auth.staff_enrolment": "Your MS Realty staff invitation",
    "auth.staff_recovery": "Recover your MS Realty access",
    "auth.client_invitation": "Your MS Realty client invitation",
  },
  ru: {
    "auth.email_link": "Вход в MS Realty",
    "auth.staff_enrolment": "Приглашение в команду MS Realty",
    "auth.staff_recovery": "Восстановление доступа к MS Realty",
    "auth.client_invitation": "Приглашение в личный кабинет MS Realty",
  },
};

function authEmail(message: OutboundMessage, hosts: HostOrigins, now: Date) {
  if (
    message.channel !== "email" ||
    !authTemplates.includes(message.template as AuthTemplate) ||
    !z.email().safeParse(message.recipient).success
  )
    return null;
  const template = message.template as AuthTemplate;
  const staff = template === "auth.staff_enrolment" || template === "auth.staff_recovery";
  const language = message.params.locale;
  if (typeof language !== "string" || !/^(bg|en|ru|de|nl|el|he)$/.test(language)) return null;
  const expiresAt = message.params.expiresAt;
  if (
    typeof expiresAt !== "string" ||
    !z.iso.datetime().safeParse(expiresAt).success ||
    new Date(expiresAt) <= now
  )
    return null;
  const raw =
    template === "auth.client_invitation" ? message.params.url : message.secretParams?.url;
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const expectedPath = staff
    ? `/${language}/access/invitation`
    : template === "auth.email_link"
      ? `/${language}/access/confirm`
      : null;
  if (
    url.origin !== (staff ? hosts.staff : hosts.client) ||
    url.username ||
    url.password ||
    url.hash ||
    (expectedPath
      ? url.pathname !== expectedPath
      : !new RegExp(`^/${language}/invitations/[0-9a-f-]{36}$`).test(url.pathname))
  )
    return null;
  const displayLanguage = language === "bg" || language === "ru" ? language : "en";
  const instructions =
    displayLanguage === "bg"
      ? "Отворете връзката, за да продължите. Не я препращайте. Ако не очаквате това писмо, можете да го игнорирате."
      : displayLanguage === "ru"
        ? "Откройте ссылку, чтобы продолжить. Не пересылайте её. Если вы не ожидали это письмо, его можно проигнорировать."
        : "Open the link to continue. Do not forward it. If you were not expecting this message, you can ignore it.";
  // Plain text avoids provider tracking pixels and has no interpolated HTML or customer data.
  return {
    subject: subject[displayLanguage][template],
    text: `MS Realty\n\n${instructions}\n\n${url.toString()}\n\n${expiresAt} (UTC)`,
  };
}

/** Shared reviewed content boundary; each transport keeps its own delivery semantics. */
export function renderReviewedEmail(
  message: OutboundMessage,
  config: { from: string; hosts: HostOrigins },
  now = new Date(),
) {
  return (
    authEmail(message, config.hosts, now) ??
    renderSearchAlert(message, config.hosts) ??
    renderCaseEmail(message, caseEmailConfig()?.from === config.from ? caseEmailConfig() : null)
  );
}

export class ResendMessageProvider implements MessageProvider {
  readonly name = "resend";
  constructor(
    private readonly config: { apiKey: string; from: string; hosts: HostOrigins },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!config.apiKey.trim() || !config.from.trim() || /[\r\n]/.test(config.from))
      throw new Error("Invalid Resend configuration");
  }
  async send(message: OutboundMessage): Promise<ProviderResult> {
    const email = renderReviewedEmail(message, this.config);
    if (!email || !message.idempotencyKey || message.idempotencyKey.length > 256)
      return { status: "rejected", code: "unsupported_or_expired_message", retryable: false };
    // There is deliberately no network retry here. A timeout or ambiguous server response
    // is parked by the outbox, even though this request also carries an idempotency key.
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.recipient],
        ...email,
        tags: [{ name: "action_id", value: message.outboxId }],
      }),
    });
    if (response.status === 429)
      return { status: "rejected", code: "provider_rate_limited", retryable: true };
    if ([400, 401, 403, 404, 422].includes(response.status))
      return { status: "rejected", code: `provider_rejected_${response.status}`, retryable: false };
    if (!response.ok) throw new Error("Provider result needs reconciliation");
    const result = z.object({ id: z.uuid() }).safeParse(await response.json());
    if (!result.success) throw new Error("Provider result needs reconciliation");
    return { status: "accepted", providerMessageId: result.data.id };
  }
}
