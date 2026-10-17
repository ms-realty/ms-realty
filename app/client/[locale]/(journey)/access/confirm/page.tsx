import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { AccessFrame } from "@/features/identity/access-frame";
import { accessErrorMessage, identityCopy } from "@/features/identity/copy";
import { isRoutableLocale } from "@/i18n/config";
import { inspectEmailLink } from "@/server/auth/email-link";
import { requireAuthHost } from "@/server/auth/pages";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function ConfirmPage({
  params,
  searchParams,
}: PageProps<"/client/[locale]/access/confirm">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  await requireAuthHost("client");
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const state = token ? (await inspectEmailLink(getDb(), token)).state : "invalid";
  const c = identityCopy(locale);
  const error = typeof query.error === "string" ? accessErrorMessage(c, query.error) : null;
  const messages = {
    invalid: c.linkInvalid,
    expired: c.linkExpired,
    consumed: c.linkConsumed,
    revoked: c.linkRevoked,
  };
  return (
    <AccessFrame title={c.confirmTitle} lead={c.confirmLead}>
      {state === "valid" ? (
        <form method="post" action={`/${locale}/access/confirm/submit`}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={token} />
          <button className={buttonClass()} type="submit">
            {c.confirmButton}
          </button>
        </form>
      ) : (
        <Notice tone="warning">{error ?? messages[state]}</Notice>
      )}
      <a href={`/${locale}/access`} className="text-action underline">
        {c.requestNewLink}
      </a>
    </AccessFrame>
  );
}
