import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { accessErrorMessage, fill, identityCopy } from "@/features/identity/copy";
import { isStaffLocale } from "@/i18n/config";
import { inspectStaffInvitation } from "@/server/auth/invitations";
import { currentStaffAccess, requireAuthHost } from "@/server/auth/pages";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function InvitationPage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/access/invitation">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  await requireAuthHost("staff");
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const c = identityCopy(locale);
  const invitation = token
    ? await inspectStaffInvitation(getDb(), token)
    : { state: "invalid" as const };
  const current = await currentStaffAccess();
  if (current.state !== "signed_out" && current.session.account.id !== invitation.principalId) {
    return (
      <AccessFrame title={c.staffInvitationTitle} lead={c.invitationUnavailable} standalone>
        <SignOutForm action={`/${locale}/access/signout`} label={c.switchAccount} />
      </AccessFrame>
    );
  }
  const error = typeof query.error === "string" ? accessErrorMessage(c, query.error) : null;
  const messages = {
    invalid: c.invitationInvalid,
    expired: c.invitationExpired,
    revoked: c.invitationRevoked,
    accepted: c.invitationUsed,
    declined: c.invitationUsed,
  };
  return (
    <AccessFrame
      title={invitation.kind === "staff_recovery" ? c.staffRecoveryTitle : c.staffInvitationTitle}
      standalone
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {invitation.state === "pending" ? (
        <>
          <p>
            {fill(
              invitation.kind === "staff_recovery" ? c.staffRecoveryLead : c.staffInvitationLead,
              { email: invitation.email ?? "" },
            )}
          </p>
          <p>
            {fill(c.invitationValidUntil, {
              time: invitation.expiresAt?.toLocaleString(locale) ?? "",
            })}
          </p>
          <form method="post" action={`/${locale}/access/invitation/submit`}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={buttonClass()}>
              {c.acceptAndContinue}
            </button>
          </form>
        </>
      ) : (
        <Notice tone="warning">{messages[invitation.state]}</Notice>
      )}
      <a href={`/${locale}/access`} className="text-action underline">
        {c.backToSignIn}
      </a>
    </AccessFrame>
  );
}
