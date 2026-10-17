// O23 / F13 staff access: passkeys only; email is for enrollment and audited recovery.
import { notFound, redirect } from "next/navigation";
import { AccessFrame } from "@/features/identity/access-frame";
import { ceremonyMessages, identityCopy } from "@/features/identity/copy";
import { PasskeyCeremony } from "@/features/identity/passkey-ceremony";
import { privacyQueueReturn } from "@/features/privacy/access";
import { SignedOutInquiryDraftBoundary } from "@/features/work/inquiry-draft";
import { isStaffLocale } from "@/i18n/config";
import { currentStaffAccess, staffAccessPath } from "@/server/auth/pages";
import { beginStaffPasskey, completeStaffPasskey } from "./actions";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function StaffAccessPage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/access">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  // C-12: only a validated privacy queue position survives sign-in; never an action.
  const query = await searchParams;
  const returnTo = privacyQueueReturn(
    locale,
    typeof query.returnTo === "string" ? query.returnTo : null,
  );
  const access = await currentStaffAccess();
  if (access.state !== "signed_out")
    redirect(
      access.state === "ready" && returnTo ? returnTo : staffAccessPath(locale, access.state),
    );
  const c = identityCopy(locale);
  return (
    <AccessFrame title={c.staffSignInTitle} lead={c.staffSignInLead} standalone>
      <SignedOutInquiryDraftBoundary />
      <PasskeyCeremony
        kind="authenticate"
        begin={beginStaffPasskey}
        complete={completeStaffPasskey.bind(null, locale, returnTo)}
        messages={ceremonyMessages(c, c.signInWithPasskey)}
      />
      <a href={`/${locale}/access/recovery`} className="text-action underline">
        {c.lostAccessLink}
      </a>
    </AccessFrame>
  );
}
