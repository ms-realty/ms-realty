// C01 / F13: invited client authentication, explicit email verification and optional passkey.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { invitations, principals } from "@/db/schema";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { accessErrorMessage, ceremonyMessages, fill, identityCopy } from "@/features/identity/copy";
import { PasskeyCeremony } from "@/features/identity/passkey-ceremony";
import { isRoutableLocale } from "@/i18n/config";
import { currentClientSession, localReturnPath } from "@/server/auth/pages";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import {
  beginClientPasskey,
  beginClientRegistration,
  completeClientPasskey,
  completeClientRegistration,
} from "./actions";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function ClientAccessPage({
  params,
  searchParams,
}: PageProps<"/client/[locale]/access">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const c = identityCopy(locale);
  const query = await searchParams;
  const returnTo = localReturnPath(
    typeof query.returnTo === "string" ? query.returnTo : null,
    "client",
    locale,
  );
  const session = await currentClientSession();
  if (session) {
    const db = getDb();
    const [principal] = await db
      .select({ email: principals.email })
      .from(principals)
      .where(eq(principals.id, session.account.id));
    const pending = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.principalId, session.account.id),
          eq(invitations.kind, "client_access"),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(30);
    return (
      <AccessFrame
        title={c.signedInTitle}
        lead={fill(c.signedInAs, { email: principal?.email ?? "" })}
      >
        <a
          href={
            returnTo && !returnTo.startsWith(`/${locale}/access`) ? returnTo : `/${locale}/overview`
          }
          className={buttonClass()}
        >
          {returnTo && !returnTo.startsWith(`/${locale}/access`)
            ? c.continueToWorkspace
            : c.clientOverview}
        </a>
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((item, index) => (
              <li key={item.id}>
                <a className="text-action underline" href={`/${locale}/invitations/${item.id}`}>
                  {c.invitationTitle} {index + 1}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <section className="flex flex-col gap-3">
          <h2 className="text-section font-semibold">{c.addPasskeyTitle}</h2>
          <p>{c.addPasskeyLead}</p>
          <PasskeyCeremony
            kind="register"
            begin={beginClientRegistration}
            complete={completeClientRegistration}
            messages={ceremonyMessages(c, c.addPasskey, {
              label: true,
              success: c.passkeyAdded,
              stepUp: c.clientStepUp,
            })}
          />
        </section>
        <SignOutForm action={`/${locale}/access/signout`} label={c.signOut} />
      </AccessFrame>
    );
  }
  const code = typeof query.error === "string" ? query.error : undefined;
  const error = code === "VALIDATION_FAILED" ? c.invalidEmail : accessErrorMessage(c, code);
  return (
    <AccessFrame
      title={query.sent === "1" ? c.linkSentTitle : c.clientAccessTitle}
      lead={query.sent === "1" ? c.linkSent : c.clientAccessLead}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form method="post" action={`/${locale}/access/request`} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <label className="flex flex-col gap-2" htmlFor="client-email">
          {c.emailLabel}
          <input
            className={controlClass}
            id="client-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            dir="ltr"
          />
        </label>
        <button className={buttonClass()} type="submit">
          {c.sendLink}
        </button>
      </form>
      <p className="text-compact text-text-muted">{c.noSelfRegistration}</p>
      <p>{c.orPasskey}</p>
      <PasskeyCeremony
        kind="authenticate"
        begin={beginClientPasskey}
        complete={completeClientPasskey.bind(null, locale, returnTo)}
        variant="secondary"
        messages={ceremonyMessages(c, c.signInWithPasskey)}
      />
    </AccessFrame>
  );
}
