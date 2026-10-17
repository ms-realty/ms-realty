// C02 / AT37: no private scope before the recipient authenticates; acceptance is an explicit POST.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import {
  accessErrorMessage,
  capabilityLabel,
  fill,
  identityCopy,
  roleLabel,
} from "@/features/identity/copy";
import { isRoutableLocale } from "@/i18n/config";
import { viewClientInvitation } from "@/server/auth/invitations";
import { currentClientSession } from "@/server/auth/pages";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export default async function InvitationPage({
  params,
  searchParams,
}: PageProps<"/client/[locale]/invitations/[id]">) {
  const { locale, id } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const c = identityCopy(locale);
  const session = await currentClientSession();
  const view = session
    ? await viewClientInvitation(getDb(), id, session)
    : { status: "sign_in_required" as const };
  const query = await searchParams;
  const error = typeof query.error === "string" ? accessErrorMessage(c, query.error) : null;
  return (
    <AccessFrame title={c.invitationTitle}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {view.status === "sign_in_required" ? (
        <>
          <p>{c.invitationSignIn}</p>
          <a
            className={buttonClass()}
            href={`/${locale}/access?returnTo=${encodeURIComponent(`/${locale}/invitations/${id}`)}`}
          >
            {c.confirmButton}
          </a>
        </>
      ) : "details" in view ? (
        <>
          <p>
            {fill(c.invitationFrom, {
              inviter: view.details.inviterName,
              reference: view.details.caseReference,
              title: view.details.caseTitle,
            })}
          </p>
          <p>
            {c.invitationRole}: {roleLabel(locale, view.details.role)}
          </p>
          <h2 className="font-semibold">{c.invitationAccess}</h2>
          <ul className="list-disc ps-6">
            {view.details.capabilities.map((capability) => (
              <li key={capability}>{capabilityLabel(locale, capability)}</li>
            ))}
          </ul>
          <p>
            {fill(c.invitationRecipient, {
              email: view.details.recipientEmail,
              time: view.details.expiresAt.toLocaleString(locale),
            })}
          </p>
          {view.status === "accepted" ? (
            <Notice tone="success">{c.invitationAccepted}</Notice>
          ) : (
            <form
              method="post"
              action={`/${locale}/invitations/${id}/respond`}
              className="flex flex-wrap gap-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="id" value={id} />
              <button className={buttonClass()} type="submit" name="decision" value="accept">
                {c.accept}
              </button>
              <button
                className={buttonClass("secondary")}
                type="submit"
                name="decision"
                value="decline"
              >
                {c.decline}
              </button>
            </form>
          )}
        </>
      ) : (
        <Notice tone="warning">
          {view.status === "expired"
            ? c.invitationExpired
            : view.status === "revoked"
              ? c.invitationRevoked
              : view.status === "declined"
                ? c.invitationDeclined
                : c.invitationUnavailable}
        </Notice>
      )}
      {session ? (
        <SignOutForm action={`/${locale}/access/signout`} label={c.switchAccount} />
      ) : null}
    </AccessFrame>
  );
}
