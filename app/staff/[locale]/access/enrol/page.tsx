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
  const now = new Date();
  const registration = (
    <PasskeyCeremony
      kind="register"
      begin={beginStaffPasskeyRegistration}
      complete={completeStaffPasskeyRegistration}
      variant={ready ? "secondary" : "primary"}
      messages={ceremonyMessages(c, ready ? c.registerBackupPasskey : c.registerPasskey, {
        label: true,
        stepUp: ready ? c.enrolBackupReauth : c.enrolWindowClosed,
        ...(ready ? { success: c.passkeyAdded } : {}),
      })}
    />
  );
  return (
    <AccessFrame title={ready ? c.enrolReadyTitle : c.enrolTitle} lead={c.enrolLead} standalone>
      <Notice tone={ready ? "success" : "info"}>
        {ready ? c.enrolDone : fill(c.enrolProgress, { count: access.passkeys })}
      </Notice>
      {ready ? (
        <>
          <a className={buttonClass()} href={`/${locale}/today`}>
            {c.continueToWorkspace}
          </a>
          <details className="rounded-control border border-border p-4">
            <summary className="cursor-pointer font-medium text-action">
              {c.enrolBackupTitle}
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <p>{c.enrolBackupLead}</p>
              {isFresh(access.session, now) ? (
                registration
              ) : (
                <>
                  <Notice tone="info">{c.enrolBackupReauth}</Notice>
                  <a
                    className={buttonClass("secondary")}
                    href={`/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/access/enrol`)}`}
                  >
                    {c.confirmWithPasskey}
                  </a>
                </>
              )}
            </div>
          </details>
        </>
      ) : isFresh(access.session, now, enrolmentWindowMs) ? (
        registration
      ) : (
        <Notice tone="warning">{c.enrolWindowClosed}</Notice>
      )}
      <SignOutForm action={`/${locale}/access/signout`} label={c.signOut} />
    </AccessFrame>
  );
}
