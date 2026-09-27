import { notFound, redirect } from "next/navigation";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { ceremonyMessages, fill, identityCopy } from "@/features/identity/copy";
import { PasskeyCeremony } from "@/features/identity/passkey-ceremony";
import { isStaffLocale } from "@/i18n/config";
import { currentStaffAccess, staffAccessPath } from "@/server/auth/pages";
import { enrolmentWindowMs } from "@/server/auth/passkeys";
import { isFresh } from "@/server/auth/sessions";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { beginStaffPasskeyRegistration, completeStaffPasskeyRegistration } from "../actions";
export default async function EnrolPage({ params }: PageProps<"/staff/[locale]/access/enrol">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const access = await currentStaffAccess();
  if (access.state !== "enrolling" && access.state !== "ready")
    redirect(staffAccessPath(locale, access.state));
  const c = identityCopy(locale);
  const ready = access.state === "ready";
  return (
    <AccessFrame title={c.enrolTitle} lead={c.enrolLead} standalone>
      <Notice tone={ready ? "success" : "info"}>
        {ready ? c.enrolDone : fill(c.enrolProgress, { count: access.passkeys })}
      </Notice>
      {ready ? (
        <a className={buttonClass()} href={`/${locale}/today`}>
          {c.continueToWorkspace}
        </a>
      ) : isFresh(access.session, new Date(), enrolmentWindowMs) ? (
        <PasskeyCeremony
          kind="register"
          begin={beginStaffPasskeyRegistration}
          complete={completeStaffPasskeyRegistration}
          messages={ceremonyMessages(c, c.registerPasskey, {
            label: true,
            stepUp: c.enrolWindowClosed,
          })}
        />
      ) : (
        <Notice tone="warning">{c.enrolWindowClosed}</Notice>
      )}
      <SignOutForm action={`/${locale}/access/signout`} label={c.signOut} />
    </AccessFrame>
  );
}
