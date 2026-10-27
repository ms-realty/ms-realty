import { expect, it } from "vitest";
import { publicLocales } from "@/domain/ids";
import { formatDateTime } from "@/i18n/format";
import { clientAuthCopy } from "./auth-copy";
import type { OutboundMessage } from "./provider";
import { renderReviewedEmail } from "./resend";

const config = {
  from: "MS Realty <access@example.test>",
  hosts: {
    public: "https://public.example.test",
    client: "https://client.example.test",
    staff: "https://staff.example.test",
  },
};
it.each(publicLocales)(
  "C01/C02 %s email uses its purpose, locale, expiry and exact allowlisted URL",
  (locale) => {
    const now = new Date("2030-01-01T00:00:00Z"),
      expiresAt = "2030-01-01T01:00:00Z";
    for (const invitation of [false, true]) {
      const url = `${config.hosts.client}/${locale}/${invitation ? "invitations/12345678-1234-4123-8123-123456789001" : "access/confirm?token=synthetic"}`;
      const message = {
        outboxId: "12345678-1234-4123-8123-123456789002",
        idempotencyKey: "synthetic-auth-copy",
        channel: "email",
        recipient: "synthetic@example.test",
        template: invitation ? "auth.client_invitation" : "auth.email_link",
        params: { locale, expiresAt, ...(invitation ? { url } : {}) },
        secretParams: invitation ? null : { url },
      } as OutboundMessage;
      const rendered = renderReviewedEmail(message, config, now),
        copy = clientAuthCopy(locale, invitation);
      expect(rendered?.subject).toBe(copy.subject);
      expect(rendered?.text).toContain(copy.instructions);
      expect(rendered?.text).toContain(url);
      expect(rendered?.text).toContain(formatDateTime(locale, expiresAt, { zoneLabel: true, now }));
      const changed = {
        ...message,
        secretParams: { url: `https://foreign.example/${locale}/access/confirm` },
        params: {
          ...message.params,
          url: `https://foreign.example/${locale}/invitations/12345678-1234-4123-8123-123456789001`,
        },
      };
      expect(renderReviewedEmail(changed, config, now)).toBeNull();
    }
  },
);
